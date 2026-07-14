# Maintaining the apps CI/CD pipeline

This document explains how the `apps/*` CI/CD pipeline works and how to onboard a new app to it.

## How the pipeline works

Whenever a pull request or a push to `main` changes anything under an app's directory
(`apps/<name>/`), that app is automatically checked and deployed. Apps that weren't touched are
left alone entirely.

1. The app's code is linted and its test suite runs.
2. If that passes, the app is built and deployed to its workspace for this run — the `main`
   workspace for a push to `main`, or the `pr` workspace for a pull request.
3. For pull requests, the app is undeployed again immediately after a successful deploy (see
   below for why).

Commenting `/retest` on a pull request re-runs this whole check-and-deploy cycle against the
PR's current code, without needing a new commit — useful after a flaky failure, or after fixing
something outside the PR itself (like provisioning a workspace secret). Only repo collaborators
can trigger it.

## Workspaces and secrets

Each app has **two** pre-provisioned Adobe Console workspaces:

- **`main`** — deployed to on every push to `main`, and left deployed: this is the persistent
  target.
- **`pr`** — deployed to on every pull request touching that app, then immediately undeployed.
  It's shared across all PRs for that app rather than one per PR number, so a successful
  deploy here is a smoke test that the app builds and deploys cleanly, not a lasting preview —
  the workspace is torn back down right after so it stays clean for the next PR's run. The
  `deploy` job's `concurrency` group (`deploy-<app>-<purpose>`, with `queue: max`) guarantees
  two PRs' deploy-then-undeploy cycles never overlap on the same workspace — a second run
  queues behind the first rather than running concurrently or being dropped.

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
contents straight into the secret as-is. No `aio` CLI command needs to be run to prepare it;
the pipeline derives everything it needs (IMS credentials, Runtime namespace/auth, project and
workspace identifiers) from that file at deploy time.

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
6. **Register the app in `apps-pipeline.yml`'s `deploy` job** alongside the existing apps, so
   its two new secrets are picked up — this is a small, mechanical edit today; worth
   revisiting if the number of apps grows enough to make it unwieldy.
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
