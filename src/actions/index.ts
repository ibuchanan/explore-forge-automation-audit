import api, { fetch, route } from "@forge/api";

export async function getRuleForAutomation(
  payload: unknown,
  context: ActionContext,
) {
  return {
    definition: JSON.stringify(await getAutomationRule(payload, context)),
  };
}

type ActionContext = {
  installContext: string;
  principal?: { accountId: string };
};

export async function getAutomationRule(
  payload: unknown,
  context: ActionContext,
): Promise<unknown> {
  const ruleUuid = (payload as { ruleUuid?: unknown } | null)?.ruleUuid;
  if (
    typeof ruleUuid !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(ruleUuid)
  ) {
    throw new Error("A rule UUID is required");
  }
  const cloudId = /^ari:cloud:jira::site\/([0-9a-f-]{36})$/i.exec(
    context.installContext,
  )?.[1];
  if (!context.principal?.accountId || !cloudId) {
    throw new Error("A signed-in Jira site context is required");
  }
  const permissions = await api
    .asUser()
    .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
      headers: { Accept: "application/json" },
    })
    .then(async (response) => {
      if (!response.ok) throw new Error();
      return (await response.json()) as {
        permissions?: { ADMINISTER?: { havePermission?: boolean } };
      };
    })
    .catch(() => {
      throw new Error("Unable to verify Jira administrator permission");
    });
  if (permissions.permissions?.ADMINISTER?.havePermission !== true) {
    throw new Error("Jira administrator permission is required");
  }
  const email = process.env["AUTOMATION_API_EMAIL"]?.trim();
  const token = process.env["AUTOMATION_API_TOKEN"]?.trim();
  if (!email || !token) {
    throw new Error(
      "Configure AUTOMATION_API_EMAIL and AUTOMATION_API_TOKEN in Forge environment variables",
    );
  }
  const credential = Buffer.from(`${email}:${token}`).toString("base64");
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
    throw new Error("Unable to reach the Automation API");
  });
  if (!response.ok) {
    throw new Error(`Automation API request failed (HTTP ${response.status})`);
  }
  const body = (await response.json().catch(() => {
    throw new Error("Automation API returned an invalid rule definition");
  })) as { rule?: { uuid?: unknown } } | null;
  const rule = body?.rule;
  if (!rule || typeof rule !== "object" || rule.uuid !== ruleUuid) {
    throw new Error("Automation API returned an invalid rule definition");
  }
  return rule;
}
