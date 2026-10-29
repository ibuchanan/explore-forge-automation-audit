import { afterEach, beforeEach, expect, it, vi } from "vitest";

const cloudId = "182b9218-d56a-453d-9659-3f29ea2aa7eb";
const ruleUuid = "0192e5ac-0e25-71de-ba7b-d972e6a2049a";
const context = {
  installContext: `ari:cloud:jira::site/${cloudId}`,
  principal: { accountId: "admin" },
};

const logOutput: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  { name: "invalid input", status: 400, payload: {}, setup: () => {} },
  {
    name: "permission denied",
    status: 403,
    payload: { ruleUuid },
    setup: () =>
      requestJira.mockResolvedValue({ ok: true, json: async () => ({}) }),
  },
  {
    name: "missing credentials",
    status: 500,
    payload: { ruleUuid },
    setup: () => vi.stubEnv("AUTOMATION_API_TOKEN", ""),
  },
  {
    name: "permission JSON failure",
    status: 502,
    payload: { ruleUuid },
    setup: () =>
      requestJira.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("private-message test-token");
        },
      }),
  },
  ...[401, 403, 404, 429, 500].map((status) => ({
    name: `upstream HTTP ${status}`,
    status,
    payload: { ruleUuid },
    setup: () =>
      fetch.mockResolvedValue({
        ok: false,
        status,
        json: vi.fn(() => {
          throw new Error("response-secret");
        }),
      }),
  })),
])(
  "rejects $name with a safe Problem Details cause and one failure summary",
  async ({ status, payload, setup }) => {
    setup();
    await expect(getRuleForAutomation(payload, context)).rejects.toMatchObject({
      cause: {
        type: `https://httpstatuses.io/${status}`,
        status,
        title: expect.any(String),
        detail: expect.any(String),
        timestamp: expect.any(String),
      },
    });
    const records = logOutput.map((line) => JSON.parse(line));
    const failures = records.filter((record) => record.outcome === "failure");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      action: "get-rule-automation",
      requestId: expect.any(String),
      status,
      durationMs: expect.any(Number),
      detail: expect.any(String),
    });
    expect(
      records.every((record) => record.requestId === failures[0].requestId),
    ).toBe(true);
    expect(records.some((record) => record.outcome === "success")).toBe(false);
    expect(
      records.some((record) => record.event === "automation.output.ready"),
    ).toBe(false);
    expect(logOutput.join()).not.toMatch(
      /private-message|test-token|response-secret/,
    );
  },
);

it("isolates concurrent action logs and records exactly one completion per invocation", async () => {
  fetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ rule: { uuid: ruleUuid, name: "private-rule-name" } }),
  }));
  await Promise.all([
    getAutomationRule({ ruleUuid }, context),
    getRuleForAutomation({ ruleUuid }, context),
  ]);
  const records = logOutput.map((line) => JSON.parse(line));
  const requestIds = new Set(records.map((record) => record.requestId));
  expect(requestIds.size).toBe(2);
  for (const requestId of requestIds) {
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    const invocation = records.filter(
      (record) => record.requestId === requestId,
    );
    expect(new Set(invocation.map((record) => record.action)).size).toBe(1);
    expect(
      invocation.filter((record) => record.outcome === "success"),
    ).toHaveLength(1);
    expect(invocation.at(-1)).toMatchObject({
      outcome: "success",
      durationMs: expect.any(Number),
    });
  }
  expect(logOutput.join()).not.toMatch(
    /private-rule-name|test-token|automation@example.com|admin/,
  );
});

it("sanitizes unexpected output failures instead of returning a successful Automation output", async () => {
  const rule = {
    uuid: ruleUuid,
    toJSON: () => {
      throw new Error("private-message test-token");
    },
  };
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ rule }),
  });
  await expect(
    getRuleForAutomation({ ruleUuid }, context),
  ).rejects.toMatchObject({
    message: "Unexpected failure while retrieving the rule",
    cause: { status: 500 },
  });
  const records = logOutput.map((line) => JSON.parse(line));
  expect(records.at(-1)).toMatchObject({ outcome: "failure", status: 500 });
  expect(logOutput.join()).not.toMatch(
    /private-message|test-token|automation.output.ready/,
  );
});

it("logs the permission HTTP failure stage and status without response secrets", async () => {
  requestJira.mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ secret: "response-secret" }),
  });
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    "Unable to verify Jira administrator permission",
  );
  const records = logOutput.map((line) => JSON.parse(line));
  expect(records).toContainEqual(
    expect.objectContaining({
      event: "permission.check.failed",
      stage: "http",
      status: 401,
      permission: "ADMINISTER",
    }),
  );
  expect(logOutput.join()).not.toContain("response-secret");
  expect(logOutput.join()).not.toContain("test-token");
});

it("distinguishes Forge authentication exceptions without logging their messages", async () => {
  requestJira.mockRejectedValue(
    Object.assign(new Error("test-token private-message"), {
      code: "NEEDS_AUTHENTICATION_ERR",
    }),
  );
  await expect(getAutomationRule({ ruleUuid }, context)).rejects.toThrow(
    "Unable to verify Jira administrator permission",
  );
  expect(logOutput.map((line) => JSON.parse(line))).toContainEqual(
    expect.objectContaining({
      event: "permission.check.failed",
      stage: "request",
      errorCode: "NEEDS_AUTHENTICATION_ERR",
    }),
  );
  expect(logOutput.join()).not.toMatch(/test-token|private-message/);
});

it("records retrieval progress without logging rule content or credentials", async () => {
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      rule: {
        uuid: ruleUuid,
        name: "private-rule-name",
        components: [{ value: "literal-secret" }],
      },
    }),
  });
  await getRuleForAutomation({ ruleUuid }, context);
  const events = logOutput.map((line) => JSON.parse(line).event);
  expect(events).toEqual(
    expect.arrayContaining([
      "action.started",
      "permission.check.started",
      "permission.check.allowed",
      "rule.fetch.started",
      "rule.fetch.response",
      "rule.fetch.completed",
      "automation.output.ready",
    ]),
  );
  expect(logOutput.join()).not.toMatch(
    /private-rule-name|literal-secret|test-token|automation@example.com/,
  );
});

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

import { getAutomationRule, getRuleForAutomation } from "../src/actions";

it("returns the definition as a JSON-string Automation output", async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      rule: { uuid: ruleUuid, name: "Example" },
      connections: [{ secret: "excluded" }],
    }),
  });
  await expect(getRuleForAutomation({ ruleUuid }, context)).resolves.toEqual({
    definition:
      '{"uuid":"0192e5ac-0e25-71de-ba7b-d972e6a2049a","name":"Example"}',
  });
});

it("fails Automation execution when retrieval is denied, without producing an output", async () => {
  requestJira.mockResolvedValue({
    ok: true,
    json: async () => ({
      permissions: { ADMINISTER: { havePermission: false } },
    }),
  });
  await expect(getRuleForAutomation({ ruleUuid }, context)).rejects.toThrow(
    "Jira administrator permission is required",
  );
  expect(fetch).not.toHaveBeenCalled();
});

beforeEach(() => {
  vi.resetAllMocks();
  logOutput.length = 0;
  for (const level of ["info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((line: string) => {
      logOutput.push(line);
    });
  }
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
