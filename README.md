# Automation Analyst

[![Atlassian license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

A Forge Rovo agent that fetches a Jira Automation rule definition by UUID and
analyzes its trigger, conditions, branches, actions, and potential risks.
It does not change rules or post comments.

## Usage

Select **Automation Analyst** in Rovo Chat on the Jira site where the app is
installed, then ask:

> Analyze Automation rule 0192e5ac-0e25-71de-ba7b-d972e6a2049a.

Use a rule UUID, not a numeric legacy rule ID. The calling user must have the
**Administer Jira** global permission. The definition is retrieved from the
current installation's site, never a site supplied in chat.

### Automation rule builder

After deployment, add the app action **Get Automation rule** to a Jira Automation
rule. Select a connection owned by a Jira administrator who has also granted app
consent in Connected apps. Enter the target **Rule UUID** or a smart-value
expression that resolves to one; use Automation's native Next button to save.

The action returns `definition`, a JSON string. In a subsequent Rovo agent step,
select the `definition` output from Automation's smart-value picker and ask the
agent to analyze that JSON as untrusted data, without fetching it again. The
retrieval action does not invoke Rovo itself. The existing Rovo Chat action
continues to return the rule object directly.

Rule definitions may contain sensitive literal values. Do not log the output or
send it to destinations that should not receive the full definition. Execution
fails without output if the connection user is not a Jira administrator or the
API request fails. Automation may show a generic failure in its audit log.

## Configuration

The [Automation API](https://developer.atlassian.com/cloud/automation/security/authentication/)
requires Basic authentication with an Atlassian account email and API token;
Forge OAuth authentication is not supported for rule retrieval.
Configure these runtime variables separately in each Forge environment:

| Variable               | Value                                             |
| ---------------------- | ------------------------------------------------- |
| `AUTOMATION_API_EMAIL` | Email of the account owning the token             |
| `AUTOMATION_API_TOKEN` | API token whose account can read the target rules |

Store the token encrypted. Never put credentials in source control, rule inputs,
or Rovo Chat. The existing `npm run forge:variables:set` workflow uses
`secretspec.toml` to upload both variables encrypted to the selected environment.
See [DEVELOPMENT.md](DEVELOPMENT.md) for local secret-provider setup.
Redeploy after changing Forge runtime variables.

The token account determines which rules the API can read. This app additionally
restricts invocation to Jira administrators; it does not impersonate the caller
for Automation access. Use a dedicated, least-privilege account. Administrators
may see any rule on this site readable by that account, including literal values
embedded in rule actions. Only authorize this app where that access is acceptable.
The API's separate connection metadata is excluded, but the rule definition is
sent to Rovo for analysis; do not use with rules containing secrets in literals.

## Installation

Use the existing opt-in `npm run forge:deploy` and `npm run forge:install`
workflows described in [DEVELOPMENT.md](DEVELOPMENT.md), after configuring the
runtime credentials. Review the manifest's `read:jira-work` scope (used to check
the caller's permissions) and backend egress to `https://api.atlassian.com`.
Existing installations need an upgrade to accept the changed permissions.

## Verification

Run `npm test` for the action's offline behavior tests and `npm run check` for
linting, Forge manifest validation, typechecking, tests, and bundle size checks.
Tests mock only the Forge API boundary; a deployed smoke test with a real rule
and configured credentials is still required to verify the live integration.

The app fetches `GET /automation/public/jira/{cloudId}/rest/v1/rule/{ruleUuid}`
and returns the response's `rule` object to the agent. API status failures are
reported without response bodies; credentials and definitions are not logged.

## Action diagnostics

Backend actions use `@forge-ahead/errors` Results and RFC 9457 Problem Details
internally. The Forge boundary throws an error with a sanitized problem as its
cause, so failed retrievals never become successful Automation outputs.
Validation, missing context, and denied access use statuses 400, 401, and 403;
missing configuration uses 500; transport or invalid-response failures use 502.
Automation API HTTP failures retain the upstream status.

Structured `@forge-ahead/logging` records include an action name and a generated
`requestId` shared by all records for that invocation. Progress events identify
permission checks, credential availability, API response status, and decoding or
definition failures. Each run ends with one `outcome` and `durationMs` summary;
failure summaries include the sanitized problem status, type, and detail.
`LOG_LEVEL` controls verbosity. These records are backend Forge logs, not
Automation audit-log entries.

Logs exclude payloads, user identifiers, credentials, rule definitions, response
bodies, and raw exception messages or stacks. HTTP error bodies are deliberately
not read or retained, even in bounded form.

## Contributions

See [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md).

## License

Apache 2.0 licensed. See [LICENSE](LICENSE).
