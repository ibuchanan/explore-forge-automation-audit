# Development

This is the contributor workflow for Automation Analyst. For a guided path
from your own repository to the first Rovo analysis, use the
[installation tutorial](docs/tutorials/tutorial.md). For user-facing behavior,
start at the [README](README.md); for module contracts and the reasons behind
the two actions, see the [reference](docs/reference/reference.md) and
[explanation](docs/explanation/explanation.md).

## Local prerequisites and checks

Install [Bun](https://bun.sh/docs/installation) and the repository
dependencies with `bun install`. To work with a deployed app you also need
the [Forge CLI][forge-setup], [SecretSpec](https://secretspec.dev), and
[Fence Rider prerequisites][installation]. Authenticate the Forge CLI
separately from the Automation API credentials. Fence Rider is a development
tool, not a deployed runtime dependency.

After editing, run the repository's checks from its root:

```sh
bun run check
```

The `check` script invokes repository lint (Biome, Forge manifest lint,
static rules, format, and typecheck), the Vitest suite, and build/bundle
size checks. It calls `npm` internally via package scripts. It does **not**
include Markdown lint; for changed docs run:

```sh
bun run lint:docs
```

The docs linter checks every Markdown file and may report pre-existing
issues in unrelated files. For a focused test during editing, use
`bun run test` for the suite or `bun run test:watch` for a watch loop;
`bun run typecheck` and `bun run build` are available separately. `build`
writes `dist/`, which is ignored by Git. Keep generated output and local
secret files out of commits. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
pull-request process.

## First-time Forge setup with Fence Rider

The repository's `forge:*` scripts use [Fence Rider][fence-rider] to wrap
the Forge CLI. It resolves values declared in `secretspec.toml` through
[SecretSpec](https://secretspec.dev) and a secret provider chosen on your
workstation. `FORGE_SITE`, `FORGE_PRODUCT` (default `jira`), and
`FORGE_ENVIRONMENT` (default `development`) are local target controls.
`AUTOMATION_API_EMAIL` and `AUTOMATION_API_TOKEN` are the only variables
listed under `[scopes.runtime]`; Fence Rider uploads them encrypted. The
Automation API email/token are distinct from the credentials used to log in
to the Forge CLI.
1. Install and authenticate the tools using the [Forge setup][forge-setup]
   and [Fence Rider installation][installation] instructions. Verify the
   tools with `bun run fence-rider doctor`; this does not check whether your
   app configuration resolves.
2. If this source tree is a fork or clone and you need a **new** Forge app
   under your account, run `bun run forge:register` once. Registration
   changes `app.id` in `manifest.yml`. Do not register again when updating
   an app you already own or are authorized to develop; it would create a
   different app. Follow the [`forge register` reference][register].
3. Follow the [provider setup][providers] and [app secrets][app-secrets]
   guidance. Retain this repository's project name and requirements in
   `secretspec.toml`; bind provider roles in your local configuration. Store
   the email and token in your approved provider, not in Git, a rule input,
   or Rovo Chat. Do not add secret values as defaults in the TOML file.
4. Choose your Jira site and environment using the [local target
   settings][local]. Keep `FORGE_*` controls local; do not put them in
   `[scopes.runtime]`. Verify resolution without printing secret values:

   ```sh
   SECRETSPEC_PROFILE=default bun run fence-rider doctor --resolve
   ```

   This may authenticate with the provider; it does not display or verify
   the target values. Review those separately in your provider settings.
5. Review the manifest's `read:jira-work` scope and backend egress to
   `https://api.atlassian.com` before deploying. Once authorized to change
   your selected app, environment, and site, upload variables, deploy, and
   install in that order:

   ```sh
   bun run forge:variables:set
   bun run forge:deploy
   bun run forge:install
   ```

   **These commands change remote state.** Keep the same environment for
   upload and deployment. Runtime-variable changes require a subsequent
   deployment to become active. For code-only changes with unchanged
   variables, use `bun run forge:deploy`. After a scope change, deploy and
   then use `bun run forge:upgrade` for existing installations to refresh
   consent. See [runtime workflows][runtime] and
   [installation management][forge-tooling]. Do not deploy or install to a
   site without authorization.

The [Fence Rider tutorial][tutorial] is useful for learning its provider
workflow; its example script names may differ from this repository's
`forge:*` scripts. See the [app tutorial](docs/tutorials/tutorial.md) for
an end-to-end smoke test in Rovo Chat.

## Code map and test boundaries

- `manifest.yml`: Rovo agent, two `action` entries, Automation action
  provider, functions, UI Kit resource, scope, and egress declarations.
- `src/index.ts`: Forge handler exports.
- `src/actions/index.ts`: two action entry points and shared retrieval flow;
  Rovo receives the rule object, while Automation receives `definition` as
  JSON text.
- `src/actions/automation-api.ts`: UUID and signed installation context
  validation, runtime credentials, and one Automation API rule request.
- `src/actions/permissions.ts`: caller's Jira **Administer Jira** permission
  check using `asUser()` before the shared token is used.
- `src/actions/support.ts`: safe HTTP failure conversion and structured
  logging without response bodies or rule definitions.
- `src/frontend/index.tsx`: native Automation action UI Kit form; restores
  the saved UUID or smart value and submits validated changes through Bridge.
- `tests/get-rule.test.ts`: action outputs, validation, permission failures,
  API errors, and sensitive-data handling with mocked Forge API boundaries.
- `tests/automation-config.test.tsx`: form state, saved values, validation,
  and Bridge submission behavior.
- `docs/`: separate [tutorial](docs/tutorials/tutorial.md),
  [how-to](docs/how-to/how-to.md), [reference](docs/reference/reference.md),
  and [explanation](docs/explanation/explanation.md).

Unit tests do not exercise a live Automation API, a real administrator
connection, or Rovo's interpretation. After an authorized deployment, smoke
test with a non-sensitive rule UUID on the target Jira site and check both
the Chat result and, if applicable, the Automation action's `definition`
output in a later step. Never log or paste a secret-bearing definition.

## Diagnosing an action failure

The action rejects failures rather than returning a successful Automation
output with an error value. A missing/invalid UUID yields 400, missing
signed-in context 401, and denied Jira admin permission 403. Missing Forge
credentials yield 500; transport and invalid response failures yield 502.
An Automation API HTTP failure retains its upstream status. Automation's
audit log may show a generic failure, so check Forge backend logs for the
selected environment with [`forge logs`][logs].

Structured log entries from `@forge-ahead/logging` share a generated
`requestId` per invocation, carry an action name and progress events, and
end with an `outcome` and `durationMs` summary. `LOG_LEVEL` controls
verbosity. Logs deliberately omit payloads, user identifiers, tokens,
rule definitions, HTTP response bodies, and raw exception messages or
stacks. These are Forge backend logs, not Automation audit entries.
Check the UUID and site first, then the caller's permission or connection
consent, environment credential availability, and the upstream status;
do not copy secrets or rule JSON into bug reports. The
[reference](docs/reference/reference.md#retrieval-and-permissions)
lists the exact contracts.

[fence-rider]: https://github.com/ibuchanan/ranch-rig-fence-rider
[installation]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/installation.md
[forge-setup]: https://developer.atlassian.com/platform/forge/getting-started/
[register]: https://developer.atlassian.com/platform/forge/cli-reference/register/
[providers]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/configure-user-providers.md
[app-secrets]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/configure-app-secrets.md
[local]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/local.md
[runtime]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/runtime.md
[forge-tooling]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/use-forge-tooling.md
[tutorial]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/tutorials/tutorial.md
[logs]: https://developer.atlassian.com/platform/forge/cli-reference/logs/
