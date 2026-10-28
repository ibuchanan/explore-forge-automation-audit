import api, { fetch, route } from "@forge/api";
import { createForgeLogger } from "@forge-ahead/logging";

const log = createForgeLogger({ name: "automation-rule" });

/** Return the rule as a JSON-string output for subsequent Automation steps. */
export async function getRuleForAutomation(
  payload: unknown,
  context: ActionContext,
) {
  const definition = JSON.stringify(await getAutomationRule(payload, context));
  log.info(
    { event: "automation.output.ready" },
    "Automation definition output prepared",
  );
  return { definition };
}

type ActionContext = {
  installContext: string;
  principal?: { accountId: string };
};

/** Retrieve a rule using the shared credential only after authorizing the caller. */
export async function getAutomationRule(
  payload: unknown,
  context: ActionContext,
): Promise<unknown> {
  const started = Date.now();
  log.info(
    {
      event: "action.started",
      hasPrincipal: Boolean(context.principal?.accountId),
    },
    "Rule retrieval started",
  );
  const ruleUuid = (payload as { ruleUuid?: unknown } | null)?.ruleUuid;
  if (
    typeof ruleUuid !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(ruleUuid)
  ) {
    log.warn(
      { event: "action.rejected", reason: "invalid_rule_uuid" },
      "Invalid rule UUID",
    );
    throw new Error("A rule UUID is required");
  }
  const cloudId = /^ari:cloud:jira::site\/([0-9a-f-]{36})$/i.exec(
    context.installContext,
  )?.[1];
  if (!context.principal?.accountId || !cloudId) {
    log.warn(
      { event: "action.rejected", reason: "invalid_context" },
      "Missing trusted user or site context",
    );
    throw new Error("A signed-in Jira site context is required");
  }
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
  const permissions = await api
    .asUser()
    .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
      headers: { Accept: "application/json" },
    })
    .then(async (response) => {
      status = response.status;
      stage = "http";
      if (!response.ok) throw new Error();
      stage = "json";
      return (await response.json()) as {
        permissions?: { ADMINISTER?: { havePermission?: boolean } };
      } | null;
    })
    .catch((error: unknown) => {
      const code = (error as { code?: unknown } | null)?.code;
      // Only controlled identifiers are safe: raw exceptions can contain credentials.
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
      throw new Error("Unable to verify Jira administrator permission");
    });
  if (permissions?.permissions?.ADMINISTER?.havePermission !== true) {
    log.warn(
      { event: "permission.check.denied", permission: "ADMINISTER" },
      "Caller lacks Jira administrator permission",
    );
    throw new Error("Jira administrator permission is required");
  }
  log.info(
    { event: "permission.check.allowed", permission: "ADMINISTER" },
    "Caller authorized",
  );
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
    throw new Error(
      "Configure AUTOMATION_API_EMAIL and AUTOMATION_API_TOKEN in Forge environment variables",
    );
  }
  const credential = Buffer.from(`${email}:${token}`).toString("base64");
  log.info(
    { event: "rule.fetch.started", authMode: "apiToken" },
    "Fetching rule from Automation API",
  );
  const response = await fetch(
    `https://api.atlassian.com/automation/public/jira/${cloudId}/rest/v1/rule/${ruleUuid}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${credential}`,
      },
      redirect: "error",
    },
  ).catch(() => {
    log.error(
      { event: "rule.fetch.failed", stage: "request" },
      "Unable to reach Automation API",
    );
    throw new Error("Unable to reach the Automation API");
  });
  log.info(
    { event: "rule.fetch.response", status: response.status },
    "Automation API responded",
  );
  if (!response.ok) {
    log.error(
      { event: "rule.fetch.failed", stage: "http", status: response.status },
      "Automation API request failed",
    );
    throw new Error(`Automation API request failed (HTTP ${response.status})`);
  }
  const body = (await response.json().catch(() => {
    log.error(
      { event: "rule.fetch.failed", stage: "json" },
      "Invalid Automation API JSON response",
    );
    throw new Error("Automation API returned an invalid rule definition");
  })) as { rule?: { uuid?: unknown } } | null;
  const rule = body?.rule;
  if (!rule || typeof rule !== "object" || rule.uuid !== ruleUuid) {
    log.error(
      { event: "rule.fetch.failed", stage: "definition" },
      "Missing or mismatched rule definition",
    );
    throw new Error("Automation API returned an invalid rule definition");
  }
  log.info(
    { event: "rule.fetch.completed", durationMs: Date.now() - started },
    "Rule definition retrieved",
  );
  return rule;
}
