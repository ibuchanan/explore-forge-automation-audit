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

## Contributions

See [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md).

## License

Apache 2.0 licensed. See [LICENSE](LICENSE).
