import { beforeEach, expect, it, vi } from "vitest";

const { requestJira, fetch } = vi.hoisted(() => ({
  requestJira: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@forge/api", () => ({
  default: { asUser: () => ({ requestJira }) },
  fetch,
  route: (strings: TemplateStringsArray, ...values: string[]) =>
    String.raw({ raw: strings }, ...values),
}));

import { getAutomationRule } from "../src/actions";

const cloudId = "182b9218-d56a-453d-9659-3f29ea2aa7eb";
const ruleUuid = "0192e5ac-0e25-71de-ba7b-d972e6a2049a";
const context = {
  installContext: `ari:cloud:jira::site/${cloudId}`,
  principal: { accountId: "admin" },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTOMATION_API_EMAIL", "automation@example.com");
  vi.stubEnv("AUTOMATION_API_TOKEN", "test-token");
  requestJira.mockResolvedValue({
    ok: true,
    json: async () => ({
      permissions: { ADMINISTER: { havePermission: true } },
    }),
  });
});

it.each([
  undefined,
  null,
  {},
  { ruleUuid: 123 },
  { ruleUuid: "" },
  { ruleUuid: "../../other" },
])("rejects invalid rule input %j before any API call", async (payload) => {
  await expect(getAutomationRule(payload, context)).rejects.toThrow(
    "A rule UUID is required",
  );
  expect(requestJira).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { installContext: `ari:cloud:jira::site/${cloudId}` },
  { ...context, installContext: "ari:cloud:confluence::site/other-site" },
  { ...context, installContext: "ari:cloud:jira::site/../../other" },
])(
  "rejects missing users and invalid installation context %j",
  async (invalidContext) => {
    await expect(
      getAutomationRule({ ruleUuid }, invalidContext),
    ).rejects.toThrow("A signed-in Jira site context is required");
    expect(fetch).not.toHaveBeenCalled();
    expect(requestJira).not.toHaveBeenCalled();
  },
);

it.each(["AUTOMATION_API_EMAIL", "AUTOMATION_API_TOKEN"])(
  "reports missing %s without making a token-authenticated request",
  async (name) => {
    vi.stubEnv(name, "");
    await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
      "Configure AUTOMATION_API_EMAIL and AUTOMATION_API_TOKEN in Forge environment variables",
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each([401, 403, 404, 429, 500])(
  "reports Automation HTTP %i without exposing the response body",
  async (status) => {
    fetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ secret: "test-token" }),
    });
    await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
      `Automation API request failed (HTTP ${status})`,
    );
  },
);

it("does not leak transport errors containing credentials", async () => {
  fetch.mockRejectedValue(new Error("Authorization: Basic test-token"));
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    /^Unable to reach the Automation API$/,
  );
});

it.each([
  null,
  {},
  { rule: null },
  { rule: [] },
  { rule: { uuid: "other-rule" } },
])("rejects an invalid rule response %j", async (body) => {
  fetch.mockResolvedValue({ ok: true, json: async () => body });
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    "Automation API returned an invalid rule definition",
  );
});

it("fails closed when Jira permission verification is unavailable", async () => {
  requestJira.mockResolvedValue({
    ok: false,
    json: async () => {
      throw new Error("upstream details");
    },
  });
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    /^Unable to verify Jira administrator permission$/,
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects non-JSON responses without returning upstream details", async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => {
      throw new Error("sensitive body");
    },
  });
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    /^Automation API returned an invalid rule definition$/,
  );
});

it("denies non-administrators before using the API token", async () => {
  requestJira.mockResolvedValue({
    ok: true,
    json: async () => ({
      permissions: { ADMINISTER: { havePermission: false } },
    }),
  });
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    "Jira administrator permission is required",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("returns the rule definition to Rovo without connection credentials", async () => {
  const rule = {
    uuid: ruleUuid,
    name: "Notify on creation",
    trigger: { type: "jira.issue.event.trigger:created", value: {} },
    components: [
      { component: "ACTION", type: "jira.issue.comment", value: "Hi" },
    ],
  };
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ rule, connections: [{ secret: "must-not-return" }] }),
  });

  await expect(getAutomationRule({ ruleUuid }, context)).resolves.toEqual(rule);
  expect(requestJira).toHaveBeenCalledWith(
    "/rest/api/3/mypermissions?permissions=ADMINISTER",
    { headers: { Accept: "application/json" } },
  );
  expect(fetch).toHaveBeenCalledWith(
    `https://api.atlassian.com/automation/public/jira/${cloudId}/rest/v1/rule/${ruleUuid}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Basic YXV0b21hdGlvbkBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu",
      },
      redirect: "error",
    },
  );
});
