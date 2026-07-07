# Align checkout starter kit to App Management (CEXT-6421)

## Context

[CEXT-6421](https://jira.corp.adobe.com/browse/CEXT-6421) asks that the checkout starter kit follow
Adobe Commerce's "App Management" conventions for configuration, installation, and deployment,
using `app.commerce.config` (provided by `@adobe/aio-commerce-lib-app`) as the primary source of
truth, instead of starter-kit-specific onboarding.

Acceptance criteria from the ticket:

- The checkout starter kit uses `app.commerce.config` as the primary source of truth for app
  definition and configuration.
- Starter-kit onboarding steps that duplicate App Management are removed or replaced with App
  Management-aligned guidance.
- Payment, shipping, and taxes initialization are migrated to custom installation steps.
- Documentation points developers to App Management for install, build/deploy, association, and
  configuration.
- The checkout-specific use-case guidance remains intact.

During design, we agreed to go further than a single migrated app: the monolithic starter kit will
be **split into four independently deployable App Management apps**, one per commerce domain
(shipping, payment, tax, fees). This exceeds the literal ticket text but was an explicit decision
made during brainstorming, in service of shipping the work as small, independently reviewable PRs.

Adobe ships official tooling for exactly this kind of migration as Claude Code plugins in
`aio-commerce-sdk` (`commerce-app-migration`, `commerce-app-management`). We are **not** installing
or driving those plugins for this work — this migration is done by hand, using the plugins' schema
and docs (`@adobe/aio-commerce-lib-app`) as the reference for the target shape.

## SDK packages (beta)

The released versions of the Commerce SDK packages don't yet include everything this migration
needs, so all four apps pin **beta** versions until the real releases ship:

| Package | Version | Used for | Which apps |
|---|---|---|---|
| `@adobe/aio-commerce-lib-app` | `1.8.0-beta-20260702145741` | `app.commerce.config.ts`, `defineConfig`, `defineCustomInstallationStep`, association-based `getCommerceClient`/`getCommerceInstance` | all four |
| `@adobe/aio-commerce-sdk` | `1.4.0-beta-20260702145741` | Meta-package re-exporting `@adobe/aio-commerce-lib-webhooks` (webhook operation/response builders, via `@adobe/aio-commerce-sdk/webhooks/responses`) and `@adobe/aio-commerce-lib-core` (generic action response/params/header helpers, via `@adobe/aio-commerce-sdk/core/*`) | all four |
| `@adobe/aio-commerce-lib-admin-ui` | `0.2.0-beta-20260702145741` | Experimental `commerce/backend-ui/2` wire-contract builders (grid columns, order-view-buttons, mass actions), the ACL permission client, and the Admin UI SDK extension registration API client | `tax-integration/` only (the only app with an Admin UI extension) |

Neither `@adobe/aio-commerce-lib-webhooks` nor `@adobe/aio-commerce-lib-core` need to be installed
directly — they're consumed through the `@adobe/aio-commerce-sdk` meta-package's subpath exports.

This changes two things from the original plan:

- **Webhook responses**: the hand-rolled `webhookSuccessResponse`/`webhookErrorResponse` in
  `lib/adobe-commerce.js`, and the ad-hoc discount-operation object builders in
  `lib/total-collector-discounts.js` (`zeroDiscountOperation`, `discountOperation`), are replaced
  by `@adobe/aio-commerce-sdk/webhooks/responses`' typed builders (`successOperation`,
  `exceptionOperation`, `addOperation`, `replaceOperation`, `removeOperation`, wrapped in `ok()`).
  `webhookVerify` (the `x-adobe-commerce-webhook-signature` check) has **no SDK equivalent** and
  stays hand-rolled — none of the three new packages implement webhook signature verification.
- **Generic action utilities**: `lib/http.js`'s status constants and `actions/utils.js`'s
  `checkMissingRequestInputs`/`errorResponse`/`getBearerToken` helpers are candidates to be
  replaced by `@adobe/aio-commerce-sdk/core/responses` (`ok`, `badRequest`, etc.),
  `@adobe/aio-commerce-sdk/core/params` (`allNonEmpty`), and `@adobe/aio-commerce-sdk/core/headers`
  (`parseBearerToken`) wherever they're a clean drop-in.

It also opens up two optional installation-step enhancements, worth using where they fit cleanly:

- `@adobe/aio-commerce-lib-webhooks/api`'s `subscribeWebhook`/`unsubscribeWebhook` could turn the
  manual "Create Webhooks" README step (SaaS path) into a `customInstallationStep`, instead of
  documentation the developer has to follow by hand.
- `@adobe/aio-commerce-lib-admin-ui/api`'s `enableAdminUiSdk`/`registerExtension` could turn
  `tax-integration/`'s Admin UI SDK enablement into a `customInstallationStep` instead of a manual
  Commerce Admin settings step.

Both are additive conveniences, not requirements — if either doesn't fit cleanly into a given
plan's scope, documenting the manual step in the README remains an acceptable fallback.

## Goals

- Each commerce domain (shipping, payment, tax, fees) becomes its own App Builder / Developer
  Console project, with its own `app.config.yaml`, `app.commerce.config.ts`, and `package.json`.
- Payment/shipping/tax onboarding scripts (`create-payment-methods.js`, `create-shipping-carriers.js`,
  `create-tax-integrations.js`) become `customInstallationSteps` in each app's `app.commerce.config.ts`.
- Dead scaffolding carried over from the App Builder template (unused example actions) is removed,
  not migrated.
- Each app's README follows App Management's install/build/deploy/association flow, keeping only
  the checkout-domain-specific guidance that App Management doesn't cover.
- The work ships as 5 small, independently reviewable PRs: one per domain, plus one to remove the
  monolith.

## Non-goals

- Driving Adobe's own `commerce-app-migrate` / `commerce-app-management` plugins against this repo.
- Any change to the actual checkout business logic inside actions (discount calculation, tax
  calculation, payment/shipping validation) — this is a structural/config migration only.
- Building a 5th "shared platform" app. Cross-cutting concerns are either duplicated (small,
  Adobe-owned tracking action) or dropped (unused scaffolding), not centralized.

## Target repo layout

Each domain app is a **top-level directory** in the repo (not nested under a shared `apps/`
parent):

```
shipping-method/
payment-method/
tax-integration/
totals-collector/
```

Each of these directories is fully self-contained: its own `package.json`, `app.config.yaml`,
`app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`, and (if needed) its own
husky/lint-staged setup. There is **no shared root-level tooling** — this was an explicit choice
over npm workspaces, prioritizing full independence per app (including the ability to later split
into separate repos) over reduced duplication.

The final PR removes the (now-superseded) monolithic root-level app entirely: `actions/`, `lib/`,
`scripts/`, `hooks/`, `app.config.yaml`, `payment-methods.yaml`, `shipping-carriers.yaml`,
`tax-integrations.yaml`, `events.config.yaml`, `extension-manifest.json`, root `package.json`,
`env.dist`, `test/`, `e2e/`, and `commerce-backend-ui-1/`. The root `README.md` is replaced with a
short index pointing to the four domain directories' `README.md` files.

## Per-domain content mapping

| Domain | Folder | Actions | Install script → custom installation step | Config file | Extras |
|---|---|---|---|---|---|
| Shipping | `shipping-method/` | `shipping-methods` | `create-shipping-carriers.js` (`get-shipping-carriers.js` kept as a plain helper script, not an installation step) | `shipping-carriers.yaml` | — |
| Payment | `payment-method/` | `validate-payment`, `filter-payment` | `create-payment-methods.js` | `payment-methods.yaml` | — |
| Tax | `tax-integration/` | `collect-taxes`, `collect-adjustment-taxes` | `create-tax-integrations.js` | `tax-integrations.yaml` | Admin UI extension migrated from `commerce/backend-ui/1` (`commerce-backend-ui-1/`) to `commerce/backend-ui/2`. Its actual content — `TaxClassDialog.js` / `TaxClassesPage.js` — is tax-domain functionality, not generic infrastructure, so it belongs here. |
| Fees | `totals-collector/` | `total-collector-discounts/*` (9 actions: `tiered-quantity-discount`, `tiered-category-discount`, `category-based-discount`, `cheapest-item-discount`, `expensive-item-discount`, `cheapest-quantity-discount`, `step-price-discount`, `multi-condition-discount`, `tiered-total-spend-discount`) + `lib/total-collector-discounts.js` | none — there is no Commerce-side registration step for these today | — | No Commerce REST API calls at all; pure webhook payload transforms. Needs only webhook signature verification, not a Commerce HTTP client. |

Every app additionally gets:

- Its own copy of the `commerce-checkout-starter-kit/info` action (explicitly marked "do not
  change" — used for Adobe's own usage tracking). Small and duplicated per app rather than shared,
  since each domain is now a separately tracked deployment.
- Its own copy of `webhookVerify` (signature check) split out from the Commerce-HTTP-client parts
  of `lib/adobe-commerce.js`, so the `totals-collector/` app doesn't need to carry Commerce API
  client code it never uses. `webhookSuccessResponse`/`webhookErrorResponse` are **not** carried
  forward — see "SDK packages (beta)" above, they're replaced by
  `@adobe/aio-commerce-sdk/webhooks/responses`.

## Dropped entirely (not migrated to any domain app)

These were identified as unused scaffolding — either an empty handler registry or unmodified
App Builder template boilerplate — and are removed rather than relocated:

- `actions/generic/`
- `actions/commerce-events/` (its `events-handler.js` handler registry is empty — the
  `sales_order_creditmemo_save_after` subscription is wired but never handled)
- `actions/3rd-party-events/` (publish + consume)
- `events.config.yaml`, `scripts/configure-events.js`, `scripts/configure-commerce-events.js`
- Associated tests: `test/generic.test.js`, `test/utils.test.js`,
  `e2e/generic.e2e.test.js`, `e2e/3rd-party-events.e2e.test.js`

## `app.commerce.config.ts` shape

Each app's config follows `@adobe/aio-commerce-lib-app`'s `defineConfig`:

```ts
import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  metadata: {
    id: "checkout-<domain>",
    displayName: "Checkout <Domain>",
    version: "1.0.0",
    description: "...",
  },
  installation: {
    customInstallationSteps: [
      {
        script: "./scripts/create-<domain>-<x>.js",
        name: "...",
        description: "...",
      },
    ],
  },
  // adminUi: { ... }   ← tax-integration app only
});
```

Each `create-*.js` script is rewritten using the SDK's install-step helper:

```ts
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

export default defineCustomInstallationStep(async (config, context) => {
  const client = await getCommerceClient(resolveImsAuthParams(context.params));
  // ...create payment method / shipping carrier / tax integration via client
});
```

This is safe inside a custom installation step: `InstallationContext.params` is typed to guarantee
the IMS credential fields needed by `resolveImsAuthParams`, per `@adobe/aio-commerce-lib-app`'s own
contract (`source/management/installation/workflow/step.ts`).

## Auth strategy for runtime (webhook) actions — flagged risk

Beyond the installation steps, we will also attempt to swap the **runtime webhook actions**
(`validate-payment`, `filter-payment`, `shipping-methods`, `collect-taxes`,
`collect-adjustment-taxes`, and the `totals-collector/` discount actions where they call Commerce)
from the hand-rolled `lib/adobe-commerce.js` OAuth1/IMS client to the SDK's association-based
`getCommerceClient`/`getCommerceInstance`.

**This is explicitly unproven territory.** Investigation found zero documented or tested examples
of `getCommerceClient` being used inside a `raw-http: true` / `require-adobe-auth: false` action
invoked directly by Commerce (as opposed to an IMS-authenticated Adobe I/O Runtime action). Adobe's
own `commerce-app-migrate` tooling deliberately avoids this swap and keeps the legacy client for
these actions. We're proceeding anyway per an explicit decision made during design, with a
fallback: **`shipping-method/` ships first** and doubles as the validation vehicle for this
pattern. If `getCommerceClient` doesn't hold up for `shipping-methods` under real webhook traffic,
we keep `lib/adobe-commerce.js`'s client for that action, document the gap, and skip the swap for
payment/tax/fees rather than repeating a broken pattern three more times.

Mechanically, this means wiring `AIO_COMMERCE_AUTH_IMS_CLIENT_ID` /
`AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS` / `AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID` /
`AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL` / `AIO_COMMERCE_AUTH_IMS_ORG_ID` /
`AIO_COMMERCE_AUTH_IMS_SCOPES` as action `inputs` (replacing today's `OAUTH_*` inputs) and calling
`getCommerceClient(resolveImsAuthParams(params))` from within the action handler, with
`getCommerceInstance()` supplying the Commerce base URL in place of `COMMERCE_BASE_URL`.

Note: `totals-collector/` never calls Commerce at all (pure webhook payload transforms), so this
auth swap is not applicable there regardless of how the spike goes.

## File layout: avoid a reflexive shared `lib/`

Don't default to a shared `lib/` folder just because the old monolith had one. Two rules:

- **Single-consumer helpers colocate with their one caller**, not in `lib/`. If only one action in
  a domain needs a helper (e.g. `webhookVerify` in `shipping-method/`, where `shipping-methods` is
  the domain's only webhook action), put it next to that action. Domains where 2+ actions share a
  helper (payment's `validate-payment`+`filter-payment`, tax's `collect-taxes`+
  `collect-adjustment-taxes`, fees's 9 discount actions) still warrant a shared file — the
  single-consumer rule doesn't apply there.
- **Never hand-roll a Commerce HTTP client or auth flow** — not even for a "just a dev script"
  helper like `shipping-method/scripts/get-shipping-carriers.js`. Use
  `@adobe/aio-commerce-lib-api`'s `AdobeCommerceHttpClient` + `resolveCommerceHttpClientParams`
  (from `@adobe/aio-commerce-lib-api/commerce`), which wraps `@adobe/aio-commerce-lib-auth`
  internally and replaces a hand-rolled got+oauth-1.0a+IMS client in a handful of lines. This
  applies to any script or action that needs to call Commerce directly and isn't inside a
  `defineCustomInstallationStep` (which already uses `getCommerceClient` from
  `@adobe/aio-commerce-lib-app` for the association-based case).

## Webhook subscriptions (declarative `webhooks` config)

`@adobe/aio-commerce-lib-app`'s `defineConfig` has a top-level `webhooks` array (see the SDK's
"Webhooks Configuration" docs) that declares `{ runtimeAction, webhook: { webhook_method,
webhook_type, batch_name, hook_name, ... } }` entries. The SDK resolves the deployed action's
public Runtime URL and subscribes it to Commerce automatically at install time. This supersedes
the "keep Create Webhooks as a manual README step" decision that shipping/payment/tax's plans
originally made when they only evaluated the lower-level `subscribeWebhook` API — the declarative
`webhooks` field needs no custom installation-step code at all.

The values below are sourced directly from the `AdobeDocs/commerce-extensibility` repo (the source
of developer.adobe.com's checkout starter kit use-case docs), not fabricated or inferred:

| App | Action | `webhook_method` (PaaS) | `webhook_method` (SaaS) | `webhook_type` | `batch_name` / `hook_name` (PaaS) | `batch_name` / `hook_name` (SaaS) |
|---|---|---|---|---|---|---|
| `payment-method/` | `validate-payment` | `observer.sales_order_place_before` | same | `before` | `out_of_process_payment_methods` / `validate_payment` | `validate_payment` / `oope_payment_methods_sales_order_place_before` |
| `payment-method/` | `filter-payment` | `plugin.magento.out_of_process_payment_methods.api.payment_method_filter.get_list` | `plugin.out_of_process_payment_methods.api.payment_method_filter.get_list` | `after` | `out_of_process_payment_methods` / `payment_method_filter` | same |
| `shipping-method/` | `shipping-methods` | `plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates` | `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates` | `after` | `dps` / `add_shipping_rates_dps` | same |
| `tax-integration/` | `collect-taxes` | `plugin.magento.out_of_process_tax_management.api.oop_tax_collection.collect_taxes` | `plugin.out_of_process_tax_management.api.oop_tax_collection.collect_taxes` | `before` | `collect_taxes` / `collect_taxes` | same |
| `tax-integration/` | `collect-adjustment-taxes` | `plugin.magento.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes` | `plugin.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes` | `before` | `collect_taxes` / `collect_taxes` | same |
| `totals-collector/` | one of the 9 discount actions (see below) | `plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute` | `plugin.out_of_process_totals_collector.api.get_total_modifications.execute` | `after` | `totals_collector` / `totals_collector` | same |

Because the `webhook_method` string itself differs between PaaS and SaaS in every case except
`validate-payment` (where `batch_name`/`hook_name` also differ), each action needs **two**
env-scoped `webhooks` entries (`env: ["paas"]` and `env: ["saas"]`), not one — even where only the
`"magento."` prefix changes. Additional per-action fields to preserve (from the confirmed XML
examples): `method: "POST"`, `timeout`/`softTimeout`, `priority`, `required`, and
`fallbackErrorMessage` (e.g. tax's is `"Tax calculation failed. Please try again later."`).

**`totals-collector/` special case**: unlike the other three domains, Commerce only has *one*
`get_total_modifications.execute` subscription slot — the 9 discount actions
(`tiered-quantity-discount`, `tiered-category-discount`, `category-based-discount`,
`cheapest-item-discount`, `expensive-item-discount`, `cheapest-quantity-discount`,
`step-price-discount`, `multi-condition-discount`, `tiered-total-spend-discount`) are alternative
example implementations of the same webhook contract, not nine simultaneously-active webhooks. The
declarative config declares **one** `webhooks` entry pointing at a single default action (e.g.
`tiered-quantity-discount`), clearly commented in both the config and the README as a swappable
placeholder — the developer changes `runtimeAction` to whichever of the 9 examples they actually
want live.

## Docs

Each app gets its own `README.md`, following the App Management flow for install, build/deploy,
association, and configuration (linking out to Adobe's App Management docs for those generic
mechanics rather than re-documenting them). Each README retains only what's genuinely
domain-specific and not covered by App Management:

- The domain's webhook signature setup and `webhooks.xml` / System Webhooks Subscription steps.
- Links to the domain's use-case docs (payment-use-cases, shipping-use-cases, tax-use-cases).
- Domain-specific validation steps (e.g., "place an order and confirm the payment/shipping/tax
  method appears correctly").

## Repo / worktree strategy

Because the four domain apps share no code or tooling, they are built in **parallel, isolated git
worktrees** (via the `wt` CLI), each on its own branch off `main`: `shipping`, `payment`, `tax`,
`fees`. Each worktree gets its own implementation plan and is worked independently, so none of the
four PRs blocks on another. The "remove monolith" PR is created last, after all four are merged to
`main`, since it deletes root-level files that by then are superseded by the four new top-level
domain directories.

## PR sequence

1. **`shipping-method/`** — smallest domain (1 action, 1 install script). Establishes the
   `app.commerce.config.ts` + custom-installation-step pattern and validates the association-based
   auth approach for webhook actions before it's repeated elsewhere.
2. **`payment-method/`** — applies the validated pattern from (1).
3. **`tax-integration/`** — applies the pattern, plus the Admin UI v1→v2 migration.
4. **`totals-collector/`** — applies the pattern; no Commerce API client needed, so this is mostly
   action relocation plus dropping the Commerce-client dependency entirely.
5. **Remove the monolith** — delete all root-level app code, scripts, config, docs superseded by
   the four new apps.

Each PR is independently deployable and revertable. If the auth-swap spike in (1) fails, PRs 2-4
proceed with the legacy client for webhook actions instead, noted as a follow-up.

## Testing

- Existing tests under `test/lib`, `test/scripts` move alongside the code they test into each
  domain's `<domain-folder>/test/` directory.
- Tests for dropped scaffolding (`generic`, `3rd-party-events`, `commerce-events`) are deleted, not
  migrated.
- New tests are added for each rewritten `defineCustomInstallationStep` script and for the
  association-based auth path in webhook actions.
