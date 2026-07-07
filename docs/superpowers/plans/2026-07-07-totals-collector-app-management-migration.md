# Totals Collector App Management Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `total-collector-discounts` action group out of the checkout-starter-kit monolith into a fully self-contained, independently deployable App Management app at the repo-root directory `totals-collector/`.

**Architecture:** `totals-collector/` becomes a sibling of `actions/`, `lib/`, etc. (not nested under any shared `apps/` parent — there is no such parent). It owns every file it needs (`package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`) with zero shared root-level tooling. The 9 discount webhook actions, their shared helper module, and the Adobe tracking `info` action are relocated (not shared) into this directory. Because these actions never call the Commerce REST API — they are pure webhook payload transforms driven only by the incoming request body — the app carries a minimal webhook-signature-verification helper (`webhookVerify`, extracted from `lib/adobe-commerce.js`) instead of the full Commerce HTTP client (`got`, `oauth-1.0a`, `@adobe/aio-sdk`'s `Core.Logger`, OAuth env vars). All hand-rolled webhook JSON-patch response/operation builders (`webhookSuccessResponse`, `webhookErrorResponse`, `zeroDiscountOperation`, `discountOperation`, and every inline `{op:"replace"|"exception", ...}` object literal in the 9 actions) are replaced by the **beta** `@adobe/aio-commerce-sdk`'s typed builders (`ok`, `exceptionOperation`, `replaceOperation`), per the design spec's "SDK packages (beta)" section. `app.commerce.config.ts` declares only `metadata` — no `installation.customInstallationSteps` (there is no Commerce-side registration script for these actions today, and none is being added) and no `adminUi`.

**Tech Stack:** Node.js `^24.0.0`, App Builder (`aio app` runtime manifest), `@adobe/aio-commerce-lib-app` (config source of truth, beta), `@adobe/aio-commerce-sdk` (webhook operation/response builders, beta), Vitest 4, Biome 2 (`ultracite` presets), Husky + lint-staged.

## Global Constraints

- Root directory for this domain is `totals-collector/` at the repo root — **not** `apps/fees/` and **not** nested under any `apps/` parent (per the corrected spec at `docs/superpowers/specs/2026-07-07-app-management-domain-split-design.md`).
- `totals-collector/` is fully self-contained: own `package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`. No shared root-level tooling, no npm workspaces.
- Pin **beta** SDK versions exactly, per the spec's "SDK packages (beta)" table: `@adobe/aio-commerce-lib-app@1.8.0-beta-20260702145741` and `@adobe/aio-commerce-sdk@1.4.0-beta-20260702145741`. Do **not** add `@adobe/aio-commerce-lib-admin-ui` — that package is `tax-integration/`-only (Admin UI wire-contract builders), irrelevant here.
- No Commerce REST API client, no OAuth/IMS credentials, no `installation.customInstallationSteps`, and no association-based `getCommerceClient` auth anywhere in this app — these actions never call Commerce. `@adobe/aio-commerce-sdk`'s `webhooks/*` and `core/*` subpaths do **not** pull in a Commerce HTTP client or OAuth — they are pure JSON-shape builders — so adding that dependency does not violate this constraint.
- Do not modify the business logic inside any of the 9 discount actions (structural/config migration only). Response-envelope construction (how the JSON-patch operations are wrapped and returned) is explicitly in scope for this migration per the spec; the discount *calculation* logic (percentages, thresholds, eligibility rules) is not.
- The `commerce-checkout-starter-kit/info` action's tracking *behavior* must not change — its package address changes as an inherent consequence of the split, and (per Task 5) its `HTTP_OK` import is repointed from the deleted local `lib/http.js` to `@adobe/aio-commerce-sdk/core/responses` (same constant, same value); no other line changes.
- Do not touch `shipping-method/`, `payment-method/`, `tax-integration/`, or any root-level file outside what this plan creates (those domains are planned separately, in sibling worktrees).
- Do not remove the root-level monolith (`actions/`, `lib/`, etc.) — that happens in a separate, later "remove the monolith" PR after all four domains are merged.

---

## Source-of-truth reference (read, do not re-derive)

These facts were confirmed by reading the current repo, the design spec's "SDK packages (beta)" section, and the `@adobe/aio-commerce-sdk` monorepo source. They are load-bearing for the tasks below.

**Current repo behavior:**

- All 9 discount actions (`actions/total-collector-discounts/*/index.js`) import `{ webhookErrorResponse, webhookVerify }` from `lib/adobe-commerce.js`, `{ HTTP_OK }` from `lib/http.js`, and assorted helpers from `lib/total-collector-discounts.js`. None imports `got`, `oauth-1.0a`, `@adobe/aio-sdk`, or `getAdobeCommerceClient`.
- Every one of the 9 action files follows the **exact same structural template** (confirmed by reading all 9 in full):
  1. `webhookVerify` failure → `return webhookErrorResponse(\`Failed to verify the webhook signature: ${error}\`);`
  2. `parseJsonBody` returns `null` (invalid payload) → an inline `{statusCode: HTTP_OK, headers: {"Content-Type": "application/json"}, body: JSON.stringify([{ op: "exception", message: "Invalid webhook payload" }])}`.
  3. One or more "no discount applies" short-circuits → `{statusCode: HTTP_OK, headers: {"Content-Type": "application/json"}, body: JSON.stringify([zeroDiscountOperation()])}`.
  4. Success path → builds an `operations` array of per-item `{op: "replace", path: \`shippingAssignment/items/${idx}/<field>\`, value}` objects, plus one "result" op — **either** a call to the shared `discountOperation(totalDiscount, descriptionDict)` helper (`tiered-category-discount`, `category-based-discount`, `cheapest-quantity-discount`) **or** an inline `{op: "replace", path: "result", value: {code: "discount", base_discount: Number(x), discount_description_array: y}}` (`tiered-quantity-discount`, `cheapest-item-discount`, `expensive-item-discount`, `step-price-discount`, `multi-condition-discount`, `tiered-total-spend-discount`) — then `{statusCode: HTTP_OK, headers: {"Content-Type": "application/json"}, body: JSON.stringify(operations)}`.
  5. `catch (err)` → `return webhookErrorResponse(\`Server error: ${err.message}\`);`.
  - Two files (`tiered-category-discount`, `cheapest-quantity-discount`) additionally define a local `createItemBaseDiscountReplaceOp(index, combinedAmount)` helper returning `{op: "replace", path: \`shippingAssignment/items/${index}/base_discount_amount\`, value: round2(combinedAmount)}`.
- `lib/total-collector-discounts.js`'s exact current bodies (verified by reading the file):
  ```js
  export function zeroDiscountOperation() {
    return {
      op: "replace",
      path: "result",
      value: { code: "discount", base_discount: 0, discount_description_array: {} },
    };
  }

  export function discountOperation(totalDiscount, descriptionDict) {
    return {
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalDiscount),
        discount_description_array: descriptionDict,
      },
    };
  }
  ```
  `categoryFromSku` in that same file is **not exported** (module-private, only `itemCategoryFromSku` calls it) — a plan bug from an earlier draft of this document listed it as an expected export; Task 3 below corrects that.
- `webhookVerify`, `webhookErrorResponse`, `webhookSuccessResponse` (`lib/adobe-commerce.js:307-390`) depend only on `node:crypto` and the `HTTP_OK` constant from `lib/http.js` — zero dependency on `got`, `Oauth1a`, `@adobe/aio-sdk`, or `resolveAuthOptions`. Only `webhookVerify` is carried into `totals-collector/`; the two response helpers are replaced by the SDK (see below).
- `lib/http.js` is a tiny, self-contained file of HTTP status constants. It is **not** carried into `totals-collector/` at all: none of the 9 discount actions reference `HTTP_OK` once their response construction moves to `ok(...)` (Task 4), and the frozen `info` action's `HTTP_OK` need is sourced directly from `@adobe/aio-commerce-sdk/core/responses` instead (Task 5) — same constant name, same value (`200`), confirmed against `@adobe/aio-commerce-lib-core/source/responses/presets.ts`. "Do not change" governs the `info` action's tracking *behavior*, not literally freezing its import statement while the whole file is being relocated into a brand-new app anyway.
- `actions/commerce-checkout-starter-kit-info/index.js` (the `info` action) imports only `{ HTTP_OK }` from `../../lib/http.js` in the monolith, returns `{ statusCode: HTTP_OK }`, and its *behavior* must not change at all — see Task 5 for the one deliberate import-source substitution (`../../lib/http.js` → `@adobe/aio-commerce-sdk/core/responses`).
- `hooks/pre-app-build.js` runs `scripts/sync-oauth-credentials.js`, which exists solely to sync Commerce OAuth/IMS credentials — irrelevant to this domain. `totals-collector/app.config.yaml` must not declare a `pre-app-build` hook.
- No existing test file references `total-collector-discounts` or `lib/total-collector-discounts.js` (confirmed via a scoped search of `test/` and `e2e/`).
- `test/lib/adobe-commerce.test.js:110-176` contains a `describe("webhookVerify", ...)` block with 5 tests exercising exactly the function carried into `lib/webhooks.js`. These are ported as-is.

**`@adobe/aio-commerce-sdk` (beta) — exact shapes, confirmed against the SDK's own source and tests:**

- `@adobe/aio-commerce-sdk/webhooks/responses` re-exports `@adobe/aio-commerce-lib-webhooks`'s response/operation builders.
- `ok(operations)` takes **exactly one argument** — a single operation object *or* an array of operation objects (not variadic: `ok([a, b])`, not `ok(a, b)`). It returns a plain object `{ type: "success", statusCode: 200, body: operations }` — **not** JSON-stringified; `operations` is passed through verbatim as `body`. Confirmed by the SDK's own test: `ok(successOperation())` → `{ type: "success", statusCode: 200, body: { op: "success" } }`, and `ok([opA, opB, opC])` → `{ type: "success", statusCode: 200, body: [opA, opB, opC] }` (array preserved).
- `exceptionOperation(message, exceptionClass?)` → `{ op: "exception", ...(message && { message }), ...(exceptionClass && { type: exceptionClass }) }`. With just a message (no `exceptionClass`), this is exactly `{ op: "exception", message }` — the same shape the hand-rolled code already produces.
- `replaceOperation(path, value, instance?)` → `{ op: "replace", path, value, ...(instance && { instance }) }`. With no `instance` argument, this is exactly `{ op: "replace", path, value }` — the same 3-key shape the hand-rolled code already produces.
- `successOperation()` → `{ op: "success" }`. `addOperation`/`removeOperation` exist but are not needed by this domain (no action currently builds an `add`/`remove` op).
- None of these builders touch HTTP transport, Commerce auth, or environment variables — confirmed by reading their source, which has zero imports beyond internal type definitions.
- Because OpenWhisk/App Builder web actions already auto-JSON-serialize a non-string `body` and set `Content-Type: application/json` (this is the existing, already-shipped behavior other actions like `collect-taxes` rely on via `webhookSuccessResponse`/`webhookErrorResponse`, which likewise return an unstringified object body with no explicit headers), returning `ok(...)`'s `{type, statusCode, body}` object directly as an action's `main()` return value is behaviorally equivalent to the current hand-rolled `{statusCode, headers, body: JSON.stringify(...)}` pattern. The extra `type` field is not one of the fields OpenWhisk's web-action layer inspects (`statusCode`/`headers`/`body`/`error`) and is expected to be ignored. This equivalence is documented here as a traceable assumption (not independently verified against a live Commerce instance in this plan) — Task 9's README explicitly calls out re-verifying it during manual validation.
- `@adobe/aio-commerce-sdk/core/*` (generic action `responses`/`params`/`headers` helpers, re-exporting `@adobe/aio-commerce-lib-core`) is adopted in exactly one place: `HTTP_OK` for the frozen `info` action (Task 5), replacing the local `lib/http.js` copy that an earlier draft of this plan carried forward for no reason (it was the only consumer, and only ever used `HTTP_OK` — the other 4 constants in that file were dead weight). `core/params`/`core/headers` are still not adopted: none of the 9 discount actions perform bearer-token parsing or required-parameter checking those would replace.

**Webhook subscriptions — declarative `webhooks` config (confirmed against `@adobe/aio-commerce-lib-app`'s schema and the design spec's "Webhook subscriptions" section, sourced from `AdobeDocs/commerce-extensibility`):**

- `defineConfig`'s top-level `webhooks` array auto-subscribes the deployed action's Runtime URL to Commerce at install time — no custom installation-step code needed. This supersedes the lower-level, imperative `subscribeWebhook`/`unsubscribeWebhook` API from `@adobe/aio-commerce-lib-webhooks/api`.
- Each entry requires, at the entry level: `label` (string), `description` (string), `runtimeAction` (string), and optional `env` (array of `"paas"` and/or `"saas"` — omitted means all environments). Inside the nested `webhook` object, required fields are `webhook_method`, `webhook_type`, `batch_name`, `hook_name`, `method`; optional fields include `timeout`, `soft_timeout`, `fallback_error_message` (all **snake_case** — not `softTimeout`/`fallbackErrorMessage`).
- **`totals-collector/` special case**: Commerce exposes exactly **one** `get_total_modifications.execute` subscription slot for the entire domain — the 9 discount actions are alternative example implementations of that one contract, not 9 independently-active webhooks. So this app declares exactly **one** logical webhook — two `webhooks[]` entries only because the `webhook_method` string differs between PaaS and SaaS — both pointing at the same single default `runtimeAction` (`totals-collector/tiered-quantity-discount`), clearly commented as a swappable placeholder in both the config (Task 8) and the README (Task 9).
- Confirmed values: PaaS `webhook_method` is `plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute`; SaaS is `plugin.out_of_process_totals_collector.api.get_total_modifications.execute`. Both: `webhook_type: "after"`, `batch_name: "totals_collector"`, `hook_name: "totals_collector"`, `method: "POST"`, `timeout: 30000`, `soft_timeout: 1000`, `fallback_error_message: "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance."`.

---

### Task 1: Scaffold the independent `totals-collector/` app skeleton

**Files:**
- Create: `totals-collector/package.json`
- Create: `totals-collector/biome.jsonc`
- Create: `totals-collector/vitest.config.js`
- Create: `totals-collector/vitest.setup.js`
- Create: `totals-collector/.gitignore`
- Create: `totals-collector/.nvmrc`
- Create: `totals-collector/env.dist`
- Create: `totals-collector/.husky/pre-commit`
- Create: `totals-collector/tsconfig.json`

**Interfaces:**
- Produces: an installable, lintable, testable Node project rooted at `totals-collector/`, independent of the repo-root `package.json`/`node_modules`. All later tasks run `npm install`/`npm test`/`npm run lint:check` from inside `totals-collector/`.

- [ ] **Step 1: Create `totals-collector/package.json`**

```json
{
  "name": "totals-collector",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "dependencies": {
    "@adobe/aio-commerce-lib-app": "1.8.0-beta-20260702145741",
    "@adobe/aio-commerce-sdk": "1.4.0-beta-20260702145741"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.0",
    "@types/node": "^24.0.0",
    "@vitest/coverage-v8": "^4.0.7",
    "husky": "^9.1.7",
    "lint-staged": "^17.0.0",
    "typescript": "^5.7.0",
    "ultracite": "^7.0.0",
    "vitest": "^4.0.7"
  },
  "scripts": {
    "prepare": "husky",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint:check": "npx biome lint .",
    "lint": "npx biome lint --write .",
    "format:check": "npx biome format .",
    "format": "npx biome format --write .",
    "code:check": "npx biome check .",
    "code:fix": "npx biome check --write ."
  },
  "engines": {
    "node": "^24.0.0"
  },
  "lint-staged": {
    "*": [
      "npm run code:fix"
    ]
  }
}
```

Note: `@adobe/aio-commerce-lib-app` and `@adobe/aio-commerce-sdk` are pinned to **exact** beta version strings (no `^`/`~` range) since these are pre-release versions per the design spec's "SDK packages (beta)" table. No `@adobe/aio-commerce-lib-admin-ui` (that's `tax-integration/`-only). No `got`, `oauth-1.0a`, `@adobe/aio-sdk`, `js-yaml`, or `dotenv` — this app has no Commerce HTTP client and no `create-*` onboarding script.

- [ ] **Step 2: Create `totals-collector/biome.jsonc`**

```jsonc
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["ultracite/biome/core"],
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true
  },
  "javascript": {
    "formatter": {
      "arrowParentheses": "always",
      "bracketSameLine": true,
      "jsxQuoteStyle": "double",
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on",
          "options": {
            "groups": [
              { "type": false, "source": [":BUN:", ":NODE:"] },
              ":BLANK_LINE:",
              { "type": false, "source": [":PACKAGE:", ":PACKAGE_WITH_PROTOCOL:"] },
              ":BLANK_LINE:",
              { "type": false, "source": [":ALIAS:"] },
              ":BLANK_LINE:",
              { "type": false, "source": [":PATH:"] },
              ":BLANK_LINE:",
              { "type": true, "source": [":BUN:", ":NODE:"] },
              { "type": true, "source": [":PACKAGE:", ":PACKAGE_WITH_PROTOCOL:"] },
              { "type": true, "source": [":ALIAS:"] },
              { "type": true, "source": [":PATH:"] }
            ]
          }
        }
      }
    }
  }
}
```

This drops the root config's `ultracite/biome/react` preset and the `commerce-backend-ui-1` React-specific override — this app has no UI code.

- [ ] **Step 3: Create `totals-collector/vitest.config.js`**

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.js"],
    include: ["test/**/*.test.js"],
    exclude: ["node_modules", "dist"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["actions/**/*.js", "lib/**/*.js"],
      exclude: ["node_modules/", "dist/", "test/"],
    },
  },
});
```

- [ ] **Step 4: Create `totals-collector/vitest.setup.js`**

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});
```

This app never calls `fetch`, so the root's `global.fetch` mock setup is dropped.

- [ ] **Step 5: Create `totals-collector/.gitignore`**

```
# package directories
node_modules
jspm_packages

# logging
logs
*.log

# build
build
dist
.manifest-dist.yml

# Config
.env*
.aio

# Adobe I/O console config
console.json
ws.json

# IDE & Temp
.cache
.idea
.nyc_output
.vscode
coverage
```

- [ ] **Step 6: Create `totals-collector/.nvmrc`**

```
24.18.0
```

- [ ] **Step 7: Create `totals-collector/env.dist`**

```
# Required if webhooks are used and signature verification is enabled.
# See https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action
COMMERCE_WEBHOOKS_PUBLIC_KEY=
```

This app has no Commerce base URL, OAuth, or IMS variables — it never calls Commerce.

- [ ] **Step 8: Create `totals-collector/.husky/pre-commit`**

```bash
npx lint-staged
```

Then make it executable:

```bash
chmod +x totals-collector/.husky/pre-commit
```

- [ ] **Step 9: Create `totals-collector/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 10: Install and verify the toolchain resolves**

```bash
cd totals-collector && npm install
```

Expected: install succeeds with no peer-dependency errors. If the beta versions are not resolvable from the configured npm registry, confirm with the coordinator which registry/dist-tag hosts `1.8.0-beta-20260702145741` / `1.4.0-beta-20260702145741` before proceeding — do not silently substitute a different version.

```bash
cd totals-collector && npx biome --version && npx vitest --version && npx tsc --version
```

Expected: each prints a version number (toolchain is wired and independent of the repo-root `node_modules`).

- [ ] **Step 11: Commit**

```bash
git add totals-collector/package.json totals-collector/biome.jsonc totals-collector/vitest.config.js totals-collector/vitest.setup.js totals-collector/.gitignore totals-collector/.nvmrc totals-collector/env.dist totals-collector/.husky/pre-commit totals-collector/tsconfig.json totals-collector/package-lock.json
git commit -m "totals-collector: scaffold independent app skeleton"
```

---

### Task 2: Extract the webhook signature helper into `totals-collector/lib/`

**Files:**
- Create: `totals-collector/lib/webhooks.js`
- Test: `totals-collector/test/lib/webhooks.test.js`

**Interfaces:**
- Produces: `webhookVerify(params)` from `totals-collector/lib/webhooks.js` — consumed by all 9 discount actions in Task 4.
- **Not produced** (unlike an earlier draft of this plan): `webhookErrorResponse`/`webhookSuccessResponse`. Per the design spec's "SDK packages (beta)" section, these are replaced by `@adobe/aio-commerce-sdk/webhooks/responses`'s `ok`/`exceptionOperation`, used directly in Task 4 — they are not carried into this app at all.
- **Not produced either**: a local `totals-collector/lib/http.js`. The frozen `info` action's `HTTP_OK` need is sourced directly from `@adobe/aio-commerce-sdk/core/responses` in Task 5 instead — "do not change" governs the `info` action's tracking *behavior*, not literally freezing an import statement while the whole file is being relocated into a brand-new app anyway. There is otherwise no consumer of a generic HTTP-status-constants module left in this domain once Task 4 migrates the 9 discount actions to `ok(...)`.

- [ ] **Step 1: Write the failing test — port the existing `webhookVerify` suite**

Create `totals-collector/test/lib/webhooks.test.js`:

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import crypto from "node:crypto";

import { describe, expect, test } from "vitest";

import * as webhooksModule from "../../lib/webhooks.js";
import { webhookVerify } from "../../lib/webhooks.js";

describe("webhooks module surface", () => {
  test("exports only webhookVerify — response helpers come from @adobe/aio-commerce-sdk", () => {
    expect(Object.keys(webhooksModule)).toEqual(["webhookVerify"]);
  });
});

describe("webhookVerify", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 512,
  });
  const body = JSON.stringify({ test: "data" });
  const signature = crypto
    .createSign("SHA256")
    .update(body)
    .sign(privateKey, "base64");

  test("should return success true for valid signature", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);
    expect(result).toEqual({ success: true });
  });

  test("should return success false for missing signature header", () => {
    const params = {
      __ow_headers: {},
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);

    expect(result).toEqual({ success: false, error: expect.any(String) });
  });

  test("should return success false for missing body", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);

    expect(result).toEqual({ success: false, error: expect.any(String) });
  });

  test("should return success false for missing public key", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      __ow_body: body,
    };

    const result = webhookVerify(params);

    expect(result).toEqual({ success: false, error: expect.any(String) });
  });

  test("should return success false for invalid signature", () => {
    const invalidSignature = "invalid-signature";
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": invalidSignature },
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);
    expect(result).toEqual({ success: false, error: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd totals-collector && npx vitest run test/lib/webhooks.test.js
```

Expected: FAIL — `Cannot find module '../../lib/webhooks.js'` (file doesn't exist yet).

- [ ] **Step 3: Create `totals-collector/lib/webhooks.js`**

```js
/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import crypto from "node:crypto";

/**
 * Verifies the signature of the webhook request.
 * @param {object} params input parameters
 * @param {object} params.__ow_headers request headers
 * @param {string} params.__ow_body request body, requires the following annotation in the action `raw-http: true`
 * @param {string} params.COMMERCE_WEBHOOKS_PUBLIC_KEY the public key to verify the signature configured in the Commerce instance
 * @returns {{success: boolean}|{success: boolean, error: string}} weather the signature is valid or not
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification
 */
export function webhookVerify({
  __ow_headers: headers = {},
  __ow_body: body,
  COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
}) {
  const signature = headers["x-adobe-commerce-webhook-signature"];
  if (!signature) {
    return {
      success: false,
      error:
        "Header `x-adobe-commerce-webhook-signature` not found. Make sure Webhooks signature is enabled in the Commerce instance.",
    };
  }
  if (!body) {
    return {
      success: false,
      error:
        "Request body not found. Make sure the the action is configured with `raw-http: true`.",
    };
  }
  if (!publicKey) {
    return {
      success: false,
      error:
        "Public key not found. Make sure the the action is configured with the input `COMMERCE_WEBHOOKS_PUBLIC_KEY` and it is defined in .env file.",
    };
  }

  const verifier = crypto.createVerify("SHA256");
  verifier.update(body);
  const success = verifier.verify(publicKey, signature, "base64");
  return {
    success,
    ...(!success && { error: "Signature verification failed." }),
  };
}
```

Note: this file has no `webhookErrorResponse`/`webhookSuccessResponse` — those are replaced by `@adobe/aio-commerce-sdk/webhooks/responses`'s `ok`/`exceptionOperation`, imported directly where needed (Task 4). No import of `got`, `Oauth1a`, `@adobe/aio-sdk`, or `resolveAuthOptions` — only `node:crypto`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd totals-collector && npx vitest run test/lib/webhooks.test.js
```

Expected: PASS — 6 tests (1 module-surface check, 5 `webhookVerify`).

- [ ] **Step 5: Commit**

```bash
git add totals-collector/lib/webhooks.js totals-collector/test/lib/webhooks.test.js
git commit -m "totals-collector: extract webhookVerify, drop Commerce HTTP client"
```

---

### Task 3: Copy the shared discount helper module, rebuilt on the SDK's operation builders

**Files:**
- Create: `totals-collector/lib/total-collector-discounts.js`
- Test: `totals-collector/test/lib/total-collector-discounts.test.js`

**Interfaces:**
- Consumes: `replaceOperation` from `@adobe/aio-commerce-sdk/webhooks/responses` (Task 1's `package.json` dependency).
- Produces: `parseJsonBody`, `round2`, `getShippingItems`, `itemIdentifierForLookup`, `buildQuoteItemIndex`, `resolveQuoteLineForShippingItem`, `getExistingItemBaseDiscount`, `getExistingItemDiscountAmount`, `zeroDiscountOperation`, `discountOperation`, `itemCategoryFromSku` — consumed by the discount actions in Task 4. (`categoryFromSku` is module-private and is **not** exported — see the Source-of-truth section above.)

`zeroDiscountOperation()` and `discountOperation(totalDiscount, descriptionDict)` are the two "ad-hoc discount-operation object builders" the design spec calls out for replacement. Their call signature and return **shape** stay byte-for-byte identical (verified below) — only their internal implementation changes to delegate to the SDK's `replaceOperation`, so every one of the 9 action files that already calls these two functions (`tiered-category-discount`, `category-based-discount`, `cheapest-quantity-discount`, plus every action's `zeroDiscountOperation()` short-circuit) needs **no changes at their call sites** for this specific function — only their import path changes (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `totals-collector/test/lib/total-collector-discounts.test.js`:

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { replaceOperation } from "@adobe/aio-commerce-sdk/webhooks/responses";
import { describe, expect, test } from "vitest";

import * as totalCollectorDiscounts from "../../lib/total-collector-discounts.js";

describe("total-collector-discounts module", () => {
  test("exports every helper the discount actions rely on (categoryFromSku is module-private, not exported)", () => {
    const expectedExports = [
      "parseJsonBody",
      "round2",
      "getShippingItems",
      "itemIdentifierForLookup",
      "buildQuoteItemIndex",
      "resolveQuoteLineForShippingItem",
      "getExistingItemBaseDiscount",
      "getExistingItemDiscountAmount",
      "zeroDiscountOperation",
      "discountOperation",
      "itemCategoryFromSku",
    ];

    for (const exportName of expectedExports) {
      expect(typeof totalCollectorDiscounts[exportName]).toBe("function");
    }
    expect(totalCollectorDiscounts.categoryFromSku).toBeUndefined();
  });

  test("zeroDiscountOperation matches the SDK's replaceOperation('result', ...) shape exactly", () => {
    expect(totalCollectorDiscounts.zeroDiscountOperation()).toEqual(
      replaceOperation("result", {
        code: "discount",
        base_discount: 0,
        discount_description_array: {},
      }),
    );
  });

  test("zeroDiscountOperation preserves the exact hand-rolled JSON shape it replaces", () => {
    expect(totalCollectorDiscounts.zeroDiscountOperation()).toEqual({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: 0,
        discount_description_array: {},
      },
    });
  });

  test("discountOperation matches the SDK's replaceOperation('result', ...) shape exactly", () => {
    const result = totalCollectorDiscounts.discountOperation(12.5, {
      1: "test rule",
    });
    expect(result).toEqual(
      replaceOperation("result", {
        code: "discount",
        base_discount: 12.5,
        discount_description_array: { 1: "test rule" },
      }),
    );
  });

  test("discountOperation preserves the exact hand-rolled JSON shape it replaces", () => {
    const result = totalCollectorDiscounts.discountOperation("7.5", {
      1: "test rule",
    });
    expect(result).toEqual({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: 7.5,
        discount_description_array: { 1: "test rule" },
      },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd totals-collector && npx vitest run test/lib/total-collector-discounts.test.js
```

Expected: FAIL — `Cannot find module '../../lib/total-collector-discounts.js'` (file doesn't exist yet).

- [ ] **Step 3: Copy the file from the monolith, then update only the two operation-builder bodies**

```bash
cp /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees/lib/total-collector-discounts.js \
   /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees/totals-collector/lib/total-collector-discounts.js
```

Then add the SDK import at the top of `totals-collector/lib/total-collector-discounts.js`:

```js
/**
 * Shared helpers for total-collector discount actions.
 */

import { replaceOperation } from "@adobe/aio-commerce-sdk/webhooks/responses";

export function parseJsonBody(params) {
```

And replace the two operation-builder function bodies:

Old:
```js
export function zeroDiscountOperation() {
  return {
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: 0,
      discount_description_array: {},
    },
  };
}

export function discountOperation(totalDiscount, descriptionDict) {
  return {
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: Number(totalDiscount),
      discount_description_array: descriptionDict,
    },
  };
}
```

New:
```js
export function zeroDiscountOperation() {
  return replaceOperation("result", {
    code: "discount",
    base_discount: 0,
    discount_description_array: {},
  });
}

export function discountOperation(totalDiscount, descriptionDict) {
  return replaceOperation("result", {
    code: "discount",
    base_discount: Number(totalDiscount),
    discount_description_array: descriptionDict,
  });
}
```

Every other function in the file (`parseJsonBody`, `round2`, `getShippingItems`, `itemIdentifierForLookup`, `buildQuoteItemIndex`, `resolveQuoteLineForShippingItem`, `getExistingItemBaseDiscount`, `getExistingItemDiscountAmount`, `categoryFromSku`, `itemCategoryFromSku`) is unchanged from the monolith's copy.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd totals-collector && npx vitest run test/lib/total-collector-discounts.test.js
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add totals-collector/lib/total-collector-discounts.js totals-collector/test/lib/total-collector-discounts.test.js
git commit -m "totals-collector: copy discount helper module, rebuild operation builders on the SDK"
```

---

### Task 4: Relocate the 9 discount webhook actions and migrate their responses to the SDK's webhook operation builders

**Files:**
- Create: `totals-collector/actions/tiered-quantity-discount/index.js`
- Create: `totals-collector/actions/tiered-category-discount/index.js`
- Create: `totals-collector/actions/category-based-discount/index.js`
- Create: `totals-collector/actions/cheapest-item-discount/index.js`
- Create: `totals-collector/actions/expensive-item-discount/index.js`
- Create: `totals-collector/actions/cheapest-quantity-discount/index.js`
- Create: `totals-collector/actions/step-price-discount/index.js`
- Create: `totals-collector/actions/multi-condition-discount/index.js`
- Create: `totals-collector/actions/tiered-total-spend-discount/index.js`
- Test: `totals-collector/test/actions/total-collector-discounts.test.js`

**Interfaces:**
- Consumes: `webhookVerify` from `../../lib/webhooks.js` (Task 2); helpers from `../../lib/total-collector-discounts.js` (Task 3); `ok`, `exceptionOperation`, `replaceOperation` from `@adobe/aio-commerce-sdk/webhooks/responses`.
- Produces: `export function main(params)` in each of the 9 files — consumed by `totals-collector/app.config.yaml` in Task 6.

**No discount-calculation business logic changes.** Every discount threshold, percentage, and eligibility rule is untouched. What changes, uniformly across all 9 files (confirmed identical in every file by reading them in full), is *only* how each response is constructed and returned:

| Old (hand-rolled) | New (SDK) |
|---|---|
| `return webhookErrorResponse(\`Failed to verify the webhook signature: ${error}\`);` | `return ok(exceptionOperation(\`Failed to verify the webhook signature: ${error}\`));` |
| `{statusCode: HTTP_OK, headers: {...}, body: JSON.stringify([{op:"exception", message:"Invalid webhook payload"}])}` | `ok(exceptionOperation("Invalid webhook payload"))` |
| `{statusCode: HTTP_OK, headers: {...}, body: JSON.stringify([zeroDiscountOperation()])}` | `ok(zeroDiscountOperation())` |
| `{statusCode: HTTP_OK, headers: {...}, body: JSON.stringify(operations)}` | `ok(operations)` |
| `operations.push({op:"replace", path: \`shippingAssignment/items/${idx}/<field>\`, value})` | `operations.push(replaceOperation(\`shippingAssignment/items/${idx}/<field>\`, value))` |
| inline `operations.push({op:"replace", path:"result", value:{...}})` | `operations.push(replaceOperation("result", {...}))` |
| `return webhookErrorResponse(\`Server error: ${err.message}\`);` (catch block) | `return ok(exceptionOperation(\`Server error: ${err.message}\`));` |

`zeroDiscountOperation()`/`discountOperation(...)` **call sites are unchanged** — only their internal implementation changed (Task 3).

- [ ] **Step 1: Copy all 9 action files verbatim (import-path and response-construction edits come next)**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees
for name in tiered-quantity-discount tiered-category-discount category-based-discount \
            cheapest-item-discount expensive-item-discount cheapest-quantity-discount \
            step-price-discount multi-condition-discount tiered-total-spend-discount; do
  mkdir -p "totals-collector/actions/${name}"
  cp "actions/total-collector-discounts/${name}/index.js" "totals-collector/actions/${name}/index.js"
done
```

- [ ] **Step 2: `tiered-quantity-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch:

Old:
```js
    if (!success) {
      return webhookErrorResponse(
        `Failed to verify the webhook signature: ${error}`,
      );
    }
```

New:
```js
    if (!success) {
      return ok(
        exceptionOperation(`Failed to verify the webhook signature: ${error}`),
      );
    }
```

Replace the invalid-payload branch:

Old:
```js
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { op: "exception", message: "Invalid webhook payload" },
        ]),
      };
```

New:
```js
      return ok(exceptionOperation("Invalid webhook payload"));
```

Replace all 3 occurrences of the zero-discount branch (use `replace_all` — the text is identical in all 3 spots in this file):

Old:
```js
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
```

New:
```js
      return ok(zeroDiscountOperation());
```

Replace the per-item operation pushes inside the `for (const row of perLine)` loop:

Old:
```js
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedBase,
      });
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_amount`,
        value: combinedStore,
      });
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_percent`,
        value: Number(percentage),
      });
```

New:
```js
      operations.push(
        replaceOperation(
          `shippingAssignment/items/${idx}/base_discount_amount`,
          combinedBase,
        ),
        replaceOperation(
          `shippingAssignment/items/${idx}/discount_amount`,
          combinedStore,
        ),
        replaceOperation(
          `shippingAssignment/items/${idx}/discount_percent`,
          Number(percentage),
        ),
      );
```

Replace the inline "result" operation:

Old:
```js
    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalTierBaseDiscount),
        discount_description_array: { 1: ruleLabel },
      },
    });
```

New:
```js
    operations.push(
      replaceOperation("result", {
        code: "discount",
        base_discount: Number(totalTierBaseDiscount),
        discount_description_array: { 1: ruleLabel },
      }),
    );
```

Replace the final success return:

Old:
```js
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operations),
    };
```

New:
```js
    return ok(operations);
```

Replace the catch block:

Old:
```js
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
```

New:
```js
  } catch (err) {
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
```

- [ ] **Step 3: `tiered-category-discount` — update imports, the local helper, and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  buildQuoteItemIndex,
  discountOperation,
  getExistingItemBaseDiscount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  buildQuoteItemIndex,
  discountOperation,
  getExistingItemBaseDiscount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the local helper (`discountOperation(...)` call sites elsewhere in this file are unchanged):

Old:
```js
function createItemBaseDiscountReplaceOp(index, combinedAmount) {
  return {
    op: "replace",
    path: `shippingAssignment/items/${index}/base_discount_amount`,
    value: round2(combinedAmount),
  };
}
```

New:
```js
function createItemBaseDiscountReplaceOp(index, combinedAmount) {
  return replaceOperation(
    `shippingAssignment/items/${index}/base_discount_amount`,
    round2(combinedAmount),
  );
}
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace all 3 occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 4: `category-based-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  buildQuoteItemIndex,
  discountOperation,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  buildQuoteItemIndex,
  discountOperation,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace both occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the per-item operation pushes (`discountOperation(...)` at array-init is unchanged):

Old:
```js
    const operations = [discountOperation(totalNewBase, { 1: ruleLabel })];

    const idx = cheapestIndex;
    operations.push(
      {
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedBase,
      },
      {
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_amount`,
        value: combinedStore,
      },
      {
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_percent`,
        value: discountPercent,
      },
    );
```

New:
```js
    const operations = [discountOperation(totalNewBase, { 1: ruleLabel })];

    const idx = cheapestIndex;
    operations.push(
      replaceOperation(
        `shippingAssignment/items/${idx}/base_discount_amount`,
        combinedBase,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_amount`,
        combinedStore,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_percent`,
        discountPercent,
      ),
    );
```

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 5: `cheapest-item-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  buildQuoteItemIndex,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  buildQuoteItemIndex,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace both occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the per-item pushes plus the inline "result" push (these are 4 consecutive `operations.push(...)` statements in this file — combine into one call):

Old:
```js
    const operations = [];

    const idx = cheapestIndex;
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/base_discount_amount`,
      value: combinedBase,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_amount`,
      value: combinedStore,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_percent`,
      value: discountPercent,
    });
    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalNewBase),
        discount_description_array: { 1: ruleLabel },
      },
    });
```

New:
```js
    const operations = [];

    const idx = cheapestIndex;
    operations.push(
      replaceOperation(
        `shippingAssignment/items/${idx}/base_discount_amount`,
        combinedBase,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_amount`,
        combinedStore,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_percent`,
        discountPercent,
      ),
      replaceOperation("result", {
        code: "discount",
        base_discount: Number(totalNewBase),
        discount_description_array: { 1: ruleLabel },
      }),
    );
```

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 6: `expensive-item-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  buildQuoteItemIndex,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  buildQuoteItemIndex,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace both occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the per-item pushes plus the inline "result" push (note the blank line between the 3rd push and the "result" push in the original — combine into one call regardless):

Old:
```js
    const operations = [];
    const idx = expensiveIndex;

    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/base_discount_amount`,
      value: combinedBase,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_amount`,
      value: combinedStore,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_percent`,
      value: discountPercent,
    });

    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalNewBase),
        discount_description_array: { 1: ruleLabel },
      },
    });
```

New:
```js
    const operations = [];
    const idx = expensiveIndex;

    operations.push(
      replaceOperation(
        `shippingAssignment/items/${idx}/base_discount_amount`,
        combinedBase,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_amount`,
        combinedStore,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_percent`,
        discountPercent,
      ),
      replaceOperation("result", {
        code: "discount",
        base_discount: Number(totalNewBase),
        discount_description_array: { 1: ruleLabel },
      }),
    );
```

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 7: `cheapest-quantity-discount` — update imports, the local helper, and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  discountOperation,
  getExistingItemBaseDiscount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  discountOperation,
  getExistingItemBaseDiscount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the local helper (`discountOperation(...)` call site elsewhere in this file is unchanged):

Old:
```js
function createItemBaseDiscountReplaceOp(index, combinedAmount) {
  return {
    op: "replace",
    path: `shippingAssignment/items/${index}/base_discount_amount`,
    value: round2(combinedAmount),
  };
}
```

New:
```js
function createItemBaseDiscountReplaceOp(index, combinedAmount) {
  return replaceOperation(
    `shippingAssignment/items/${index}/base_discount_amount`,
    round2(combinedAmount),
  );
}
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace both occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 8: `step-price-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace all 3 occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the per-item operation pushes inside the `for (const row of perLine)` loop:

Old:
```js
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedBase,
      });
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_amount`,
        value: combinedStore,
      });
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_percent`,
        value: discountPercent,
      });
```

New:
```js
      operations.push(
        replaceOperation(
          `shippingAssignment/items/${idx}/base_discount_amount`,
          combinedBase,
        ),
        replaceOperation(
          `shippingAssignment/items/${idx}/discount_amount`,
          combinedStore,
        ),
        replaceOperation(
          `shippingAssignment/items/${idx}/discount_percent`,
          discountPercent,
        ),
      );
```

Replace the inline "result" operation:

Old:
```js
    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalPromoBase),
        discount_description_array: {
          1: `${RULE_LABEL} (${tierNote})`,
        },
      },
    });
```

New:
```js
    operations.push(
      replaceOperation("result", {
        code: "discount",
        base_discount: Number(totalPromoBase),
        discount_description_array: {
          1: `${RULE_LABEL} (${tierNote})`,
        },
      }),
    );
```

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 9: `multi-condition-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace all 3 occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the per-item operation pushes inside the `for (const row of perLine)` loop:

Old:
```js
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedBase,
      });
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_amount`,
        value: combinedStore,
      });
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_percent`,
        value: DISCOUNT_PERCENT,
      });
```

New:
```js
      operations.push(
        replaceOperation(
          `shippingAssignment/items/${idx}/base_discount_amount`,
          combinedBase,
        ),
        replaceOperation(
          `shippingAssignment/items/${idx}/discount_amount`,
          combinedStore,
        ),
        replaceOperation(
          `shippingAssignment/items/${idx}/discount_percent`,
          DISCOUNT_PERCENT,
        ),
      );
```

Replace the inline "result" operation:

Old:
```js
    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalPromoBase),
        discount_description_array: { 1: RULE_LABEL },
      },
    });
```

New:
```js
    operations.push(
      replaceOperation("result", {
        code: "discount",
        base_discount: Number(totalPromoBase),
        discount_description_array: { 1: RULE_LABEL },
      }),
    );
```

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 10: `tiered-total-spend-discount` — update imports and response construction**

Replace the import block:

Old:
```js
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  getExistingItemBaseDiscount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";
```

New:
```js
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhooks.js";
import {
  getExistingItemBaseDiscount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
```

Replace the signature-verification-failure branch (same old/new text as Step 2).

Replace the invalid-payload branch (same old/new text as Step 2).

Replace both occurrences of the zero-discount branch (same old/new text as Step 2, `replace_all`).

Replace the single per-item operation push inside the `for (const row of perLine)` loop:

Old:
```js
      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedLine,
      });
```

New:
```js
      operations.push(
        replaceOperation(
          `shippingAssignment/items/${idx}/base_discount_amount`,
          combinedLine,
        ),
      );
```

Replace the inline "result" operation (preserve the inline comment):

Old:
```js
    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        // Cart result sends promo-only discount for this rule execution.
        base_discount: Number(totalPromoBase),
        discount_description_array: { 1: tier.label },
      },
    });
```

New:
```js
    operations.push(
      replaceOperation("result", {
        code: "discount",
        // Cart result sends promo-only discount for this rule execution.
        base_discount: Number(totalPromoBase),
        discount_description_array: { 1: tier.label },
      }),
    );
```

Replace the final success return (same old/new text as Step 2).

Replace the catch block (same old/new text as Step 2).

- [ ] **Step 11: Verify no file still references the removed helper, the old 3-levels-up path, or `HTTP_OK`**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees
grep -rn '\.\./\.\./\.\./lib\|adobe-commerce\.js\|webhookErrorResponse\|webhookSuccessResponse\|HTTP_OK' totals-collector/actions/
```

Expected: no output.

- [ ] **Step 12: Write a cross-action regression test for the migrated response wiring**

This does not re-test discount math (unchanged, out of scope) — it proves the relocated import wiring resolves and that every action now returns the SDK's `ok(...)` envelope (the `type: "success"` assertion specifically guards against a stray hand-rolled response object coincidentally matching `statusCode`/`body`).

Create `totals-collector/test/actions/total-collector-discounts.test.js`:

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { describe, expect, test } from "vitest";

import { main as tieredQuantityDiscount } from "../../actions/tiered-quantity-discount/index.js";
import { main as tieredCategoryDiscount } from "../../actions/tiered-category-discount/index.js";
import { main as categoryBasedDiscount } from "../../actions/category-based-discount/index.js";
import { main as cheapestItemDiscount } from "../../actions/cheapest-item-discount/index.js";
import { main as expensiveItemDiscount } from "../../actions/expensive-item-discount/index.js";
import { main as cheapestQuantityDiscount } from "../../actions/cheapest-quantity-discount/index.js";
import { main as stepPriceDiscount } from "../../actions/step-price-discount/index.js";
import { main as multiConditionDiscount } from "../../actions/multi-condition-discount/index.js";
import { main as tieredTotalSpendDiscount } from "../../actions/tiered-total-spend-discount/index.js";

const discountActions = [
  ["tiered-quantity-discount", tieredQuantityDiscount],
  ["tiered-category-discount", tieredCategoryDiscount],
  ["category-based-discount", categoryBasedDiscount],
  ["cheapest-item-discount", cheapestItemDiscount],
  ["expensive-item-discount", expensiveItemDiscount],
  ["cheapest-quantity-discount", cheapestQuantityDiscount],
  ["step-price-discount", stepPriceDiscount],
  ["multi-condition-discount", multiConditionDiscount],
  ["tiered-total-spend-discount", tieredTotalSpendDiscount],
];

describe("relocated total-collector discount actions", () => {
  test.each(discountActions)("%s exports a main function", (_name, main) => {
    expect(typeof main).toBe("function");
  });

  test.each(discountActions)(
    "%s rejects a request with a missing webhook signature via the SDK's ok(exceptionOperation(...))",
    (_name, main) => {
      const result = main({
        __ow_headers: {},
        __ow_body: Buffer.from(JSON.stringify({})).toString("base64"),
        COMMERCE_WEBHOOKS_PUBLIC_KEY: "not-a-real-key",
      });

      expect(result.type).toBe("success");
      expect(result.statusCode).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({ op: "exception" }),
      );
    },
  );
});
```

- [ ] **Step 13: Run the tests**

```bash
cd totals-collector && npx vitest run test/actions/total-collector-discounts.test.js
```

Expected: PASS — 18 tests (9 actions × 2 assertions each).

- [ ] **Step 14: Commit**

```bash
git add totals-collector/actions totals-collector/test/actions/total-collector-discounts.test.js
git commit -m "totals-collector: relocate discount actions, migrate responses to @adobe/aio-commerce-sdk webhook operations"
```

---

### Task 5: Relocate the Adobe tracking `info` action (tracking behavior frozen; `HTTP_OK` import repointed to the SDK)

**Files:**
- Create: `totals-collector/actions/commerce-checkout-starter-kit-info/index.js`
- Test: `totals-collector/test/actions/commerce-checkout-starter-kit-info.test.js`

**Interfaces:**
- Consumes: `HTTP_OK` from `@adobe/aio-commerce-sdk/core/responses` (Task 1's `package.json` dependency) instead of a local `lib/http.js` copy. Same constant name, same value (`200`) — confirmed against `@adobe/aio-commerce-lib-core/source/responses/presets.ts`. This is the only line in this file that changes; the action's tracking *behavior* (`{ statusCode: 200 }`) is identical to the monolith's copy. There is no `totals-collector/lib/http.js` in this app at all — see Task 2's note.
- Produces: `export function main(_params)` — consumed by `totals-collector/app.config.yaml` in Task 6 as the `info` action.

- [ ] **Step 1: Copy the file, then repoint its one import at the SDK**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees
mkdir -p totals-collector/actions/commerce-checkout-starter-kit-info
cp actions/commerce-checkout-starter-kit-info/index.js \
   totals-collector/actions/commerce-checkout-starter-kit-info/index.js
```

Then replace the one import line in `totals-collector/actions/commerce-checkout-starter-kit-info/index.js`:

Old:
```js
import { HTTP_OK } from "../../lib/http.js";
```

New:
```js
import { HTTP_OK } from "@adobe/aio-commerce-sdk/core/responses";
```

Nothing else in the file changes — same doc comment ("Please DO NOT DELETE this action..."), same `export function main(_params) { return { statusCode: HTTP_OK }; }` body.

- [ ] **Step 2: Verify the only diff is the import source**

```bash
diff actions/commerce-checkout-starter-kit-info/index.js \
     totals-collector/actions/commerce-checkout-starter-kit-info/index.js
```

Expected: exactly one changed line — the `import` statement's module specifier (`../../lib/http.js` → `@adobe/aio-commerce-sdk/core/responses`). No other diff.

- [ ] **Step 3: Write a smoke test matching the original action's own doc comment ("do not delete")**

Create `totals-collector/test/actions/commerce-checkout-starter-kit-info.test.js`:

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { describe, expect, test } from "vitest";

import { main } from "../../actions/commerce-checkout-starter-kit-info/index.js";

describe("commerce-checkout-starter-kit-info", () => {
  test("returns HTTP 200 for tracking purposes", () => {
    expect(main({})).toEqual({ statusCode: 200 });
  });
});
```

- [ ] **Step 4: Run the test**

```bash
cd totals-collector && npx vitest run test/actions/commerce-checkout-starter-kit-info.test.js
```

Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add totals-collector/actions/commerce-checkout-starter-kit-info totals-collector/test/actions/commerce-checkout-starter-kit-info.test.js
git commit -m "totals-collector: relocate the commerce-checkout-starter-kit-info tracking action (behavior unchanged, HTTP_OK now sourced from the SDK)"
```

---

### Task 6: Write `totals-collector/app.config.yaml`

**Files:**
- Create: `totals-collector/app.config.yaml`

**Interfaces:**
- Consumes: the 10 action files created in Task 4 and Task 5.
- Produces: the App Builder runtime manifest that `aio app` and `@adobe/aio-commerce-lib-app` read as the deployment descriptor.

- [ ] **Step 1: Create `totals-collector/app.config.yaml`**

```yaml
application:
  actions: actions
  runtimeManifest:
    packages:
      totals-collector:
        license: Apache-2.0
        actions:
          # Do not change the action `totals-collector/info` as it is used by tracking purposes
          info:
            function: actions/commerce-checkout-starter-kit-info/index.js
            web: 'yes'
            runtime: nodejs:24
            annotations:
              require-adobe-auth: true
              final: true
          tiered-quantity-discount:
            function: actions/tiered-quantity-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          tiered-category-discount:
            function: actions/tiered-category-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          category-based-discount:
            function: actions/category-based-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          cheapest-item-discount:
            function: actions/cheapest-item-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          expensive-item-discount:
            function: actions/expensive-item-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          cheapest-quantity-discount:
            function: actions/cheapest-quantity-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          step-price-discount:
            function: actions/step-price-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          multi-condition-discount:
            function: actions/multi-condition-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          tiered-total-spend-discount:
            function: actions/tiered-total-spend-discount/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true

productDependencies:
  - code: COMMC
    minVersion: 2.4.5
    maxVersion: 2.4.9
```

Notes on what was deliberately dropped from the original monolith's `app.config.yaml` for this domain:
- No `hooks.pre-app-build` — that hook only exists to sync Commerce OAuth credentials, which this app never uses.
- No `events` block, no `3rd-party-events` package, no `extensions` block — none of those belong to the fees/discount domain.
- Package renamed from `commerce-checkout-starter-kit` to `totals-collector` so the deployed action IDs become `totals-collector/info`, `totals-collector/tiered-quantity-discount`, etc.

- [ ] **Step 2: Validate the YAML parses correctly**

```bash
cd totals-collector && npx --yes js-yaml@5 app.config.yaml > /dev/null && echo "YAML OK"
```

Expected: prints `YAML OK` with no parse errors.

- [ ] **Step 3: Spot-check the package/action structure**

Manually read through the rendered output confirming: 10 actions total (`info` + 9 discount actions), each discount action's `function:` path matches a file created in Task 4, and `info`'s `function:` path matches the file created in Task 5.

- [ ] **Step 4: Commit**

```bash
git add totals-collector/app.config.yaml
git commit -m "totals-collector: add App Builder runtime manifest"
```

---

### Task 7: Write `totals-collector/app.commerce.config.ts` (metadata only)

**Files:**
- Create: `totals-collector/app.commerce.config.ts`
- Test: `totals-collector/test/app.commerce.config.test.js`

**Interfaces:**
- Consumes: `defineConfig` from `@adobe/aio-commerce-lib-app/config` (Task 1's `package.json` dependency, pinned to `1.8.0-beta-20260702145741`).
- Produces: `export default { metadata: {...} }` — this is the App Management source of truth for the app's identity; it deliberately has no `installation` or `adminUi` keys.

- [ ] **Step 1: Write the failing test**

Create `totals-collector/test/app.commerce.config.test.js`:

```js
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { describe, expect, test } from "vitest";

import config from "../app.commerce.config.ts";

describe("app.commerce.config", () => {
  test("declares only metadata — no installation steps, no adminUi, no Commerce client wiring", () => {
    expect(config.metadata).toEqual({
      id: "checkout-totals-collector",
      displayName: "Checkout Totals Collector",
      version: "1.0.0",
      description:
        "Adobe Commerce checkout starter kit discount webhook actions (cart totals collector rules).",
    });
    expect(config.installation).toBeUndefined();
    expect(config.adminUi).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd totals-collector && npx vitest run test/app.commerce.config.test.js
```

Expected: FAIL — `Cannot find module '../app.commerce.config.ts'` (file doesn't exist yet).

- [ ] **Step 3: Create `totals-collector/app.commerce.config.ts`**

```ts
/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  metadata: {
    id: "checkout-totals-collector",
    displayName: "Checkout Totals Collector",
    version: "1.0.0",
    description:
      "Adobe Commerce checkout starter kit discount webhook actions (cart totals collector rules).",
  },
});
```

No `installation` key: there is no Commerce-side registration step for these actions today (confirmed — unlike payment/shipping/tax, there is no `create-*` onboarding script for discounts). No `adminUi` key: this domain has no admin UI extension.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd totals-collector && npx vitest run test/app.commerce.config.test.js
```

Expected: PASS — 1 test.

- [ ] **Step 5: Typecheck**

```bash
cd totals-collector && npm run typecheck
```

Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add totals-collector/app.commerce.config.ts totals-collector/test/app.commerce.config.test.js
git commit -m "totals-collector: add app.commerce.config.ts with metadata-only config"
```

---

### Task 8: Declare the totals-collector webhook subscription in `app.commerce.config.ts`

**Files:**
- Modify: `totals-collector/app.commerce.config.ts`
- Modify: `totals-collector/test/app.commerce.config.test.js`

**Interfaces:**
- Consumes: nothing new (still `defineConfig` from `@adobe/aio-commerce-lib-app/config`, Task 7).
- Produces: `config.webhooks` — a 2-entry array (`env: ["paas"]` and `env: ["saas"]`) that `@adobe/aio-commerce-lib-app`'s install workflow reads to auto-subscribe the deployed action's Runtime URL to Commerce at install time. No custom installation-step code is needed — see the design spec's "Webhook subscriptions (declarative `webhooks` config)" section.

Per the design spec's `totals-collector/` special case: Commerce exposes exactly **one** `get_total_modifications.execute` subscription slot, and the 9 discount actions in this app are alternative example implementations of that same contract — not 9 independently-active webhooks. So this app declares exactly **one** logical webhook (two entries only because PaaS and SaaS use different `webhook_method` strings), pointing at a single default action (`tiered-quantity-discount`). Both the config comment below and the README (Task 9) must make unmistakably clear that this is a swappable placeholder: whoever deploys this app picks exactly one of the 9 actions to be the live `runtimeAction` — never more than one.

Confirmed values (from the design spec's "Webhook subscriptions" table, sourced from `AdobeDocs/commerce-extensibility`):

| Field | PaaS | SaaS |
|---|---|---|
| `webhook_method` | `plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute` | `plugin.out_of_process_totals_collector.api.get_total_modifications.execute` |
| `webhook_type` | `after` | `after` |
| `batch_name` | `totals_collector` | `totals_collector` |
| `hook_name` | `totals_collector` | `totals_collector` |
| `method` | `POST` | `POST` |
| `timeout` | `30000` | `30000` |
| `soft_timeout` | `1000` | `1000` |
| `fallback_error_message` | `"We encountered an issue while calculating your discounts. Please contact the store owner for further assistance."` | same |

The `webhooks[]` entry schema (`@adobe/aio-commerce-lib-app`'s `WebhookEntryWithRuntimeActionSchema`) requires, at the entry level: `label` (string), `description` (string), `runtimeAction` (string), optional `env` (array of `"paas"`/`"saas"`); and inside the nested `webhook` object: `webhook_method`, `webhook_type`, `batch_name`, `hook_name`, `method` (all required strings), plus optional `timeout`, `soft_timeout`, `fallback_error_message`. Field names on the nested `webhook` object are **snake_case** (`soft_timeout`, `fallback_error_message` — not `softTimeout`/`fallbackErrorMessage`).

- [ ] **Step 1: Extend the failing test**

Add this test to `totals-collector/test/app.commerce.config.test.js`, inside the existing `describe("app.commerce.config", ...)` block:

```js
  test("declares exactly one webhook subscription (PaaS + SaaS variants) pointing at a single swappable default discount action", () => {
    expect(config.webhooks).toHaveLength(2);

    const runtimeActions = new Set(
      config.webhooks.map((entry) => entry.runtimeAction),
    );
    expect(runtimeActions).toEqual(
      new Set(["totals-collector/tiered-quantity-discount"]),
    );

    const envs = config.webhooks.map((entry) => entry.env);
    expect(envs).toEqual(expect.arrayContaining([["paas"], ["saas"]]));

    const paasEntry = config.webhooks.find((entry) => entry.env[0] === "paas");
    expect(paasEntry.webhook).toEqual({
      webhook_method:
        "plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute",
      webhook_type: "after",
      batch_name: "totals_collector",
      hook_name: "totals_collector",
      method: "POST",
      timeout: 30_000,
      soft_timeout: 1000,
      fallback_error_message:
        "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance.",
    });

    const saasEntry = config.webhooks.find((entry) => entry.env[0] === "saas");
    expect(saasEntry.webhook).toEqual({
      ...paasEntry.webhook,
      webhook_method:
        "plugin.out_of_process_totals_collector.api.get_total_modifications.execute",
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd totals-collector && npx vitest run test/app.commerce.config.test.js
```

Expected: FAIL — `config.webhooks` is `undefined` (no `webhooks` key declared yet).

- [ ] **Step 3: Add the `webhooks` array to `totals-collector/app.commerce.config.ts`**

Replace the `defineConfig({ metadata: {...} })` call with:

```ts
export default defineConfig({
  metadata: {
    id: "checkout-totals-collector",
    displayName: "Checkout Totals Collector",
    version: "1.0.0",
    description:
      "Adobe Commerce checkout starter kit discount webhook actions (cart totals collector rules).",
  },
  // Commerce exposes exactly ONE `get_total_modifications.execute` subscription slot for the
  // entire totals-collector contract — the 9 actions under actions/ are alternative EXAMPLE
  // implementations of that same contract, not 9 independently-active webhooks.
  //
  // PICK ONE: this `runtimeAction` is a swappable placeholder, defaulted to
  // `tiered-quantity-discount`. Before deploying to a real store, change BOTH entries below to
  // whichever single discount action you actually want live — never point this webhook at more
  // than one action at a time.
  webhooks: [
    {
      label: "Totals Collector Discount (PaaS)",
      description:
        "Adds discount JSON-patch operations to the cart totals collector response. Placeholder: swap runtimeAction for the one discount example you want live.",
      runtimeAction: "totals-collector/tiered-quantity-discount",
      env: ["paas"],
      webhook: {
        webhook_method:
          "plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute",
        webhook_type: "after",
        batch_name: "totals_collector",
        hook_name: "totals_collector",
        method: "POST",
        timeout: 30_000,
        soft_timeout: 1000,
        fallback_error_message:
          "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance.",
      },
    },
    {
      label: "Totals Collector Discount (SaaS)",
      description:
        "Adds discount JSON-patch operations to the cart totals collector response. Placeholder: swap runtimeAction for the one discount example you want live.",
      runtimeAction: "totals-collector/tiered-quantity-discount",
      env: ["saas"],
      webhook: {
        webhook_method:
          "plugin.out_of_process_totals_collector.api.get_total_modifications.execute",
        webhook_type: "after",
        batch_name: "totals_collector",
        hook_name: "totals_collector",
        method: "POST",
        timeout: 30_000,
        soft_timeout: 1000,
        fallback_error_message:
          "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance.",
      },
    },
  ],
});
```

Both entries' `runtimeAction` must always be kept identical to each other — they are the PaaS/SaaS variants of the *same* logical webhook, not two different webhooks. Anyone changing which discount action is live must update both entries together.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd totals-collector && npx vitest run test/app.commerce.config.test.js
```

Expected: PASS — 2 tests.

- [ ] **Step 5: Typecheck**

```bash
cd totals-collector && npm run typecheck
```

Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add totals-collector/app.commerce.config.ts totals-collector/test/app.commerce.config.test.js
git commit -m "totals-collector: declare the get_total_modifications.execute webhook subscription"
```

---

### Task 9: Write `totals-collector/README.md`

**Files:**
- Create: `totals-collector/README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Create `totals-collector/README.md`**

```markdown
# Checkout Totals Collector

Discount webhook actions for the [Adobe Commerce checkout starter kit](../README.md), split out
into its own independently deployable [App Management](https://developer.adobe.com/commerce/extensibility/app-management/)
app. This app has **no Commerce REST API dependency** — every action is a pure webhook payload
transform: it reads the incoming Commerce webhook body and returns a JSON-patch-style discount
operation, built with `@adobe/aio-commerce-sdk`'s webhook response helpers. Its one Commerce
webhook subscription is declared declaratively in `app.commerce.config.ts` and auto-registered at
install time — see "Webhook Subscription" below — there is no custom installation-step code.

## Install, Build, Deploy, Association

This app follows the standard Adobe App Management flow. Refer to Adobe's documentation rather
than this README for the generic mechanics:

- [Install an App Builder application](https://developer.adobe.com/commerce/extensibility/app-management/install/)
- [Build and deploy an App Builder application](https://developer.adobe.com/commerce/extensibility/app-management/deploy/)
- [Associate an application with a Commerce instance](https://developer.adobe.com/commerce/extensibility/app-management/association/)
- [Configure an application](https://developer.adobe.com/commerce/extensibility/app-management/configure/)

`app.commerce.config.ts` in this directory is the source of truth for this app's identity
(`metadata`) and its one webhook subscription (`webhooks`). It intentionally declares no
`installation.customInstallationSteps` — there is no custom Commerce-side registration script for
these discount actions, only the declarative webhook subscription described below.

## Prerequisites

```bash
cd totals-collector
npm install
cp env.dist .env
```

This app depends on beta releases of Adobe's Commerce SDK packages
(`@adobe/aio-commerce-lib-app@1.8.0-beta-20260702145741`,
`@adobe/aio-commerce-sdk@1.4.0-beta-20260702145741`) — confirm your npm registry configuration can
resolve these exact versions before installing.

## Configure Webhook Signature Verification

Every action in this app runs with `raw-http: true` / `require-adobe-auth: false` and verifies
the Adobe Commerce webhook signature on every request (`lib/webhooks.js`):

1. In Adobe Commerce, go to **Stores > Settings > Configuration > Adobe Services > Webhooks**.
2. Enable **Digital Signature Configuration** and click **Regenerate Key Pair**.
3. Add the generated **Public Key** to this app's `.env`, in [the same format](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action)
   required by Commerce:

   ```env
   COMMERCE_WEBHOOKS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   -----END PUBLIC KEY-----"
   ```

## Webhook Subscription — Declarative Config, Pick One Action

Unlike the tax/payment/shipping domains, this app does **not** document a manual "Create
Webhooks" step. Its `app.commerce.config.ts` declares a `webhooks` array — the App Management
install workflow reads it and automatically subscribes the deployed action's Runtime URL to
Commerce at install time. There is nothing to do by hand in the Commerce Admin for this.

**Read this before deploying.** Commerce exposes exactly **one**
`get_total_modifications.execute` subscription slot for this entire domain. The 9 actions under
`actions/` are alternative *example* implementations of that same webhook contract — demonstrating
9 different discount strategies — not 9 simultaneously-active webhooks. `app.commerce.config.ts`
ships with both of its `webhooks[]` entries (PaaS and SaaS variants of the same logical webhook)
pointing at `tiered-quantity-discount` as a **default placeholder**.

Before deploying to a real store:

1. Decide which one of the 9 discount examples you actually want live (or use one as a starting
   point for your own discount logic).
2. In `app.commerce.config.ts`, change **both** `webhooks[]` entries' `runtimeAction` from
   `totals-collector/tiered-quantity-discount` to `totals-collector/<your-chosen-action>`. Keep
   the two entries' `runtimeAction` identical to each other — they must always point at the same
   action.
3. Deploy (see [Build and deploy](https://developer.adobe.com/commerce/extensibility/app-management/deploy/))
   and [associate](https://developer.adobe.com/commerce/extensibility/app-management/association/)
   the app with your Commerce instance — the install workflow subscribes the webhook for you.

| Action | Deployed path |
|---|---|
| `tiered-quantity-discount` (default placeholder) | `totals-collector/tiered-quantity-discount` |
| `tiered-category-discount` | `totals-collector/tiered-category-discount` |
| `category-based-discount` | `totals-collector/category-based-discount` |
| `cheapest-item-discount` | `totals-collector/cheapest-item-discount` |
| `expensive-item-discount` | `totals-collector/expensive-item-discount` |
| `cheapest-quantity-discount` | `totals-collector/cheapest-quantity-discount` |
| `step-price-discount` | `totals-collector/step-price-discount` |
| `multi-condition-discount` | `totals-collector/multi-condition-discount` |
| `tiered-total-spend-discount` | `totals-collector/tiered-total-spend-discount` |

## Validation

1. Confirm `app.commerce.config.ts`'s two `webhooks[]` entries both point at the one discount
   action you intend to run live (see "Webhook Subscription" above) before associating the app
   with a real Commerce instance.
2. Add items to a cart that satisfy that action's condition (see the doc comment at the top of
   `actions/<action-name>/index.js` for the exact threshold and discount percentage).
3. Confirm the cart/quote total reflects the expected discount, and that the response includes a
   `discount` result operation rather than an `exception` op.
4. Confirm requests with a missing or invalid `x-adobe-commerce-webhook-signature` header are
   rejected (see `test/actions/total-collector-discounts.test.js` for the equivalent automated
   check).
5. **Specifically re-verify the SDK response wrapping end-to-end against a real Commerce instance.**
   Each action now returns `@adobe/aio-commerce-sdk`'s `ok(...)` response object directly
   (`{ type: "success", statusCode: 200, body: <operation(s)> }`) instead of manually building
   `{ statusCode, headers, body: JSON.stringify(...) }`. Unit tests confirm the JSON *shape* is
   unchanged, but only a real deployed request can confirm Adobe I/O Runtime's automatic body
   serialization behaves identically to the previous hand-rolled `JSON.stringify` + explicit
   `Content-Type` header — this app's beta SDK dependency makes this worth double-checking on
   first deploy.

## Testing

```bash
npm test
```
```

- [ ] **Step 2: Commit**

```bash
git add totals-collector/README.md
git commit -m "totals-collector: add README following App Management flow"
```

---

### Task 10: Full-suite verification and final sanity checks

**Files:** none created; verification only.

- [ ] **Step 1: Run the full test suite**

```bash
cd totals-collector && npm test
```

Expected: PASS — all tests across `test/lib/webhooks.test.js`, `test/lib/total-collector-discounts.test.js`, `test/actions/total-collector-discounts.test.js`, `test/actions/commerce-checkout-starter-kit-info.test.js`, `test/app.commerce.config.test.js` (including Task 8's webhook-subscription assertions).

- [ ] **Step 2: Run lint and typecheck**

```bash
cd totals-collector && npm run lint:check && npm run typecheck
```

Expected: both exit 0 with no errors.

- [ ] **Step 3: Confirm zero Commerce-client / OAuth dependency anywhere in the new app**

```bash
grep -rn "got\|oauth-1.0a\|@adobe/aio-sdk\|getAdobeCommerceClient\|getCommerceClient\|resolveImsAuthParams\|OAUTH_CLIENT_ID\|COMMERCE_BASE_URL" totals-collector --include="*.js" --include="*.ts" --include="*.yaml" --include="*.json" | grep -v node_modules | grep -v package-lock.json
```

Expected: no output. This confirms the app never references the Commerce HTTP client, OAuth/IMS credentials, or the association-based `getCommerceClient` auth pattern flagged as out of scope for this domain. Note: `@adobe/aio-commerce-sdk` and `@adobe/aio-commerce-lib-app` are expected and intentional (they are pure config/JSON-shape/webhook builders, not a Commerce HTTP client — see the Source-of-truth section above) and are not matched by this grep.

- [ ] **Step 4: Confirm exactly which `@adobe/aio-commerce-sdk` subpaths are imported, and that no discount action still constructs a hand-rolled webhook response object**

```bash
grep -rn "@adobe/aio-commerce-sdk" totals-collector --include="*.js" --include="*.ts" | grep -v node_modules
```

Expected: exactly two distinct subpaths — `@adobe/aio-commerce-sdk/webhooks/responses` (importing only `ok`, `exceptionOperation`, and/or `replaceOperation`, in the 9 discount actions and `lib/total-collector-discounts.js`) and exactly one `@adobe/aio-commerce-sdk/core/responses` import (importing only `HTTP_OK`, in `actions/commerce-checkout-starter-kit-info/index.js`). There is no local `totals-collector/lib/http.js` anywhere in the tree — confirm with:

```bash
find totals-collector -name http.js -not -path '*/node_modules/*'
```

Expected: no output.

```bash
grep -rln 'statusCode: HTTP_OK\|JSON.stringify(\[' totals-collector/actions totals-collector/lib | grep -v node_modules
```

Expected: the **only** match is `totals-collector/actions/commerce-checkout-starter-kit-info/index.js` (its frozen `return { statusCode: HTTP_OK };`) — any other match means a discount action or lib file still hand-builds a webhook response object or manually stringifies an operations array.

- [ ] **Step 5: Confirm the webhook subscription declares exactly one active action, consistently, across both env variants**

```bash
cd totals-collector && node -e "
import('./app.commerce.config.ts').then(({ default: config }) => {
  const actions = new Set(config.webhooks.map((entry) => entry.runtimeAction));
  if (config.webhooks.length !== 2) throw new Error('expected exactly 2 webhooks entries (paas+saas), got ' + config.webhooks.length);
  if (actions.size !== 1) throw new Error('PaaS/SaaS entries point at different runtimeActions: ' + [...actions].join(', '));
  console.log('OK: single runtimeAction ->', [...actions][0]);
});
"
```

Expected: prints `OK: single runtimeAction -> totals-collector/tiered-quantity-discount` (or whichever single action a developer has since swapped it to) — never more than one distinct `runtimeAction` across the two entries. This is the automated guard for the "pick one" rule: Commerce has only one `get_total_modifications.execute` slot, so the two PaaS/SaaS entries must never diverge on which action they point at.

- [ ] **Step 6: Confirm the app is self-contained (no imports reaching outside `totals-collector/`)**

```bash
grep -rn 'from "\.\./\.\./\.\./' totals-collector --include="*.js" --include="*.ts" | grep -v node_modules
```

Expected: no output — no relative import climbs out of `totals-collector/`.

- [ ] **Step 7: Confirm no other domain or root-level file was modified**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees && git status --short | grep -v '^?? totals-collector/' | grep -v '^A  totals-collector/'
```

Expected: no output, confirming this plan's execution touches only `totals-collector/` (plus the earlier spec/plan doc commits already made in this worktree).

- [ ] **Step 8: Final commit (if any of the above steps produced uncommitted fixes)**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees
git add totals-collector
git status --short
```

If there are staged changes from lint/format auto-fixes:

```bash
git commit -m "totals-collector: apply lint/format fixes"
```

---

## Explicitly out of scope for this plan (handled elsewhere)

- `shipping-method/`, `payment-method/`, `tax-integration/` — planned independently in sibling worktrees. `tax-integration/` is the only one that adds `@adobe/aio-commerce-lib-admin-ui` — not relevant to this plan.
- Removing the root-level monolith (`actions/`, `lib/`, `scripts/`, `hooks/`, root `app.config.yaml`, root `package.json`, `test/`, `e2e/`, `commerce-backend-ui-1/`) — happens in the final "remove the monolith" PR after all four domains are merged to `main`.
- The association-based `getCommerceClient`/`getCommerceInstance` auth swap flagged as a risk in the design spec — not applicable to this domain since it never calls Commerce.
- `@adobe/aio-commerce-lib-webhooks/api`'s lower-level, imperative `subscribeWebhook`/`unsubscribeWebhook` functions as a `customInstallationStep` — not needed here because the declarative `webhooks` array (Task 8) already auto-subscribes at install time without any custom installation-step code; this domain still has no `installation` block at all (no Commerce-side registration step exists for these actions beyond the webhook subscription itself).
- `@adobe/aio-commerce-sdk/core/*` generic action helpers — considered and explicitly not adopted; see the Source-of-truth section's last bullet for why.
- Any change to discount calculation business logic inside the 9 actions (thresholds, percentages, eligibility rules).
