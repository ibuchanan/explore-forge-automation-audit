# Automation Analyst

[![Atlassian license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

A read-only [Forge](https://developer.atlassian.com/platform/forge/) app
that lets a Rovo agent retrieve **one Jira Automation rule by UUID** and
analyze its trigger, conditions, branches, actions, and possible risks.
It also provides a **Get Automation rule** action for the Automation rule
builder, whose output can be passed to a later Rovo agent step.

**Use it for:** reviewing a known rule's definition on the Jira site where
this app is installed. **Not for:** listing rules, measuring executions or
charges, inspecting audit logs, or changing rules. AI analysis suggests
risks; verify conclusions against the rule and its audit log. For a billing
review, follow the [rule-review how-to](docs/how-to/how-to.md).

## Try it

You need a Jira site with Rovo Chat, permission to install Forge apps, a
signed-in user with **Administer Jira** permission, and a rule UUID (not its
numeric legacy ID). To run your own copy, [fork and install the app using the
tutorial](docs/tutorials/tutorial.md); it covers registration, deployment,
secrets, and a first run. After installation, select **Automation Analyst** in
Rovo Chat on that site and ask:

> Analyze Automation rule 0192e5ac-0e25-71de-ba7b-d972e6a2049a.

Replace the example UUID with your rule's UUID. The agent retrieves the
rule, then reports what the definition shows and what would need further
verification. It does not execute the rule.

In the Automation builder, add **Get Automation rule**, select a connection
owned by a Jira administrator who has granted app consent, and enter a rule
UUID or smart value resolving to one. Save with the native **Next** button.
Its `definition` output is JSON text for subsequent steps; add a separate
Rovo agent step if you want it analyzed. Retrieval alone does not invoke Rovo.

## Before installing

The Automation API requires an Atlassian account email and API token, stored
as encrypted Forge runtime variables (`AUTOMATION_API_EMAIL` and
`AUTOMATION_API_TOKEN`) separately for each environment. The app checks the
caller's Jira admin permission using `read:jira-work`, then reads the rule
with that token over backend egress to `https://api.atlassian.com`. The token
account determines which rules can be read; use a dedicated account with the
least access needed. The app does not impersonate the caller for this API.

Rule definitions can contain sensitive literal values. Do not use this app
for rules containing secrets in literals or route its output to an untrusted
recipient. The separate API connection metadata is excluded, but the rule
definition itself goes to Rovo for analysis. Never paste tokens into chat,
rule inputs, or source control. Review the [trust boundary and two action
entry points](docs/explanation/explanation.md) before authorizing the app.

## Documentation

- [Install and try the app](docs/tutorials/tutorial.md) — guided admin setup
  and first analysis.
- [Review rules before the billing date](docs/how-to/how-to.md) — usage-led
  triage; the app is not a billing calculator.
- [Modules and runtime libraries](docs/reference/reference.md) — Forge
  wiring, inputs, outputs, permissions, and links to platform docs.
- [Why Rovo needs a Forge action](docs/explanation/explanation.md) — the
  retrieval and authorization model.
- [Development](DEVELOPMENT.md) — local tools, checks, diagnostics, and
  deployment safeguards for contributors.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process and
[SECURITY.md](SECURITY.md) for security reporting. Licensed under
[Apache 2.0](LICENSE).
