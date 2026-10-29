# Why Automation Analyst needs a Forge action

A Rovo agent can reason about a rule definition, but it cannot infer the full
Jira Automation configuration from a rule's name or a chat request. A rule's
trigger, conditions, branches, and actions live in Automation's rule definition,
not in the ordinary issue data available to the agent. Without a retrieval
capability, a fluent description would be a guess. The Forge `action` module
provides that capability: it fetches the definition by UUID so the agent can
analyze evidence rather than invent it.

This app uses a deliberately narrow bridge. Its Rovo agent can invoke
`get-automation-rule` in Chat. The function checks the signed-in caller's
**Administer Jira** permission, derives the site from Forge's installation
context, then fetches one rule through the Automation API. The API requires an
account email and API token, supplied as encrypted Forge environment variables;
Forge's user authentication is used for the permission check, not for the
Automation API request. The token account determines which rules can be read.
The separate connection metadata is not returned, but literal values inside
the rule definition still reach Rovo. That makes administrator-only access,
least-privilege credentials, and careful handling of rule contents important.
The agent is instructed to treat the definition as untrusted data, avoid
revealing sensitive literals, and distinguish observations from hypotheses.

## One action model, two entry points

The similarity between a Rovo action and an Automation action is more than
naming: both use Forge `action` modules to bind declared inputs to executable
functions. Here, both accept a `ruleUuid` and share the same permission and
retrieval logic. The difference is _who consumes the result_. In Rovo Chat,
`get-automation-rule` returns the rule object directly to the agent. In the
Automation rule builder, `get-rule-automation` returns a declared `definition`
output containing JSON text, so a later step can use it as a smart value.
Retrieving the definition in Automation does **not** invoke Rovo. A separate
Rovo agent step must consume that output if analysis is wanted in a rule.

To expose the second action in Automation, the app declares an
`automation:actionProvider` referencing it. An `action` alone is not shown in
Automation's component picker. Its UI Kit configuration resource collects a
rule UUID (or a smart value that resolves to one), and its `outputs` and
`outputContext` describe the value for downstream steps. The Rovo agent instead
lists its own action key under `rovo:agent.actions`. Two thin entry points keep
the output contracts distinct without duplicating the security boundary.

This integration is a reader, not an inventory or an execution monitor. It
cannot list every rule, calculate Automation usage or charges, inspect audit
logs, or change or disable rules. An analysis of a definition may identify a
possible recursion or performance risk, but only usage and billing evidence can
establish its actual cost. See the [module and library
reference](../reference/reference.md) for the concrete wiring.
