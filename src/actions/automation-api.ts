import { fetch } from "@forge/api";
import type { operations } from "@forge-ahead/atlassian-api-types/automation";
import { type ProblemDetails, type Result, ok } from "@forge-ahead/errors";
import { fail, log, requestJson } from "./support";

type RuleConfigResponse =
  operations["getRuleByUuid"]["responses"][200]["content"]["application/json"];

const UUID = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const RULE_UUID = new RegExp(`^${UUID}$`, "i");
const SITE_ARI = new RegExp(`^ari:cloud:jira::site/(${UUID})$`, "i");

const invalidDefinition = {
  status: 502,
  message: "Automation API returned an invalid rule definition",
};

export type ActionContext = {
  installContext: string;
  principal?: { accountId: string };
};

/** Validate the untrusted action input and the signed Forge context. */
export function parseRequest(
  payload: unknown,
  context: ActionContext,
): Result<{ cloudId: string; ruleUuid: string }, ProblemDetails> {
  const ruleUuid =
    typeof payload === "object" && payload !== null && "ruleUuid" in payload
      ? payload.ruleUuid
      : undefined;
  if (typeof ruleUuid !== "string" || !RULE_UUID.test(ruleUuid)) {
    return fail("warn", 400, "A rule UUID is required", {
      event: "action.rejected",
      reason: "invalid_rule_uuid",
    });
  }
  const cloudId = SITE_ARI.exec(context.installContext)?.[1];
  if (!context.principal?.accountId || !cloudId) {
    return fail("warn", 401, "A signed-in Jira site context is required", {
      event: "action.rejected",
      reason: "invalid_context",
    });
  }
  return ok({ cloudId, ruleUuid });
}

/** Build the Basic Authorization header from the shared Automation API credential. */
export function loadAuthorization(): Result<string, ProblemDetails> {
  const email = process.env["AUTOMATION_API_EMAIL"]?.trim();
  const token = process.env["AUTOMATION_API_TOKEN"]?.trim();
  if (!email || !token) {
    return fail(
      "error",
      500,
      "Configure AUTOMATION_API_EMAIL and AUTOMATION_API_TOKEN in Forge environment variables",
      {
        event: "credentials.missing",
        hasEmail: Boolean(email),
        hasToken: Boolean(token),
      },
    );
  }
  return ok(`Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`);
}

export async function fetchRule(
  cloudId: string,
  ruleUuid: string,
  authorization: string,
): Promise<Result<unknown, ProblemDetails>> {
  const started = Date.now();
  const body = await requestJson<RuleConfigResponse>(
    () =>
      fetch(
        `https://api.atlassian.com/automation/public/jira/${cloudId}/rest/v1/rule/${ruleUuid}`,
        {
          method: "GET",
          headers: { Accept: "application/json", Authorization: authorization },
          redirect: "error",
        },
      ),
    {
      op: "rule.fetch",
      label: "Automation API request",
      fields: { authMode: "apiToken" },
      failures: {
        request: { status: 502, message: "Unable to reach the Automation API" },
        // Do not use validateHttpResponse: even bounded upstream bodies can contain secrets.
        http: (status) => ({
          status,
          message: `Automation API request failed (HTTP ${status})`,
        }),
        json: invalidDefinition,
      },
    },
  );
  if (body.isErr()) return body;
  const rule = body.value?.rule;
  if (!rule || typeof rule !== "object" || rule.uuid !== ruleUuid) {
    return fail("error", invalidDefinition.status, invalidDefinition.message, {
      event: "rule.fetch.failed",
      stage: "definition",
    });
  }
  log.info(
    { event: "rule.fetch.completed", durationMs: Date.now() - started },
    "Rule definition retrieved",
  );
  return ok(rule);
}
