import api, { route } from "@forge/api";
import type { operations } from "@forge-ahead/atlassian-api-types/jira-platform-3";
import { type ProblemDetails, type Result, err, ok } from "@forge-ahead/errors";
import { fail, log, requestJson } from "./support";

const permission = "ADMINISTER";
const unverified = {
  status: 502,
  message: "Unable to verify Jira administrator permission",
};

type MyPermissions =
  operations["getMyPermissions"]["responses"][200]["content"]["application/json"];

/** The shared API token does not enforce the caller's permissions, so check them as the caller. */
export async function requireJiraAdministrator(): Promise<
  Result<void, ProblemDetails>
> {
  const body = await requestJson<MyPermissions>(
    () =>
      api
        .asUser()
        .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
          headers: { Accept: "application/json" },
        }),
    {
      op: "permission.check",
      label: "Jira permission check",
      fields: { permission, authMode: "asUser" },
      failures: {
        request: unverified,
        http: () => unverified,
        json: unverified,
      },
    },
  );
  if (body.isErr()) return err(body.error);
  if (body.value?.permissions?.[permission]?.havePermission !== true) {
    return fail("warn", 403, "Jira administrator permission is required", {
      event: "permission.check.denied",
      permission,
    });
  }
  log.info(
    { event: "permission.check.allowed", permission },
    "Caller authorized",
  );
  return ok(undefined);
}
