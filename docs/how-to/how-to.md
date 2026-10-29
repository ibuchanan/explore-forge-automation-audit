# Review Automation rules before the 3 December billing date

If you manage many rules and are worried about the 3 December billing date,
use Automation Analyst to triage rule definitions for avoidable executions.
It can point to likely waste, but it cannot list your rules, measure usage,
calculate charges, or guarantee a lower bill. Confirm the applicable date,
pricing terms, usage window, and allowances in your organization's current
Atlassian billing information before making financial decisions.
1. In Jira Automation and your billing/usage reports, collect an inventory of
   enabled rules, owners, scopes, recent execution counts, and any relevant
   limits or charges. Record the **UUID** of each candidate rule (not a numeric
   legacy ID). Prioritize high-volume rules, broad triggers, duplicate rules,
   and rules with frequent failures. This app does not perform this inventory.
2. On the site where the app is installed, open Rovo Chat as a user with
   **Administer Jira** permission and select **Automation Analyst**. Analyze
   one prioritized UUID at a time. For example:

   > Analyze Automation rule 0192e5ac-0e25-71de-ba7b-d972e6a2049a. Identify
   > broad triggers, missing conditions, loops, duplicate actions, and expensive
   > branches. Separate what the definition shows from what needs audit-log
   > evidence.

   Substitute your real UUID. Do not paste API tokens or secret-bearing
   definitions into chat; the action fetches the definition and sends its
   contents, including any literal values, to Rovo.
3. Compare each analysis with the rule editor and its audit log. Check whether
   the trigger fires more often than intended, whether conditions filter early
   enough, whether branches repeat work, and whether actions can retrigger the
   rule or another rule. Validate suspected waste against execution counts;
   a possible risk in a definition is not evidence of billable usage.
4. Record the rule UUID, owner, observed usage, proposed change, expected
   effect, and reviewer. Agree changes with owners. In Jira Automation,
   modify, consolidate, or disable only the rules you have verified are
   unnecessary; this app will not make those changes. Test changes against
   expected outcomes and watch the audit log for failures or missed work.
5. Recheck usage and the billing view after the changes and during the
   applicable billing window. Compare the before/after counts and actual
   charges under your plan's terms. If the forecast is still high, repeat
   the review with the next highest-volume rules rather than assuming that
   fewer enabled rules automatically means lower cost.

For a repeatable in-rule handoff, an administrator can add **Get Automation
rule** to an Automation rule, choose an administrator-owned connection with
app consent, and pass its `definition` output to a later Rovo agent step via
the smart-value picker. This fetch action does not analyze the definition by
itself; only use this path when the rule genuinely needs automated analysis,
since adding executions merely to audit other rules may add work. See the
[tutorial](../tutorials/tutorial.md) for setup and the
[explanation](../explanation/explanation.md) for the trust boundary.
