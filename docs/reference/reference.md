# Automation Analyst reference

The following entries describe the modules in `manifest.yml` and runtime
packages in `package.json` and `src/`. This app reads one Jira Automation rule
by UUID; it does not expose an inventory, usage meter, or rule editor.

## Forge modules and resources

| Module or resource          | Key / source                                   | Contract                                                                                          | Documentation                                                                                                                                        |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rovo:agent`                | `automation-analyst`                           | **Automation Analyst** in Rovo Chat; prompt and conversation starter; lists `get-automation-rule` | [Rovo agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/)                                                  |
| `action`                    | `get-automation-rule` → `getAutomationRule`    | Required string `ruleUuid`; `GET`; returns the rule object to Rovo                                | [Rovo action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/)                                                |
| `action`                    | `get-rule-automation` → `getRuleForAutomation` | Required string `ruleUuid`; `GET`; returns `definition` as a non-null string containing JSON      | [Automation action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/automation-action/)                                    |
| `automation:actionProvider` | `automation-rule-provider`                     | Makes `get-rule-automation` available in the Automation builder                                   | [Automation action provider](https://developer.atlassian.com/platform/forge/manifest-reference/modules/automation-action/#the-actionprovider-module) |
| `function`                  | `getAutomationRule`, `getRuleForAutomation`    | Handlers `index.getAutomationRule` and `index.getRuleForAutomation`, exported from `src/index.ts` | [Forge functions](https://developer.atlassian.com/platform/forge/manifest-reference/modules/function/)                                               |
| `resources`                 | `automation-config` → `src/frontend/index.tsx` | Native UI Kit form for the Automation action's `ruleUuid` input                                   | [Resources](https://developer.atlassian.com/platform/forge/manifest-reference/resources/)                                                            |

The Automation action uses `config.resource: automation-config`,
`config.render: native`, and `outputContext` with `entityName: rule`,
`outputType: OBJECT`, and `outputDomain: automation`. The Rovo action has no
configuration form or declared output. Automation output smart values are
available to subsequent rule steps; retrieving a rule does not run the agent.

## Retrieval and permissions

| Item                 | Value                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input                | Canonical UUID string `ruleUuid`, not a numeric legacy ID; Automation smart values must resolve to a UUID at execution                                                                                                        |
| Site                 | Jira site UUID parsed from the signed Forge `installContext`; no site input from the user                                                                                                                                     |
| Caller               | Signed-in principal with Jira `ADMINISTER` global permission, checked using `asUser().requestJira` against the Jira my-permissions endpoint with `permissions=ADMINISTER`                                                     |
| Rule endpoint        | `GET https://api.atlassian.com/automation/public/jira/{cloudId}/rest/v1/rule/{ruleUuid}` using Basic authentication                                                                                                           |
| Credentials          | Encrypted Forge environment variables `AUTOMATION_API_EMAIL` and `AUTOMATION_API_TOKEN`; token account controls API visibility                                                                                                |
| Response             | API response's `rule` object; separate `connections` metadata is not returned, but rule literals can be sensitive                                                                                                             |
| Manifest permissions | Classic scope `read:jira-work`; backend fetch egress to `https://api.atlassian.com`                                                                                                                                           |
| Failures             | Rejected action invocation, without a successful Automation output; validation 400, missing context 401, denied permission 403, missing configuration 500, transport/invalid response 502; upstream API HTTP status preserved |

[Automation API authentication](https://developer.atlassian.com/cloud/automation/security/authentication/)
and [Jira my permissions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/#api-rest-api-3-mypermissions-get)
describe the external interfaces. Backend diagnostic logs contain an action
name, generated `requestId`, progress/status, and a final outcome/duration;
they omit credentials, definitions, response bodies, and raw errors. `LOG_LEVEL`
controls verbosity. These are Forge logs, not Automation audit entries.

## Runtime libraries

| Package                            | Use in this app                                                                | Documentation                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `@forge/api`                       | `asUser().requestJira` for authorization; Forge `fetch` for the Automation API | [Forge API](https://developer.atlassian.com/platform/forge/runtime-reference/forge-api/)          |
| `@forge/bridge`                    | `view.submit` to persist Automation action configuration                       | [Forge bridge](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/view/) |
| `@forge/react`                     | UI Kit reconciler, form and fields, validation, and `useProductContext`        | [UI Kit](https://developer.atlassian.com/platform/forge/ui-kit/overview/)                         |
| `react`                            | Form component and local save-error state                                      | [React](https://react.dev/reference/react)                                                        |
| `@forge-ahead/atlassian-api-types` | TypeScript response types for Jira and Automation operations                   | [Source](https://github.com/ibuchanan/forge-ahead-atlassian-api-types)                            |
| `@forge-ahead/errors`              | Results and sanitized RFC 9457 Problem Details at the action boundary          | [Source](https://github.com/ibuchanan/forge-ahead-errors)                                         |
| `@forge-ahead/logging`             | Structured, request-correlated Forge invocation logging                        | [Source](https://github.com/ibuchanan/forge-ahead-logging)                                        |

Forge runtime: `nodejs24.x`, 256 MB, `arm64`. The `fence-rider` package and
SecretSpec configuration are local deployment tooling, not deployed runtime
libraries; see [Development](../../DEVELOPMENT.md).
