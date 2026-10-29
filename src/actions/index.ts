import { randomUUID } from "node:crypto";
import {
  type ProblemDetails,
  type Result,
  err,
  problemDetails,
} from "@forge-ahead/errors";
import {
  withForgeInvocationLogging,
  withLogContext,
} from "@forge-ahead/logging";
import {
  type ActionContext,
  fetchRule,
  loadAuthorization,
  parseRequest,
} from "./automation-api";
import { requireJiraAdministrator } from "./permissions";
import { errorPolicy, log } from "./support";

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
  return runAction("get-automation-rule", payload, context);
}

async function runAction<T = unknown>(
  action: string,
  payload: unknown,
  context: ActionContext,
  output: (rule: unknown) => T = (rule) => rule as T,
): Promise<T> {
  return withLogContext({ action, requestId: randomUUID() }, async () => {
    log.info({ event: "action.started" }, "Rule retrieval started");
    const result = await withForgeInvocationLogging(
      log,
      {},
      async (): Promise<Result<T, ProblemDetails>> => {
        try {
          return (await retrieveRule(payload, context)).map(output);
        } catch {
          // Never normalize raw exceptions: messages and causes can contain secrets.
          return err(
            problemDetails(500, "Unexpected failure while retrieving the rule"),
          );
        }
      },
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

async function retrieveRule(
  payload: unknown,
  context: ActionContext,
): Promise<Result<unknown, ProblemDetails>> {
  const request = parseRequest(payload, context);
  if (request.isErr()) return request;
  const permission = await requireJiraAdministrator();
  if (permission.isErr()) return permission;
  const authorization = loadAuthorization();
  if (authorization.isErr()) return authorization;
  return fetchRule(
    request.value.cloudId,
    request.value.ruleUuid,
    authorization.value,
  );
}
