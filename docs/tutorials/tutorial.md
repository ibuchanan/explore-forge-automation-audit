# Install and try Automation Analyst on your Jira site

In this lesson, you will put the app source in a repository you control,
register your own Forge app, install it on a Jira site, and analyze one rule in
Rovo Chat. You need permission to install Forge apps on the site, a Jira
administrator account to use the action, access to Rovo Chat, and an Automation
rule whose UUID you can obtain. Use a test rule without secrets in literal
values: its definition will be sent to Rovo.
1. Fork this repository to a repository you control, then clone your fork and
   enter its directory. Keep `manifest.yml`, `secretspec.toml`, and the source
   tree together. Install dependencies with `bun install`.
2. Install the [Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/),
   [Bun](https://bun.sh/docs/installation), and the
   [SecretSpec and Fence Rider prerequisites](../../DEVELOPMENT.md#first-time-forge-setup-with-fence-rider).
   Authenticate the Forge CLI for your Atlassian account using the scoped token
   required by Forge. Run `bun run fence-rider doctor` to check the local tools.
3. Register this copy as **your** app, once:

   ```sh
   bun run forge:register
   ```

   This replaces the sample app ID in `manifest.yml`. Commit that new ID only
   in your own repository; do not register again when redeploying this app.
4. Configure your local SecretSpec provider as described in
   [Development](../../DEVELOPMENT.md#first-time-forge-setup-with-fence-rider).
   Set `FORGE_SITE` to your Jira hostname and keep `FORGE_PRODUCT=jira` and
   `FORGE_ENVIRONMENT=development` in the default profile. Store
   `AUTOMATION_API_EMAIL` and `AUTOMATION_API_TOKEN` in your approved secret
   provider, not in Git or chat. Use an account and token authorized to read
   the target rule. The Automation API uses these credentials separately from
   your Forge CLI login. Check resolution without printing secrets:

   ```sh
   SECRETSPEC_PROFILE=default bun run fence-rider doctor --resolve
   ```

5. Review `manifest.yml`: the app requests `read:jira-work` to check the caller's
   Jira permissions and backend access to `https://api.atlassian.com` to read
   Automation. On the site and environment you selected, upload the runtime
   secrets, deploy, and install:

   ```sh
   bun run forge:variables:set
   bun run forge:deploy
   bun run forge:install
   ```

   These commands change the selected Forge environment and site. Keep the
   same environment for all three. If an existing installation later gains
   scopes, use `bun run forge:upgrade` after deployment to refresh consent.
6. Open Rovo Chat on that Jira site, select **Automation Analyst**, and ask it
   to analyze your test rule by UUID, for example:

   > Analyze Automation rule 0192e5ac-0e25-71de-ba7b-d972e6a2049a.

   Replace the example with an actual rule UUID, not its numeric legacy ID.
   The signed-in user must have **Administer Jira** global permission and grant
   any requested app consent. Look for an account of the trigger, conditions,
   branches, actions, and potential risks; verify its claims against the rule
   in Automation. The agent does not execute or modify the rule.

You can also use the installed app inside an Automation rule: add **Get
Automation rule**, select an administrator-owned connection with app consent,
and enter a UUID or a smart value that resolves to one. Save with Automation's
native **Next** button. The action supplies a `definition` JSON string to later
steps; add a separate Rovo agent step and select that output from the smart-value
picker if you want analysis there. Avoid sending the definition to destinations
that should not see its literal values.

If retrieval fails, check the rule UUID, administrator permission, connection
consent (for the Automation action), environment credentials, and that the app
is installed on the intended site. For the full operator workflow, see
[Development](../../DEVELOPMENT.md); for the action contracts, see the
[reference](../reference/reference.md).
