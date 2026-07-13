# Maintaining the apps CI/CD pipeline

This document explains how the `apps/*` CI/CD pipeline works and how to onboard a new app to it.

## How the pipeline works

Two workflows, `.github/workflows/apps-ci.yml` and `.github/workflows/apps-pipeline.yml`:

1. **`apps-ci.yml`** triggers on pull requests targeting `main` and on pushes to `main`, but
   only when a path under `apps/**` changed. Its `detect` job diffs the changed paths and
   extracts the set of `apps/<name>` directories touched, then a matrix job calls
   `apps-pipeline.yml` once per changed app.
2. **`apps-pipeline.yml`** is a reusable workflow (`on: workflow_call`, taking `app` as input)
   with two jobs:
   - `check`: installs the app's dependencies, runs `npm run code:check` and `npm test`. No
     external dependency — this job never talks to Adobe Developer Console or Runtime.
   - `deploy` (`needs: check`): builds and deploys the app to a pre-provisioned Adobe App
     Builder workspace, using `adobe/aio-apps-action` (`oauth_sts` → `build` → `deploy`).

## Workspaces and secrets

Each app has **two** pre-provisioned Adobe Console workspaces:

- **`main`** — deployed to on every push to `main`.
- **`pr`** — deployed to on every pull request touching that app. This workspace is **shared
  across all PRs** for that app, not one per PR number: whichever PR's `deploy` job runs last
  wins. The `deploy` job's `concurrency` group (`deploy-<app>-<purpose>`, with `queue: max`)
  guarantees these never race — a second run queues behind the first rather than running
  concurrently or cancelling it, so no two deploys ever touch the same workspace at the same
  time, and no deploy is silently dropped.

Deliberately, **CI never creates a workspace, attaches an API to one, or calls
`aio app use`** — every attempt to do that with the CI's own OAuth Server-to-Server credential
hit a hard permission wall in Adobe's Console (three different failures were found: missing
scope to browse the org's private-API catalog, insufficient Console role to create a new
credential on a workspace, and a flat "invalid client ID" on the workspace-download endpoint).
Adobe's own documented pattern
([CI/CD using GitHub Actions](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/deployment/cicd-using-github-actions))
avoids all of this by never touching Console Management APIs from CI: a human provisions the
workspace and extracts its config *once*, and CI just injects the pre-extracted values as
plain environment variables into `aio app deploy`. This pipeline follows that model.

### The workspace config secrets

Each workspace's full config lives in **exactly one** GitHub Actions repo secret, named
`AIO_<APP>_MAIN_WORKSPACE_CONFIG` or `AIO_<APP>_PR_WORKSPACE_CONFIG` (app name upper-cased,
`-` replaced with `_`). For example, shipping-method's two secrets are
`AIO_SHIPPING_METHOD_MAIN_WORKSPACE_CONFIG` and `AIO_SHIPPING_METHOD_PR_WORKSPACE_CONFIG`.

**The secret value is the raw `workspace.json` file, exactly as downloaded** from the
"Download" button on that workspace's page in https://developer.adobe.com/console/ — copy its
contents straight into the secret. No `aio` CLI command needs to be run to produce it; the
`deploy` job does the flattening itself with `jq`. The fields it pulls out (see the "Load
workspace config" step in `apps-pipeline.yml`), and where each one lives in that raw file:

| Field | Path in the downloaded `workspace.json` |
|---|---|
| `CLIENTID` | `.project.workspace.details.credentials[] .oauth_server_to_server.client_id` (the credential with `integration_type == "oauth_server_to_server"`) |
| `CLIENTSECRET` | same credential's `.oauth_server_to_server.client_secrets[0]` |
| `TECHNICALACCOUNTID` | same credential's `.oauth_server_to_server.technical_account_id` |
| `TECHNICALACCOUNTEMAIL` | same credential's `.oauth_server_to_server.technical_account_email` |
| `IMSORGID` | `.project.org.ims_org_id` |
| `SCOPES` | same credential's `.oauth_server_to_server.scopes` (JSON array) |
| `AIO_RUNTIME_NAMESPACE` | `.project.workspace.details.runtime.namespaces[0].name` |
| `AIO_RUNTIME_AUTH` | `.project.workspace.details.runtime.namespaces[0].auth` |
| `AIO_PROJECT_ID` | `.project.id` |
| `AIO_PROJECT_NAME` | `.project.name` |
| `AIO_PROJECT_ORG_ID` | `.project.org.id` |
| `AIO_PROJECT_WORKSPACE_ID` | `.project.workspace.id` |
| `AIO_PROJECT_WORKSPACE_NAME` | `.project.workspace.name` |
| `AIO_PROJECT_WORKSPACE_DETAILS_SERVICES` | `.project.workspace.details.services` (JSON array) |

This mirrors exactly what `aio app use <workspace>.json` does locally (see
`@adobe/aio-cli-plugin-app`'s `src/lib/import-helper.js`, `importConfigJson`/`transformRuntime`/
`getServiceCredential`) — we just replicate that transform in the workflow instead of requiring
a human to run it. `@adobe/aio-lib-core-config` treats any `AIO_<KEY>` environment variable as
config (`AIO_PROJECT_ORG_ID` → `project.org.id`, and so on) at higher priority than any
`.aio`/`.env` file — this is what lets the `deploy` job work from plain env vars with no local
config file at all. The six non-`AIO_`-prefixed fields (`CLIENTID`, `CLIENTSECRET`, etc.) are
fed directly to `adobe/aio-apps-action`'s `oauth_sts` command inputs instead.

The `deploy` job's "Load workspace config" step in `apps-pipeline.yml` picks the right secret
based on `inputs.app` and `github.event_name`, extracts each field with `jq`, and writes it to
`$GITHUB_ENV` (masking every value first, since none of this should ever appear in a log).

## Adding a new app

1. Scaffold `apps/<name>/` following `apps/shipping-method` as the reference: a
   `package.json` with `test` and `code:check` scripts, `install.yaml` (extension points +
   any `apis:` your app needs — see below), and `app.commerce.config.ts`.
2. In Adobe Developer Console, under this app's project, ensure two workspaces exist: one to
   treat as `main`, one as `pr` (reuse the project's default `Stage`/`Production` workspaces,
   or create two clean ones — naming is up to you, it's not read by CI).
3. For each of the two workspaces, run `aio app add service` (interactively, as a human with
   Console access) to attach whatever APIs `install.yaml`'s `apis:` list declares.
   `install.yaml` documents the requirement; CI does not read or enforce it.
4. For each workspace, click **Download** on that workspace's page in
   https://developer.adobe.com/console/ to get its `workspace.json`.
5. Add two repo secrets: `AIO_<NAME>_MAIN_WORKSPACE_CONFIG` and
   `AIO_<NAME>_PR_WORKSPACE_CONFIG`, each set to the raw contents of one workspace's downloaded
   `workspace.json` — no transformation needed, paste the file as-is.
6. **Extend the `deploy` job's "Load workspace config" step** in `apps-pipeline.yml` — its
   secret-selection expression is written per-app (GitHub Actions can't build a secret name
   from `inputs.app`), so add this app alongside shipping-method's. If the list of apps grows
   enough that this per-app branching becomes unwieldy, migrate to one GitHub Environment per
   `<app>-<purpose>` instead (an environment's secrets are addressed by a fixed name like
   `WORKSPACE_CONFIG`, and the job can select the environment dynamically via
   `environment: <expression>` — unlike `secrets.*`, environment names *can* be built from an
   expression).
7. Open a PR touching `apps/<name>/**` — `apps-ci.yml`'s `detect` job picks it up
   automatically, no changes needed there.

## Concurrency

The `deploy` job sets `concurrency: { group: deploy-<app>-<purpose>, queue: max }`. `queue: max`
is what guarantees strict FIFO ordering with no dropped runs — without it, GitHub Actions'
default concurrency behavior cancels an older *pending* (not yet started) run whenever a newer
one arrives in the same group, which would silently drop a deploy if three or more runs piled
up close together. `queue: max` is a newer addition to `concurrency`; if GitHub ever changes
this, re-check
[the concurrency docs](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs)
before removing it.

The group key includes both `<app>` and `<purpose>` (`main`/`pr`), so unrelated apps, and the
`main`/`pr` workspaces of the same app, always run fully in parallel — only two runs targeting
the exact same workspace ever serialize against each other.
