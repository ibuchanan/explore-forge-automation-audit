import { randomUUID } from "node:crypto";
import api, { fetch, route } from "@forge/api";
import {
  type ProblemDetails,
  type Result,
  ResultAsync,
  StandardError,
  ok,
  problemDetails,
} from "@forge-ahead/errors";
import {
  createForgeLogger,
  defineLogObjectSummaryPolicy,
  withForgeInvocationLogging,
  withLogContext,
} from "@forge-ahead/logging";

const log = createForgeLogger({ name: "automation-rule" });
const errorPolicy = defineLogObjectSummaryPolicy({
  kind: "actionProblem",
  fields: { type: "type", status: "status", detail: "detail" },
});

type ActionContext = {
  installContext: string;
  principal?: { accountId: string };
};

/** Return the rule as a JSON-string output for subsequent Automation steps. */
export async function getRuleForAutomation(
  payload: unknown,
  context: ActionContext,
) {
  return runAction("get-rule-automation", payload, context, (rule) => {
    const definition = JSON.stringify(rule);
    log.info(
      { event: "automation.output.ready" },
      "Automation definition output prepared",
    );
    return { definition };
  });
}

/** Retrieve a rule using the shared credential only after authorizing the caller. */
export async function getAutomationRule(
  payload: unknown,
  context: ActionContext,
): Promise<unknown> {
  return runAction("get-automation-rule", payload, context, (rule) => rule);
}

async function runAction<T>(
  action: string,
  payload: unknown,
  context: ActionContext,
  output: (rule: unknown) => T,
): Promise<T> {
  return withLogContext({ action, requestId: randomUUID() }, async () => {
    log.info({ event: "action.started" }, "Rule retrieval started");
    const result = await withForgeInvocationLogging(
      log,
      {},
      () =>
        ResultAsync.fromPromise(
          (async () => (await retrieveRule(payload, context)).map(output))(),
          // Never normalize raw exceptions: messages and causes can contain secrets.
          () =>
            problemDetails(500, "Unexpected failure while retrieving the rule"),
        ).andThen((result) => result),
      {
        errorPolicy,
        successMessage: "Action completed",
        errorMessage: "Action failed",
      },
    );
    return result.match(
      (value) => value,
      (problem) => {
        // Forge must receive a rejection, not a successful action output containing Err.
        throw new Error(problem.detail ?? problem.title, { cause: problem });
      },
    );
  });
}

async function requireJiraAdministrator(): Promise<
  Result<void, ProblemDetails>
> {
  // The shared API token does not enforce the caller's permissions.
  log.info(
    {
      event: "permission.check.started",
      permission: "ADMINISTER",
      authMode: "asUser",
    },
    "Checking caller's Jira permission",
  );
  let stage = "request";
  let status: number | undefined;
  const permissions = await ResultAsync.fromPromise(
    (async () => {
      const response = await api
        .asUser()
        .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
          headers: { Accept: "application/json" },
        });
      status = response.status;
      stage = "http";
      if (!response.ok) return null;
      stage = "json";
      return (await response.json()) as {
        permissions?: { ADMINISTER?: { havePermission?: boolean } };
      } | null;
    })(),
    (error: unknown) => {
      const code = (error as { code?: unknown } | null)?.code;
      const errorCode =
        code === "NEEDS_AUTHENTICATION_ERR" || code === "AUTH_TYPE_UNAVAILABLE"
          ? code
          : "UNCLASSIFIED";
      log.error(
        {
          event: "permission.check.failed",
          stage,
          status,
          permission: "ADMINISTER",
          errorCode,
        },
        "Unable to verify Jira administrator permission",
      );
      return problemDetails(
        502,
        "Unable to verify Jira administrator permission",
      );
    },
  );
  if (permissions.isErr()) return permissions.map(() => undefined);
  if (stage === "http") {
    log.error(
      {
        event: "permission.check.failed",
        stage,
        status,
        permission: "ADMINISTER",
      },
      "Unable to verify Jira administrator permission",
    );
    return StandardError.getOrDefault(502).error(
      "Unable to verify Jira administrator permission",
    );
  }
  if (permissions.value?.permissions?.ADMINISTER?.havePermission !== true) {
    log.warn(
      { event: "permission.check.denied", permission: "ADMINISTER" },
      "Caller lacks Jira administrator permission",
    );
    return StandardError.getOrDefault(403).error(
      "Jira administrator permission is required",
    );
  }
  log.info(
    { event: "permission.check.allowed", permission: "ADMINISTER" },
    "Caller authorized",
  );
  return ok(undefined);
}

async function retrieveRule(
  payload: unknown,
  context: ActionContext,
): Promise<Result<unknown, ProblemDetails>> {
  const started = Date.now();
  const ruleUuid = (payload as { ruleUuid?: unknown } | null)?.ruleUuid;
  if (
    typeof ruleUuid !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(ruleUuid)
  ) {
    log.warn(
      { event: "action.rejected", reason: "invalid_rule_uuid" },
      "Invalid rule UUID",
    );
    return StandardError.getOrDefault(400).error("A rule UUID is required");
  }
  const cloudId = /^ari:cloud:jira::site\/([0-9a-f-]{36})$/i.exec(
    context?.installContext,
  )?.[1];
  if (!context?.principal?.accountId || !cloudId) {
    log.warn(
      { event: "action.rejected", reason: "invalid_context" },
      "Missing trusted user or site context",
    );
    return StandardError.getOrDefault(401).error(
      "A signed-in Jira site context is required",
    );
  }
  const permission = await requireJiraAdministrator();
  if (permission.isErr()) return permission;
  const email = process.env["AUTOMATION_API_EMAIL"]?.trim();
  const token = process.env["AUTOMATION_API_TOKEN"]?.trim();
  if (!email || !token) {
    log.error(
      {
        event: "credentials.missing",
        hasEmail: Boolean(email),
        hasToken: Boolean(token),
      },
      "Automation API credentials are not configured",
    );
    return StandardError.getOrDefault(500).error(
      "Configure AUTOMATION_API_EMAIL and AUTOMATION_API_TOKEN in Forge environment variables",
    );
  }
  const credential = Buffer.from(`${email}:${token}`).toString("base64");
  log.info(
    { event: "rule.fetch.started", authMode: "apiToken" },
    "Fetching rule from Automation API",
  );
  const response = await ResultAsync.fromPromise(
    fetch(
      `https://api.atlassian.com/automation/public/jira/${cloudId}/rest/v1/rule/${ruleUuid}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${credential}`,
        },
        redirect: "error",
      },
    ),
    () => {
      log.error(
        { event: "rule.fetch.failed", stage: "request" },
        "Unable to reach Automation API",
      );
      return problemDetails(502, "Unable to reach the Automation API");
    },
  );
  if (response.isErr()) return response;
  log.info(
    { event: "rule.fetch.response", status: response.value.status },
    "Automation API responded",
  );
  if (!response.value.ok) {
    log.error(
      {
        event: "rule.fetch.failed",
        stage: "http",
        status: response.value.status,
      },
      "Automation API request failed",
    );
    // Do not use validateHttpResponse: even bounded upstream bodies can contain secrets.
    return StandardError.getOrDefault(response.value.status).error(
      `Automation API request failed (HTTP ${response.value.status})`,
    );
  }
  const body = await ResultAsync.fromPromise(
    response.value.json() as Promise<{ rule?: { uuid?: unknown } } | null>,
    () => {
      log.error(
        { event: "rule.fetch.failed", stage: "json" },
        "Invalid Automation API JSON response",
      );
      return problemDetails(
        502,
        "Automation API returned an invalid rule definition",
      );
    },
  );
  if (body.isErr()) return body;
  const rule = body.value?.rule;
  if (!rule || typeof rule !== "object" || rule.uuid !== ruleUuid) {
    log.error(
      { event: "rule.fetch.failed", stage: "definition" },
      "Missing or mismatched rule definition",
    );
    return StandardError.getOrDefault(502).error(
      "Automation API returned an invalid rule definition",
    );
  }
  log.info(
    { event: "rule.fetch.completed", durationMs: Date.now() - started },
    "Rule definition retrieved",
  );
  return ok(rule);
}
