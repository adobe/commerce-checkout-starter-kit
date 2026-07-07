# Tax Integration App Management Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the tax domain (`collect-taxes`, `collect-adjustment-taxes`, the tax-integration install script, and the Admin UI tax-class management extension) out of the monolithic `commerce-checkout-starter-kit` into a new, fully self-contained, independently-deployable App Builder app at top-level `tax-integration/`, using `@adobe/aio-commerce-lib-app`'s `app.commerce.config.ts` as the source of truth for configuration and installation.

**Architecture:** `tax-integration/` is a brand-new sibling directory at the repo root (not nested under any shared `apps/` parent, per the corrected design spec) with its own `package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, and `vitest.config.js`. It duplicates (does not import) the handful of root-level files it needs: the two tax webhook actions, the webhook-signature helpers (not the legacy Commerce HTTP client), the Adobe tracking "info" action, and the tax-integrations onboarding data. The `create-tax-integrations.js` onboarding script is rewritten as a `defineCustomInstallationStep`. The Admin UI extension (`commerce-backend-ui-1/`) is migrated to the `commerce/backend-ui/2` extension point and rebuilt against `@adobe/aio-commerce-lib-admin-ui`'s scaffold, replacing the old `@adobe/uix-guest` + custom-proxy-action architecture with the SDK's `adminUi.menu` config block and `useIms()`/`useCommerce()` hooks. This work is purely additive — no root-level file (`actions/`, `lib/`, `scripts/`, `app.config.yaml`, `commerce-backend-ui-1/`, etc.) is modified or deleted in this plan; the monolith removal is a separate, later PR (PR 5 in the design spec) that runs only after all four domain apps have merged.

**Tech Stack:** Node.js `^24.0.0`. Per the design spec's "SDK packages (beta)" section, all four domain apps pin **beta** versions of the Commerce SDK packages until the real releases ship: `@adobe/aio-commerce-lib-app@1.8.0-beta-20260702145741` (`defineConfig`, `defineCustomInstallationStep`, association-based `getCommerceClient`/`getCommerceInstance`) and `@adobe/aio-commerce-sdk@1.4.0-beta-20260702145741` (meta-package re-exporting `@adobe/aio-commerce-lib-webhooks` via `@adobe/aio-commerce-sdk/webhooks/*` and `@adobe/aio-commerce-lib-core` via `@adobe/aio-commerce-sdk/core/*` — used for webhook response builders and, where a clean fit, generic action response/header helpers). `tax-integration/` additionally pins `@adobe/aio-commerce-lib-admin-ui@0.2.0-beta-20260702145741` directly (imported via its own `@adobe/aio-commerce-lib-admin-ui/*` subpaths per its usage docs — **not** re-exported through `@adobe/aio-commerce-sdk`) — it is the only one of the four domain apps that needs it, and it is marked **Experimental — not yet production-ready** upstream. Also: `@adobe/aio-commerce-lib-auth@^1.1.1` (real release; `resolveImsAuthParams`), `@react-spectrum/s2` + `react`/`react-dom` (installed by the admin-ui scaffold generator, not hand-pinned), `@adobe/aio-lib-telemetry`, `js-yaml`, Vitest, Biome/Ultracite.

## Global Constraints

- `tax-integration/` is a fully self-contained App Builder app: its own `package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`. No shared root-level tooling — do not add npm workspaces, do not import anything from the repo root at runtime.
- Do not modify or delete any existing root-level file (`actions/`, `lib/`, `scripts/`, `app.config.yaml`, `commerce-backend-ui-1/`, `package.json`, `README.md`, `test/`, etc.) — this plan is purely additive. Monolith removal is a separate future PR.
- The `commerce-checkout-starter-kit/info` action's behavior must not change — duplicate it byte-for-byte.
- The tax calculation business logic in `collect-taxes` / `collect-adjustment-taxes` (tax rate tables, rounding, response operation shapes/paths/values) must not change — only how the response envelope is *constructed* changes (typed SDK builders instead of hand-rolled object literals).
- The Admin UI extension must move from `commerce/backend-ui/1` to `commerce/backend-ui/2`. `TaxClassDialog.js` / `TaxClassesPage.js` are tax-domain functionality and belong in `tax-integration/`, not a shared/generic location.
- `getCommerceClient`/`getCommerceInstance` association-based auth for the **runtime webhook actions** (`collect-taxes`, `collect-adjustment-taxes`) is gated on `shipping-method/`'s validation spike succeeding — do not assume it works; this plan contains an explicit conditional decision task, not a blind swap.
- `create-tax-integrations.js` becomes a `defineCustomInstallationStep` per `@adobe/aio-commerce-lib-app/management` — this pattern is documented-safe (not experimental) per `InstallationContext.params`'s typed IMS credential contract.
- `webhookSuccessResponse`/`webhookErrorResponse` are **not** carried forward — webhook response construction goes through `@adobe/aio-commerce-sdk/webhooks/responses`'s typed operation builders (`successOperation`, `exceptionOperation`, `addOperation`, `replaceOperation`, `removeOperation`, wrapped in `ok()`) instead. `webhookVerify` (the signature check) has no SDK equivalent anywhere in the three new packages and stays hand-rolled.
- `@adobe/aio-commerce-lib-admin-ui` is explicitly experimental upstream ("not yet production-ready") — call this out plainly wherever the plan relies on it, with the same up-front risk disclosure the spec gives the runtime-webhook auth swap, not as a settled dependency.
- Follow the repo's existing Biome/Ultracite lint conventions and Apache-2.0 copyright header style (see any existing file under `actions/` for the exact header block) on every new source file.

---

## File Structure

```
tax-integration/
  package.json                                  # own deps, own scripts, no workspace refs
  app.config.yaml                                # runtimeManifest for the 3 actions + extensions include
  app.commerce.config.ts                         # defineConfig: metadata, installation, adminUi
  biome.jsonc                                    # own lint/format config
  vitest.config.js                               # own test runner config
  vitest.setup.js                                # global fetch mock (copied from root)
  env.dist                                       # tax-relevant env vars only
  tax-integrations.yaml                          # tax integration definitions (copied)
  README.md                                      # App Management install flow + tax-specific guidance
  actions/
    telemetry.js                                 # copied, service name scoped to this app, HTTP_OK from the SDK
    checkout-metrics.js                          # copied, tax-only counters
    collect-taxes/index.js                       # moved, response envelope rebuilt on SDK webhook-response builders
    collect-adjustment-taxes/index.js             # moved, response envelope rebuilt on SDK webhook-response builders
    commerce-checkout-starter-kit-info/index.js   # duplicated verbatim, "do not change" — still imports lib/http.js
  lib/
    webhook.js                                   # webhookVerify only (signature check; no SDK equivalent)
    http.js                                       # HTTP_OK only, kept solely for the untouched info action's import
  scripts/
    create-tax-integrations.js                   # rewritten as defineCustomInstallationStep
  src/
    commerce-backend-ui-2/                        # generated by `npx @adobe/aio-commerce-lib-app init`
      ext.config.yaml                             # generated; runtimeManifest section hand-preserved (none needed)
      web-src/
        index.html                                # generated
        src/
          app.jsx                                 # generated, edited to route to main-page
          pages/
            main-page.jsx                         # generated, edited to render TaxClassesPage
          components/
            TaxClassDialog.jsx                    # ported from commerce-backend-ui-1, Spectrum S2
          lib/
            commerce-tax-classes.js                # new: plain, testable Commerce REST helpers
  test/
    lib/
      webhook.test.js
    actions/
      collect-taxes.test.js
      collect-adjustment-taxes.test.js
    scripts/
      create-tax-integrations.test.js
      tax-integrations-test.yaml
    admin-ui/
      commerce-tax-classes.test.js
```

Files read for reference during this plan (all at repo root, none of them modified):
`actions/collect-taxes/index.js`, `actions/collect-adjustment-taxes/index.js`, `actions/checkout-metrics.js`, `actions/telemetry.js`, `actions/commerce-checkout-starter-kit-info/index.js`, `scripts/create-tax-integrations.js`, `tax-integrations.yaml`, `lib/adobe-commerce.js`, `lib/http.js`, `app.config.yaml`, `package.json`, `biome.jsonc`, `vitest.config.js`, `vitest.setup.js`, `test/lib/adobe-commerce.test.js`, `test/scripts/create-tax-integrations.test.js`, `commerce-backend-ui-1/ext.config.yaml`, `commerce-backend-ui-1/actions/registration/index.js`, `commerce-backend-ui-1/actions/commerce/index.js`, `commerce-backend-ui-1/actions/utils.js`, `commerce-backend-ui-1/web-src/src/components/{App,MainPage,ExtensionRegistration,TaxClassesPage,TaxClassDialog}.js`, `commerce-backend-ui-1/web-src/src/hooks/{useCommerceTaxClasses,useCustomTaxCodes}.js`, `commerce-backend-ui-1/web-src/src/{utils.js,constants/extension.js}`.

---

## Phase 1 — Scaffold the app

### Task 1: Create `tax-integration/package.json`, `biome.jsonc`, `env.dist`

**Files:**
- Create: `tax-integration/package.json`
- Create: `tax-integration/biome.jsonc`
- Create: `tax-integration/env.dist`

**Interfaces:**
- Produces: the `npm test`, `npm run lint:check`, `npm run format:check`, `npm run code:check` scripts every later task's verification steps invoke from inside `tax-integration/`.

- [ ] **Step 1: Create `tax-integration/package.json`**

```json
{
  "name": "checkout-tax-integration",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@adobe/aio-commerce-lib-admin-ui": "0.2.0-beta-20260702145741",
    "@adobe/aio-commerce-lib-app": "1.8.0-beta-20260702145741",
    "@adobe/aio-commerce-lib-auth": "^1.1.1",
    "@adobe/aio-commerce-sdk": "1.4.0-beta-20260702145741",
    "@adobe/aio-lib-telemetry": "^1.1.0",
    "js-yaml": "^5.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.0",
    "@vitest/coverage-v8": "^4.0.7",
    "husky": "^9.1.7",
    "lint-staged": "^17.0.0",
    "ultracite": "^7.0.0",
    "vitest": "^4.0.7"
  },
  "scripts": {
    "prepare": "husky",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
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

Notes:
- `@adobe/aio-commerce-lib-app`, `@adobe/aio-commerce-sdk`, and `@adobe/aio-commerce-lib-admin-ui` are pinned to **exact** beta version strings (no `^`/`~`) per the design spec's "SDK packages (beta)" section — these are timestamped pre-release builds, not semver ranges, and `tax-integration/` is the only one of the four domain apps that needs `@adobe/aio-commerce-lib-admin-ui` at all.
- `react`, `react-dom`, and `@react-spectrum/s2` are deliberately **not** listed yet — Task 13's scaffold generator installs and pins them, per its explicit instruction not to hand-pick versions.
- The `create-tax-integrations` / `create-payment-methods`-style manual npm script from the root `package.json` is intentionally dropped: the rewritten install step (Phase 4) runs through the App Management install workflow, not `node scripts/....js` directly.

- [ ] **Step 2: Create `tax-integration/biome.jsonc`**

```jsonc
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["ultracite/biome/core", "ultracite/biome/react"],
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
  "overrides": [
    {
      "includes": ["src/commerce-backend-ui-2/web-src/**/*.jsx"],
      "linter": {
        "rules": {
          "style": {
            "useFilenamingConvention": {
              "level": "error",
              "options": {
                "filenameCases": ["PascalCase", "camelCase"]
              }
            }
          }
        }
      }
    }
  ],
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

- [ ] **Step 3: Create `tax-integration/env.dist`**

```env
# Required if webhooks are used and signature verification is enabled
COMMERCE_WEBHOOKS_PUBLIC_KEY=

# Environment for AIO: stage or prod (default)
#AIO_CLI_ENV=
```

- [ ] **Step 4: Commit**

```bash
git add tax-integration/package.json tax-integration/biome.jsonc tax-integration/env.dist
git commit -m "tax-integration: scaffold package.json, biome.jsonc, env.dist"
```

---

### Task 2: Create `tax-integration/vitest.config.js` and `vitest.setup.js`

**Files:**
- Create: `tax-integration/vitest.config.js`
- Create: `tax-integration/vitest.setup.js`

**Interfaces:**
- Produces: the `test/**/*.test.js` runner every subsequent TDD task uses (`npm test` from inside `tax-integration/`).

- [ ] **Step 1: Create `tax-integration/vitest.setup.js`** (copied from root, unchanged — needed because Phase 5's Commerce-REST helper tests mock `global.fetch`)

```js
/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { beforeEach, vi } from "vitest";

// Setup global fetch mock
global.fetch = vi.fn();

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
  if (global.fetch?.mockReset) {
    global.fetch.mockReset();
  }
});
```

- [ ] **Step 2: Create `tax-integration/vitest.config.js`**

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
      include: [
        "actions/**/*.js",
        "lib/**/*.js",
        "scripts/**/*.js",
        "app.commerce.config.ts",
        "src/**/actions/**/*.js",
        "src/**/web-src/src/lib/**/*.js",
      ],
      exclude: ["node_modules/", "dist/", "test/"],
    },
  },
});
```

- [ ] **Step 3: Verify the runner starts with zero tests**

Run: `cd tax-integration && npx vitest run`
Expected: `No test files found` (no `test/` directory yet — expected at this point)

- [ ] **Step 4: Commit**

```bash
git add tax-integration/vitest.config.js tax-integration/vitest.setup.js
git commit -m "tax-integration: add vitest config and setup"
```

---

## Phase 2 — Webhook helpers and HTTP constants

### Task 3: Extract `webhookVerify` into `tax-integration/lib/webhook.js`; keep a minimal `lib/http.js` for the untouched info action

The root `lib/adobe-commerce.js` mixes webhook-signature helpers with the legacy hand-rolled OAuth1/IMS Commerce HTTP client (`getAdobeCommerceClient`). Per the design spec's "SDK packages (beta)" section, `webhookSuccessResponse`/`webhookErrorResponse` are **not** carried forward at all — none of the three new beta SDK packages implement webhook signature verification, but `@adobe/aio-commerce-sdk/webhooks/responses` **does** provide typed response-envelope builders, which Tasks 5 and 6 use directly inside the two webhook actions instead of a shared `webhookSuccessResponse`/`webhookErrorResponse` pair. Only `webhookVerify` (the signature check, which has no SDK equivalent) is extracted here.

`lib/http.js` is still created, but scoped down to just `HTTP_OK` — it exists solely because Task 7's `commerce-checkout-starter-kit-info` action is explicitly "do not change" and its unchanged source still does `import { HTTP_OK } from "../../lib/http.js";`. Every other consumer (`telemetry.js`, both webhook actions) switches to `HTTP_OK` from `@adobe/aio-commerce-sdk/core/responses` in later tasks — a clean drop-in, since it's the exact same value (`200`) under the same name.

**Files:**
- Create: `tax-integration/lib/http.js`
- Create: `tax-integration/lib/webhook.js`
- Test: `tax-integration/test/lib/webhook.test.js`

**Interfaces:**
- Produces: `webhookVerify(params): {success: boolean, error?: string}` — consumed by Task 5 and Task 6. `HTTP_OK = 200` from `lib/http.js` — consumed only by Task 7's untouched info action.

- [ ] **Step 1: Create `tax-integration/lib/http.js`** (trimmed to the one constant the info action needs; not the full copy of root `lib/http.js`, since nothing else in this app uses the other four constants)

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

export const HTTP_OK = 200;
```

- [ ] **Step 2: Write the failing test for `webhook.js`** (ported from `test/lib/adobe-commerce.test.js`'s `webhookVerify` describe block — the `getAdobeCommerceClient` tests are intentionally dropped, since that client isn't moving; the old `webhookSuccessResponse`/`webhookErrorResponse` describe block is intentionally dropped too, since those functions no longer exist)

```js
// tax-integration/test/lib/webhook.test.js
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

import { webhookVerify } from "../../lib/webhook.js";

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

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd tax-integration && npx vitest run test/lib/webhook.test.js`
Expected: FAIL — `Cannot find module '../../lib/webhook.js'`

- [ ] **Step 4: Create `tax-integration/lib/webhook.js`** (`webhookVerify` only, unchanged logic, no dependency on `http.js` since it never returns a full response envelope — it just reports `{success, error?}`)

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
 * Verifies the signature of the webhook request. No SDK equivalent exists in
 * `@adobe/aio-commerce-lib-app`, `@adobe/aio-commerce-sdk`, or
 * `@adobe/aio-commerce-lib-admin-ui` — this stays hand-rolled.
 *
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd tax-integration && npx vitest run test/lib/webhook.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add tax-integration/lib/http.js tax-integration/lib/webhook.js tax-integration/test/lib/webhook.test.js
git commit -m "tax-integration: extract webhookVerify; drop webhookSuccessResponse/webhookErrorResponse per SDK packages (beta)"
```

---

## Phase 3 — Telemetry, metrics, and the two webhook actions

### Task 4: Copy `telemetry.js` and a tax-only `checkout-metrics.js`

**Files:**
- Create: `tax-integration/actions/telemetry.js`
- Create: `tax-integration/actions/checkout-metrics.js`

**Interfaces:**
- Produces: `telemetryConfig`, `isSuccessful` name `isWebhookSuccessful`, `localCollectorConfig` — consumed by Task 5 and 6. `checkoutMetrics.collectTaxesCounter`, `checkoutMetrics.collectAdjustmentTaxesCounter` — consumed by Task 5 and 6.

- [ ] **Step 1: Create `tax-integration/actions/telemetry.js`** (copied from root `actions/telemetry.js`; the `serviceName` changes to identify this app distinctly in telemetry, since it is now an independently deployed service, and `HTTP_OK` now comes from `@adobe/aio-commerce-sdk/core/responses` instead of the local `lib/http.js` — a clean drop-in, same name and value, per the design spec's optional `core/*` adoption guidance)

```js
/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * Telemetry Configuration for Adobe App Builder Actions
 *
 * This file configures OpenTelemetry instrumentation using @adobe/aio-lib-telemetry.
 *
 * Official Documentation:
 * - Usage Guide: https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md
 * - API Reference: https://github.com/adobe/aio-lib-telemetry/blob/main/docs/api-reference/README.md
 * - OpenTelemetry Concepts: https://github.com/adobe/aio-lib-telemetry/blob/main/docs/concepts/open-telemetry.md
 * - Export data: https://github.com/adobe/aio-lib-telemetry/tree/main/docs/use-cases)
 * @see https://github.com/adobe/aio-lib-telemetry
 */

import {
  defineTelemetryConfig,
  getAioRuntimeResource,
  getPresetInstrumentations,
} from "@adobe/aio-lib-telemetry";
import {
  OTLPLogExporterProto,
  OTLPMetricExporterProto,
  OTLPTraceExporterProto,
  PeriodicExportingMetricReader,
  SimpleLogRecordProcessor,
} from "@adobe/aio-lib-telemetry/otel";

import { HTTP_OK } from "@adobe/aio-commerce-sdk/core/responses";

/** The telemetry configuration to be used across all tax-integration actions */
const telemetryConfig = defineTelemetryConfig((_params, _isDev) => {
  return {
    sdkConfig: {
      serviceName: "checkout-tax-integration",
      instrumentations: getPresetInstrumentations("simple"),
      resource: getAioRuntimeResource(),
      // ...localCollectorConfig(), replace by your preferred telemetry exporter configuration
    },
    // disable diagnostics by default
    // diagnostics: {
    //   logLevel: _isDev ? "debug" : "info",
    // },
  };
});

/**
 * returns the configuration to send telemetry data to a local Open Telemetry Collector
 * @returns {object} the telemetry configuration object
 * Call in the sdkConfig as: ...localCollectorConfig() to export to local OTEL Collector
 */
function localCollectorConfig() {
  return {
    // Not specifying any export URL will default to find an Open Telemetry Collector instance in localhost.
    traceExporter: new OTLPTraceExporterProto(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporterProto(),
    }),

    logRecordProcessors: [
      new SimpleLogRecordProcessor(new OTLPLogExporterProto()),
    ],
  };
}

/**
 * Helper function to determine if a webhook response is successful.
 * Webhooks return HTTP_OK even for errors, so we check the body.op field.
 * @param {unknown} result - The result of the instrumented webhook action.
 * @returns {boolean} - True if the webhook response is successful, false otherwise.
 */
function isWebhookSuccessful(result) {
  if (result && typeof result === "object") {
    if ("statusCode" in result && result.statusCode === HTTP_OK) {
      // Check if body contains an error operation
      if ("body" in result && typeof result.body === "object") {
        return result.body.op !== "exception";
      }
      return true;
    }
    return false;
  }
  return false;
}

export { isWebhookSuccessful, localCollectorConfig, telemetryConfig };
```

- [ ] **Step 2: Create `tax-integration/actions/checkout-metrics.js`** (only the two tax counters carried over from root `actions/checkout-metrics.js`)

```js
/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * Tax Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for tax-integration actions using dimensions/attributes pattern.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics for tax-related actions. */
export const checkoutMetrics = defineMetrics((meter) => {
  return {
    collectTaxesCounter: meter.createCounter(
      "checkout.collect_taxes.requests_total",
      {
        description: "Total number of collect taxes requests.",
        valueType: ValueType.INT,
      },
    ),
    collectAdjustmentTaxesCounter: meter.createCounter(
      "checkout.collect_adjustment_taxes.requests_total",
      {
        description: "Total number of collect adjustment taxes requests.",
        valueType: ValueType.INT,
      },
    ),
  };
});
```

- [ ] **Step 3: Commit**

```bash
git add tax-integration/actions/telemetry.js tax-integration/actions/checkout-metrics.js
git commit -m "tax-integration: add telemetry config and tax-only metrics"
```

---

### Task 5: Move `collect-taxes` action, rebuilt on `@adobe/aio-commerce-sdk/webhooks/responses`

Per the design spec's "SDK packages (beta)" section, the hand-rolled operation object literals (`createTaxBreakdownOperation`, `createTaxSummaryOperation`) and the dropped `webhookErrorResponse` are replaced by `@adobe/aio-commerce-sdk/webhooks/responses`'s typed builders. The mapping is exact — verified field-by-field against both the current action and the builders' source:

| Current code | Replacement |
|---|---|
| `createTaxBreakdownOperation(index, tax, taxAmount)` → `{op: "add", path, value, instance}` | `addOperation(path, value, instance)` |
| `createTaxSummaryOperation(index, ...)` → `{op: "replace", path, value, instance}` | `replaceOperation(path, value, instance)` |
| `webhookErrorResponse(message)` → `{statusCode: 200, body: {op: "exception", message}}` | `ok(exceptionOperation(message))` |
| `return { statusCode: HTTP_OK, body: JSON.stringify(operations) }` | `return ok(operations);` |

`ok(operations)` (from `@adobe/aio-commerce-lib-webhooks`, re-exported via `@adobe/aio-commerce-sdk/webhooks/responses`) returns `{ type: "success", statusCode: 200, body: operations }` — the `body` is the raw array/object, not a pre-`JSON.stringify`'d string. This is safe: the *current* `webhookErrorResponse` already returns an un-stringified object body (`{op: "exception", message}`) in production today, proving Adobe I/O Runtime's web-action response handling JSON-serializes a non-string `body` on the way out regardless of the action's `raw-http: true` annotation (that annotation only affects how the *incoming* request body is decoded into `__ow_body`, not how the outgoing response is encoded) — so dropping the manual `JSON.stringify(operations)` for the success path does not change the actual HTTP response bytes Commerce receives. The extra top-level `type: "success"` field `ok()` adds alongside `statusCode`/`body` is inert — Adobe I/O Runtime's web-action wrapper only reads `statusCode`/`headers`/`body` off the returned object.

`isWebhookSuccessful` in `telemetry.js` (Task 4) needs no code change: for the success case `result.body` is now an array, so `result.body.op` is `undefined` (arrays have no `.op`), which is correctly `!== "exception"`; for the exception case `result.body` is still the plain `{op: "exception", ...}` object `exceptionOperation` produces, so `result.body.op === "exception"` still correctly resolves to `false`.

**Files:**
- Create: `tax-integration/actions/collect-taxes/index.js`
- Test: `tax-integration/test/actions/collect-taxes.test.js`

**Interfaces:**
- Consumes: `webhookVerify` from `../../lib/webhook.js` (Task 3); `addOperation`, `replaceOperation`, `exceptionOperation`, `ok` from `@adobe/aio-commerce-sdk/webhooks/responses`; `checkoutMetrics` from `../checkout-metrics.js` (Task 4); `isWebhookSuccessful`, `telemetryConfig` from `../telemetry.js` (Task 4).
- Produces: `export const main` — the runtime action entrypoint, wired into `app.config.yaml` in Task 8.

There is no existing test for this action's logic today (the repo has no `test/actions/` directory) — this task adds the first one, since the design spec asks for tests to move "alongside the code they test" and this is a natural gap to close while relocating.

- [ ] **Step 1: Write the failing test**

```js
// tax-integration/test/actions/collect-taxes.test.js
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

import { main } from "../../actions/collect-taxes/index.js";

function signedParams(bodyObject, publicKey, privateKey) {
  const body = JSON.stringify(bodyObject);
  const signature = crypto
    .createSign("SHA256")
    .update(body)
    .sign(privateKey, "base64");
  return {
    __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
    __ow_body: btoa(body),
    COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
  };
}

describe("collect-taxes", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 512,
  });

  test("returns tax breakdown and summary operations for a tax-excluded item", async () => {
    const params = signedParams(
      {
        oopQuote: {
          items: [
            {
              unit_price: 100,
              quantity: 1,
              discount_amount: 0,
              is_tax_included: false,
            },
          ],
        },
      },
      publicKey,
      privateKey,
    );

    const result = await main(params);

    expect(result.statusCode).toBe(200);
    // 2 breakdown operations (state_tax, county_tax) + 1 summary operation
    // `ok()` no longer JSON.stringify's the body — it's the raw operations array
    expect(result.body).toHaveLength(3);
    expect(result.body[0]).toMatchObject({
      op: "add",
      path: "oopQuote/items/0/tax_breakdown",
    });
    expect(result.body[2]).toMatchObject({
      op: "replace",
      path: "oopQuote/items/0/tax",
    });
  });

  test("returns a webhook exception response when signature verification fails", async () => {
    const result = await main({
      __ow_headers: {},
      __ow_body: btoa(JSON.stringify({ oopQuote: { items: [] } })),
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.op).toBe("exception");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tax-integration && npx vitest run test/actions/collect-taxes.test.js`
Expected: FAIL — `Cannot find module '../../actions/collect-taxes/index.js'`

- [ ] **Step 3: Create `tax-integration/actions/collect-taxes/index.js`** (moved from root `actions/collect-taxes/index.js`; the calculation logic — rate tables, rounding, paths, values — is byte-for-byte unchanged; only the response-envelope construction changes, from hand-rolled object literals and `lib/adobe-commerce.js`'s `webhookErrorResponse` to the SDK's typed builders per the mapping table above)

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

import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";
import {
  addOperation,
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhook.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

const TAX_RATES = Object.freeze({
  EXCLUDING_TAX: [
    { code: "state_tax", rate: 4.5, title: "State Tax" },
    { code: "county_tax", rate: 3.6, title: "County Tax" },
  ],
  INCLUDING_TAX: [{ code: "vat", rate: 8.4, title: "VAT" }],
});

/**
 * This action calculates the tax for the given request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params - method params includes environment and request data
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function collectTaxes(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug("Starting tax collection process");

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.collectTaxesCounter.add(1, {
        status: "error",
        error_code: "verification_failed",
      });
      return ok(
        exceptionOperation(`Failed to verify the webhook signature: ${error}`),
      );
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    logger.debug("Received request: ", body);

    currentSpan.setAttribute(
      "quote.items.count",
      body.oopQuote?.items?.length || 0,
    );

    const operations = [];

    body.oopQuote.items.forEach((item, index) => {
      operations.push(...calculateTaxOperations(item, index));
    });

    logger.info(
      "Tax calculation response : ",
      JSON.stringify(operations, null, 2),
    );

    checkoutMetrics.collectTaxesCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in tax collection:", error);
    checkoutMetrics.collectTaxesCounter.add(1, {
      status: "error",
      error_code: "exception",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}
/**
 * Calculates the tax operations for the given item.
 * @param {object} item the item to calculate the tax operations for
 * @param {number} index the index of the item in the quote
 * @returns {{op: string, path: string, value: object, instance: string}[]} the tax operations
 */
function calculateTaxOperations(item, index) {
  const taxesToApply = obtainTaxRates(item);

  const operations = [];

  // This sample assumes that discount is applied before tax (Apply Tax After Discount = NO)
  const discountAmount = Math.min(
    item.unit_price * item.quantity,
    item.discount_amount,
  );
  const taxableAmount = item.unit_price * item.quantity - discountAmount;
  let itemTaxAmount = 0.0;
  let discountCompensationTaxAmount = 0.0;

  for (const tax of taxesToApply) {
    let taxAmount = 0;

    if (item.is_tax_included) {
      // Reverse tax calculation when tax is included in price
      taxAmount = taxableAmount - taxableAmount / (1 + tax.rate / 100);
      // Hidden tax calculation assumes discount is applied before tax
      const hiddenTax = discountAmount - discountAmount / (1 + tax.rate / 100);
      discountCompensationTaxAmount += hiddenTax;
    } else {
      taxAmount = taxableAmount * (tax.rate / 100);
    }

    taxAmount = Math.round(taxAmount * 100) / 100;
    itemTaxAmount += taxAmount;

    operations.push(createTaxBreakdownOperation(index, tax, taxAmount));
  }

  itemTaxAmount = Math.round(itemTaxAmount * 100) / 100;
  discountCompensationTaxAmount =
    Math.round(discountCompensationTaxAmount * 100) / 100;

  const netPrice = item.is_tax_included
    ? taxableAmount - itemTaxAmount
    : taxableAmount;
  const itemTaxRate =
    netPrice > 0 ? Math.round((itemTaxAmount / netPrice) * 10_000) / 100 : 0;

  operations.push(
    createTaxSummaryOperation(
      index,
      itemTaxRate,
      itemTaxAmount,
      discountCompensationTaxAmount,
    ),
  );

  return operations;
}

/**
 * Resolves the tax rates for the given item.
 * @param {object} item the item to resolve the tax rates for
 * @returns {{code: string, rate: number, title: string}[]} the tax rates
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
function obtainTaxRates(item) {
  // Replace this example with external tax service containing the tax rates
  return item.is_tax_included
    ? TAX_RATES.INCLUDING_TAX
    : TAX_RATES.EXCLUDING_TAX;
}

/**
 * Creates a tax breakdown operation for the given item.
 * @param {number} index operation index
 * @param {object} tax operation tax
 * @param {number} taxAmount operation tax amount
 * @returns {{op: string, path: string, value: object, instance: string}} the response operation
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#add-operation
 */
function createTaxBreakdownOperation(index, tax, taxAmount) {
  return addOperation(
    `oopQuote/items/${index}/tax_breakdown`,
    {
      data: {
        code: tax.code,
        rate: tax.rate,
        amount: taxAmount,
        title: tax.title,
        tax_rate_key: `${tax.code}-${tax.rate}`,
      },
    },
    "Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxBreakdownInterface",
  );
}

/**
 * Creates a tax summary operation for the given item.
 * @param {number} index operation index
 * @param {number} itemTaxRate operation item tax rate
 * @param {number} itemTaxAmount operation item tax amount
 * @param {number} discountCompensationTaxAmount operation discount compensation tax amount
 * @returns {{op: string, path: string, value: object, instance: string}} the response operation
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#replace-operation
 */
function createTaxSummaryOperation(
  index,
  itemTaxRate,
  itemTaxAmount,
  discountCompensationTaxAmount,
) {
  return replaceOperation(
    `oopQuote/items/${index}/tax`,
    {
      data: {
        rate: itemTaxRate,
        amount: itemTaxAmount,
        discount_compensation_amount: discountCompensationTaxAmount,
      },
    },
    "Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxInterface",
  );
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(collectTaxes, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tax-integration && npx vitest run test/actions/collect-taxes.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add tax-integration/actions/collect-taxes tax-integration/test/actions/collect-taxes.test.js
git commit -m "tax-integration: move collect-taxes action, rebuilt on SDK webhook-response builders"
```

---

### Task 6: Move `collect-adjustment-taxes` action, rebuilt on `@adobe/aio-commerce-sdk/webhooks/responses`

Same mapping as Task 5: `createAdjustmentRefundTax`/`createAdjustmentFeeTax` (both `{op: "replace", path, value}` object literals with no `instance`) become `replaceOperation(path, value)` calls; `webhookErrorResponse` calls become `ok(exceptionOperation(message))`; the success return becomes `ok(operations)`.

**Files:**
- Create: `tax-integration/actions/collect-adjustment-taxes/index.js`
- Test: `tax-integration/test/actions/collect-adjustment-taxes.test.js`

**Interfaces:**
- Consumes: `webhookVerify` from `../../lib/webhook.js` (Task 3); `replaceOperation`, `exceptionOperation`, `ok` from `@adobe/aio-commerce-sdk/webhooks/responses`; `checkoutMetrics`, `telemetryConfig`/`isWebhookSuccessful` from Task 4.
- Produces: `export const main`, wired into `app.config.yaml` in Task 8.

- [ ] **Step 1: Write the failing test**

```js
// tax-integration/test/actions/collect-adjustment-taxes.test.js
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

import { main } from "../../actions/collect-adjustment-taxes/index.js";

function signedParams(bodyObject, publicKey, privateKey) {
  const body = JSON.stringify(bodyObject);
  const signature = crypto
    .createSign("SHA256")
    .update(body)
    .sign(privateKey, "base64");
  return {
    __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
    __ow_body: btoa(body),
    COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
  };
}

describe("collect-adjustment-taxes", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 512,
  });

  test("computes refund and fee tax for a tax-excluded credit memo", async () => {
    const params = signedParams(
      {
        oopCreditMemo: {
          items: [{ is_tax_included: false }],
          adjustment: { refund: 100, fee: 10 },
        },
      },
      publicKey,
      privateKey,
    );

    const result = await main(params);

    expect(result.statusCode).toBe(200);
    // `ok()` no longer JSON.stringify's the body — it's the raw operations array
    expect(result.body).toEqual([
      { op: "replace", path: "oopCreditMemo/adjustment/refund_tax", value: 8.1 },
      { op: "replace", path: "oopCreditMemo/adjustment/fee_tax", value: 0.81 },
    ]);
  });

  test("returns a webhook exception response for missing oopCreditMemo data", async () => {
    const params = signedParams({}, publicKey, privateKey);

    const result = await main(params);

    expect(result.statusCode).toBe(200);
    expect(result.body.op).toBe("exception");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tax-integration && npx vitest run test/actions/collect-adjustment-taxes.test.js`
Expected: FAIL — `Cannot find module '../../actions/collect-adjustment-taxes/index.js'`

- [ ] **Step 3: Create `tax-integration/actions/collect-adjustment-taxes/index.js`** (moved from root; the tax-rate lookup and rounding logic is byte-for-byte unchanged — only the response-envelope construction changes)

```js
/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhook.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

const TAX_RATES = Object.freeze({
  EXCLUDING_TAX: 8.1,
  INCLUDING_TAX: 8.4,
});

/**
 * This action calculates the adjustment taxes for the given credit memo request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params - method params includes environment and request data
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function collectAdjustmentTaxes(params) {
  const { logger } = getInstrumentationHelpers();

  logger.debug("Starting adjustment tax collection process");

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.collectAdjustmentTaxesCounter.add(1, {
        status: "error",
        error_code: "verification_failed",
      });
      return ok(
        exceptionOperation(`Failed to verify the webhook signature: ${error}`),
      );
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    logger.debug("Received request: ", body);

    const { oopCreditMemo } = body;
    if (!oopCreditMemo?.items) {
      logger.error("Invalid or missing oopCreditMemo data");
      return ok(exceptionOperation("Invalid or missing oopCreditMemo data"));
    }

    // Check if store has tax included setup
    const isTaxIncluded = oopCreditMemo.items.some(
      (item) => item.is_tax_included === true,
    );
    // Sample tax rates matched with collect-taxes action depending on tax-inclusive
    const taxRate = isTaxIncluded
      ? TAX_RATES.INCLUDING_TAX
      : TAX_RATES.EXCLUDING_TAX;

    // Adjustment Refund and Fee Amounts, remaining without tax
    // The calculated returned taxes will be summed up to the grand total in Commerce
    const adjustmentRefund = oopCreditMemo.adjustment?.refund;
    const adjustmentFee = oopCreditMemo.adjustment?.fee;
    const operations = [];

    // Calculate and add refund tax if applicable
    if (adjustmentRefund) {
      const refundTax = calculateTaxAmount(adjustmentRefund, taxRate);
      operations.push(createAdjustmentRefundTax(refundTax));
    }

    // Calculate and add fee tax if applicable
    if (adjustmentFee) {
      const feeTax = calculateTaxAmount(adjustmentFee, taxRate);
      operations.push(createAdjustmentFeeTax(feeTax));
    }

    logger.debug(
      "Adjustment Tax calculation response: ",
      JSON.stringify(operations, null, 2),
    );

    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in adjustment tax collection:", error);
    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, {
      status: "error",
      error_code: "exception",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

/**
 * Calculates the tax amount based on the taxable amount and tax rate.
 *
 * @param taxableAmount
 * @param taxRate
 * @returns {number} The calculated tax amount, rounded to two decimal places.
 */
function calculateTaxAmount(taxableAmount, taxRate) {
  const taxAmount = taxableAmount * (taxRate / 100);
  return Math.round(taxAmount * 100) / 100;
}

/**
 * Creates webhook operation to update the adjustment refund tax value.
 *
 * @param value
 * @returns {{op: string, path: string, value}}
 */
function createAdjustmentRefundTax(value) {
  return replaceOperation("oopCreditMemo/adjustment/refund_tax", value);
}

/**
 * Creates webhook operation to update the adjustment fee tax value.
 *
 * @param value
 * @returns {{op: string, path: string, value}}
 */
function createAdjustmentFeeTax(value) {
  return replaceOperation("oopCreditMemo/adjustment/fee_tax", value);
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(collectAdjustmentTaxes, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tax-integration && npx vitest run test/actions/collect-adjustment-taxes.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add tax-integration/actions/collect-adjustment-taxes tax-integration/test/actions/collect-adjustment-taxes.test.js
git commit -m "tax-integration: move collect-adjustment-taxes action, rebuilt on SDK webhook-response builders"
```

---

### Task 7: Duplicate the `commerce-checkout-starter-kit/info` tracking action

The design spec is explicit: this action must not change. Duplicate it byte-for-byte.

**Files:**
- Create: `tax-integration/actions/commerce-checkout-starter-kit-info/index.js`

- [ ] **Step 1: Create the file, identical to the root's** `actions/commerce-checkout-starter-kit-info/index.js`

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

import { HTTP_OK } from "../../lib/http.js";

/**
 * Please DO NOT DELETE this action; future functionalities planned for upcoming starter kit releases may stop working.
 * This is an info endpoint which is used to the track adoption of the starter kit.
 * @param {object} _params action input parameters.
 * @returns {object} returns a response object
 */
export function main(_params) {
  return { statusCode: HTTP_OK };
}
```

- [ ] **Step 2: Diff against the source to confirm byte-for-byte parity** (except the copyright header, which is unchanged too)

Run: `diff <(tail -n +1 actions/commerce-checkout-starter-kit-info/index.js) <(tail -n +1 tax-integration/actions/commerce-checkout-starter-kit-info/index.js)` (run from repo root)
Expected: no output (files identical)

- [ ] **Step 3: Commit**

```bash
git add tax-integration/actions/commerce-checkout-starter-kit-info
git commit -m "tax-integration: duplicate commerce-checkout-starter-kit/info tracking action"
```

---

### Task 8: Wire the three actions into `tax-integration/app.config.yaml`

**Files:**
- Create: `tax-integration/app.config.yaml`

**Interfaces:**
- Consumes: `actions/collect-taxes/index.js`, `actions/collect-adjustment-taxes/index.js`, `actions/commerce-checkout-starter-kit-info/index.js` (Tasks 5-7).
- Produces: the `application.runtimeManifest.packages.commerce-checkout-starter-kit` action bindings that `aio app build`/`aio app deploy` read; the `extensions:` key that Task 15 fills in with the `commerce/backend-ui/2` include.

- [ ] **Step 1: Create `tax-integration/app.config.yaml`**

```yaml
application:
  actions: actions
  runtimeManifest:
    packages:
      # Do not change the action `commerce-checkout-starter-kit/info` as it is used by tracking purposes
      commerce-checkout-starter-kit:
        license: Apache-2.0
        actions:
          info:
            function: actions/commerce-checkout-starter-kit-info/index.js
            web: 'yes'
            runtime: nodejs:24
            annotations:
              require-adobe-auth: true
              final: true
          # https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/tax-use-cases/
          collect-taxes:
            function: actions/collect-taxes/index.js
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
          collect-adjustment-taxes:
            function: actions/collect-adjustment-taxes/index.js
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

Note: unlike the root `app.config.yaml`, there is no `hooks.pre-app-build` entry here. The root's `pre-app-build` hook runs `scripts/sync-oauth-credentials.js` to populate `OAUTH_*` env vars for the legacy client — that whole flow is superseded by App Management's association-based install, whose `InstallationContext.params` already guarantees the IMS credential fields (see Task 12). The `extensions:` key for the Admin UI is added later in Task 15, once `src/commerce-backend-ui-2/` exists.

- [ ] **Step 2: Commit**

```bash
git add tax-integration/app.config.yaml
git commit -m "tax-integration: wire actions into app.config.yaml"
```

---

## Phase 4 — `app.commerce.config.ts` and the rewritten install step

### Task 9: Add `@adobe/aio-commerce-lib-app` types support and create the initial `app.commerce.config.ts`

`app.commerce.config.ts` needs TypeScript. This task adds the minimal `tsconfig.json` + `typescript` devDependency needed to author and typecheck it, without turning the rest of the (JavaScript) app into TypeScript.

**Files:**
- Modify: `tax-integration/package.json` (add `typescript` devDependency and a `typecheck` script)
- Create: `tax-integration/tsconfig.json`
- Create: `tax-integration/app.commerce.config.ts`

**Interfaces:**
- Produces: the default-exported config object from `@adobe/aio-commerce-lib-app/config`'s `defineConfig`, which Task 12 (install step) and Task 14 (admin UI) extend with `installation.customInstallationSteps` and `adminUi`.

- [ ] **Step 1: Add `typescript` and a `typecheck` script to `tax-integration/package.json`**

In the `devDependencies` block, add:

```json
    "typescript": "^5.7.0",
```

In the `scripts` block, add:

```json
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 2: Create `tax-integration/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["app.commerce.config.ts", "src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create `tax-integration/app.commerce.config.ts`** (metadata + empty installation array for now; Task 12 fills in the custom installation step, Task 14 adds `adminUi`)

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
    id: "checkout-tax-integration",
    displayName: "Checkout Tax Integration",
    version: "1.0.0",
    description:
      "Out-of-process tax collection and Commerce tax-integration/tax-class management for the Adobe Commerce checkout starter kit.",
  },
  installation: {
    customInstallationSteps: [],
  },
});
```

- [ ] **Step 4: Install dependencies and typecheck**

Run: `cd tax-integration && npm install && npm run typecheck`
Expected: no errors (once `@adobe/aio-commerce-lib-app` is installed per Task 1's `package.json`)

- [ ] **Step 5: Commit**

```bash
git add tax-integration/package.json tax-integration/tsconfig.json tax-integration/app.commerce.config.ts
git commit -m "tax-integration: add app.commerce.config.ts scaffold with metadata"
```

---

### Task 10: Copy `tax-integrations.yaml`

**Files:**
- Create: `tax-integration/tax-integrations.yaml`

- [ ] **Step 1: Create the file, identical to root's `tax-integrations.yaml`**

```yaml
tax_integrations:
  - tax_integration:
      code: 'oop-tax-integration'
      title: 'My tax integration'
      active: true
      stores:
        - default
```

- [ ] **Step 2: Commit**

```bash
git add tax-integration/tax-integrations.yaml
git commit -m "tax-integration: copy tax-integrations.yaml"
```

---

### Task 11: Write the failing tests for the rewritten install step

This task writes both tests before any implementation exists, per TDD. Two things are tested separately since they have different failure modes:
1. `createTaxIntegrations(client, data)` — a small pure function containing the create-loop and per-item error handling (ported from the current script's for-loop), fully unit-testable without file I/O or SDK mocking.
2. The default-exported `defineCustomInstallationStep` handler — verifies it reads `tax-integrations.yaml`, resolves IMS auth via `resolveImsAuthParams`, builds a client via `getCommerceClient`, and delegates to `createTaxIntegrations`.

**Files:**
- Test: `tax-integration/test/scripts/create-tax-integrations.test.js`
- Create: `tax-integration/test/scripts/tax-integrations-test.yaml`

**Interfaces:**
- Consumes (once implemented in Task 12): `default` export (the install step handler) and `createTaxIntegrations(client, data)` named export from `../../scripts/create-tax-integrations.js`.

- [ ] **Step 1: Create the fixture file** (ported from root's `test/scripts/tax-integrations-test.yaml`)

```yaml
tax_integrations:
  - tax_integration:
      code: 'tax-integration-1'
      title: 'My tax integration enabled'
      active: true
      stores:
        - default
  - tax_integration:
      code: 'tax-integration-2'
      title: 'My tax integration disabled'
      active: false
      stores:
        - default
```

- [ ] **Step 2: Write the failing test**

```js
// tax-integration/test/scripts/create-tax-integrations.test.js
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

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));
vi.mock("@adobe/aio-commerce-lib-auth", () => ({
  resolveImsAuthParams: vi.fn((params) => ({ resolved: true, params })),
}));

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

import installTaxIntegrations, {
  createTaxIntegrations,
} from "../../scripts/create-tax-integrations.js";

describe("createTaxIntegrations", () => {
  test("collects the codes of successfully created tax integrations", async () => {
    const client = {
      post: vi
        .fn()
        .mockReturnValueOnce({ json: () => Promise.resolve({}) })
        .mockReturnValueOnce({
          json: () => Promise.reject(new Error("Commerce API error")),
        }),
    };
    const data = {
      tax_integrations: [
        { tax_integration: { code: "tax-integration-1" } },
        { tax_integration: { code: "tax-integration-2" } },
      ],
    };

    const created = await createTaxIntegrations(client, data);

    expect(created).toEqual(["tax-integration-1"]);
    expect(client.post).toHaveBeenCalledWith(
      "oope_tax_management/tax_integration",
      { json: { tax_integration: { code: "tax-integration-1" } } },
    );
  });

  test("returns an empty array when every integration fails", async () => {
    const client = {
      post: vi.fn().mockReturnValue({
        json: () => Promise.reject(new Error("boom")),
      }),
    };
    const data = {
      tax_integrations: [{ tax_integration: { code: "tax-integration-1" } }],
    };

    const created = await createTaxIntegrations(client, data);

    expect(created).toEqual([]);
  });
});

describe("install step handler", () => {
  const context = {
    params: {
      AIO_COMMERCE_AUTH_IMS_CLIENT_ID: "client-id",
      AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: ["secret"],
      AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: "tech-account-id",
      AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: "tech@example.com",
      AIO_COMMERCE_AUTH_IMS_ORG_ID: "org-id",
      AIO_COMMERCE_AUTH_IMS_SCOPES: ["scope1"],
    },
    logger: { info: vi.fn(), error: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves IMS auth, builds a client, and creates every tax integration", async () => {
    const client = {
      post: vi.fn().mockReturnValue({ json: () => Promise.resolve({}) }),
    };
    getCommerceClient.mockResolvedValue(client);

    const created = await installTaxIntegrations({}, context);

    expect(resolveImsAuthParams).toHaveBeenCalledWith(context.params);
    expect(getCommerceClient).toHaveBeenCalledWith({
      resolved: true,
      params: context.params,
    });
    expect(created).toEqual(["oop-tax-integration"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd tax-integration && npx vitest run test/scripts/create-tax-integrations.test.js`
Expected: FAIL — `Cannot find module '../../scripts/create-tax-integrations.js'`

- [ ] **Step 4: Commit the test (red state, expected)**

```bash
git add tax-integration/test/scripts/create-tax-integrations.test.js tax-integration/test/scripts/tax-integrations-test.yaml
git commit -m "tax-integration: add failing tests for rewritten install step"
```

---

### Task 12: Rewrite `create-tax-integrations.js` as a `defineCustomInstallationStep`

**Files:**
- Create: `tax-integration/scripts/create-tax-integrations.js`
- Modify: `tax-integration/app.commerce.config.ts:11` (fill in `installation.customInstallationSteps`)

**Interfaces:**
- Consumes: `defineCustomInstallationStep` from `@adobe/aio-commerce-lib-app/management`; `getCommerceClient` from `@adobe/aio-commerce-lib-app`; `resolveImsAuthParams` from `@adobe/aio-commerce-lib-auth`; `context.params` typed to guarantee `AIO_COMMERCE_AUTH_IMS_*` fields (per `InstallationContext` in `@adobe/aio-commerce-lib-app`'s `source/management/installation/workflow/step.ts`); reads `../tax-integrations.yaml` (Task 10).
- Produces: `default` export (install handler, signature `(config, context) => Promise<string[]>`) and named export `createTaxIntegrations(client, data) => Promise<string[]>` — both already asserted against by Task 11's tests.

The Commerce endpoint path (`oope_tax_management/tax_integration`) matches the `V1/oope_tax_management/tax_integration` REST route the legacy `getAdobeCommerceClient().createTaxIntegration()` called in `lib/adobe-commerce.js` — the SDK's `AdobeCommerceHttpClient` prefixes `V1/` automatically (confirmed against `@adobe/aio-commerce-lib-api`'s `AdobeCommerceHttpClient`, whose default `version` is `"V1"`), so the path passed to `client.post` omits the `V1/` prefix.

- [ ] **Step 1: Create `tax-integration/scripts/create-tax-integrations.js`**

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

import fs from "node:fs";

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";
import { load } from "js-yaml";

/**
 * Creates each tax integration in `data.tax_integrations`, continuing past
 * individual failures so one bad entry doesn't block the rest.
 *
 * @param {object} client an `AdobeCommerceHttpClient`-shaped client (`.post(path, {json}).json()`)
 * @param {{tax_integrations: {tax_integration: {code: string}}[]}} data parsed tax-integrations.yaml content
 * @returns {Promise<string[]>} the codes of the tax integrations that were created successfully
 */
export async function createTaxIntegrations(client, data) {
  const created = [];

  for (const taxIntegration of data.tax_integrations) {
    const code = taxIntegration.tax_integration.code;
    try {
      await client
        .post("oope_tax_management/tax_integration", { json: taxIntegration })
        .json();
      created.push(code);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: install steps have no aio-lib-core-logging instance of their own besides context.logger, applied by the caller
      console.error(`Failed to create tax integration ${code}: ${error.message}`);
    }
  }

  return created;
}

export default defineCustomInstallationStep(async (config, context) => {
  const { logger, params } = context;

  logger.info("Reading tax-integrations.yaml...");
  const fileContents = fs.readFileSync(
    new URL("../tax-integrations.yaml", import.meta.url),
    "utf8",
  );
  const data = load(fileContents);

  logger.info("Creating tax integrations...");
  const client = await getCommerceClient(resolveImsAuthParams(params));
  const created = await createTaxIntegrations(client, data);

  logger.info(`Created tax integrations: ${created.join(", ") || "(none)"}`);
  return created;
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd tax-integration && npx vitest run test/scripts/create-tax-integrations.test.js`
Expected: PASS (3 tests)

- [ ] **Step 3: Wire the step into `app.commerce.config.ts`**

In `tax-integration/app.commerce.config.ts`, replace:

```ts
  installation: {
    customInstallationSteps: [],
  },
```

with:

```ts
  installation: {
    customInstallationSteps: [
      {
        script: "./scripts/create-tax-integrations.js",
        name: "Create tax integrations",
        description:
          "Registers the tax integrations defined in tax-integrations.yaml with the connected Commerce instance.",
      },
    ],
  },
```

- [ ] **Step 4: Typecheck**

Run: `cd tax-integration && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add tax-integration/scripts/create-tax-integrations.js tax-integration/app.commerce.config.ts
git commit -m "tax-integration: rewrite create-tax-integrations as a custom installation step"
```

---

## Phase 5 — Admin UI: `commerce/backend-ui/1` → `commerce/backend-ui/2` migration

**Scope note (read before starting):** this phase is materially more involved than the rest of this plan and more involved than the other three domain apps' work, because it isn't a mechanical move — the whole architecture of the extension changes:

| | v1 (`commerce-backend-ui-1/`, today) | v2 (`commerce/backend-ui/2`, target) |
|---|---|---|
| Menu registration | `actions/registration/index.js` returns a `menuItems` array (custom "Apps" top-level section) via `@adobe/uix-guest`'s `register()` | A single `adminUi.menu` object in `app.commerce.config.ts` (`id`, `label`, `description`, `parentMenu` — one of 8 fixed Commerce menus; no custom top-level sections) |
| App bootstrap | Hand-written `App.js` (`HashRouter`, `@adobe/react-spectrum` `Provider`) + `ExtensionRegistration.js` (`@adobe/uix-guest` `attach`/`register`) | Generated `src/app.jsx` calling `createExtensionApp()` from `@adobe/aio-commerce-lib-admin-ui/web` |
| IMS token access | Manual `attach({id}).sharedContext.get("imsToken"/"imsOrgId")` dance in `MainPage.js` | `useIms()` hook → `{ imsToken, imsOrgId }` |
| Commerce REST calls | Frontend `callAction()` → backend proxy action `commerce/index.js` (package `CustomMenu`) authenticating to Commerce with the **app's own machine `OAUTH_*` credentials** | Frontend calls Commerce REST **directly**, using the **logged-in admin's own IMS token**, via `useIms()` + `useCommerce()` (`{ commerceHost }`) — no backend proxy action |
| Design system | `@adobe/react-spectrum` v3 (Spectrum 1) components | `@react-spectrum/s2` (Spectrum 2) components, installed by the SDK's scaffold |
| UI components | `TaxClassesPage.js`, `TaxClassDialog.js` | Same functionality, ported component-by-component against the Spectrum S2 API (see Task 17) |

The switch from a machine-credential backend proxy to a direct, admin-IMS-token frontend call is the **officially documented** v2 pattern (the SDK's own `commerce-app-admin-ui` skill demonstrates `useIms()` for exactly this purpose) — it is not the same kind of "unproven" risk as the runtime-webhook auth swap in Phase 6. It does, however, introduce one new, concrete risk that Task 19 calls out explicitly: whether Commerce's REST API permits cross-origin `fetch()` calls from the Admin UI extension's iframe origin. The old proxy action sidestepped this because the call was server-to-server.

**Risk disclosure — `@adobe/aio-commerce-lib-admin-ui` is experimental.** The package's own docs (`docs/usage.md` in the `aio-commerce-sdk` monorepo) open with: *"Experimental: This package is not yet production-ready. The API may change in future releases."* Every import from `@adobe/aio-commerce-lib-admin-ui/*` in this phase (`/menu`, `/web`) rests on that same experimental footing — call this out the same way the spec flags the runtime-webhook auth swap as unproven, not as a settled dependency choice. Note the exact import boundary: `@adobe/aio-commerce-lib-admin-ui`'s menu/web/api pieces are imported **directly** from their own `@adobe/aio-commerce-lib-admin-ui/*` subpaths — per the design spec, `@adobe/aio-commerce-sdk` does **not** re-export them (it only re-exports `@adobe/aio-commerce-lib-webhooks` and `@adobe/aio-commerce-lib-core`).

**Scope decisions made for this phase** (both explicitly optional per the design spec):

- **`enableAdminUiSdk()`/`registerExtension()` as a `customInstallationStep`:** `@adobe/aio-commerce-lib-admin-ui/api`'s `createAdminUiApiClient` could turn the Admin UI SDK's Commerce-side enablement into an install step instead of a manual Commerce Admin action. **Decision: skip it in this plan.** This phase already carries three separate open risks (Spectrum S2 component parity, the CORS validation gate, and the admin-ui package's experimental status) — adding a new network-calling install step on top of that compounds scope without a proportionate benefit yet. The root README's existing guidance (`composer require "magento/commerce-backend-sdk": ">=3.0"` plus completing Adobe's Admin UI SDK installation process) remains the documented manual fallback in Task 23's README. Revisit as a follow-up once the primary functional migration and the CORS decision are validated.
- **Grid columns / order-view buttons / mass actions wire-contract builders (`parseGridRequest`/`okGridResponse`, `parseOrderViewButtonRequest`/`okOrderViewButtonResponse`, `parseMassActionRequest`/`okMassActionResponse`):** **Not applicable here.** The tax Admin UI is, and remains, a single custom menu page (`TaxClassesPage`/`TaxClassDialog`) with no grid columns, order-view buttons, or mass actions declared on `commerce/backend-ui/2` — those three extension types don't exist in this app's `adminUi` config (only `adminUi.menu`, added in Task 14), so their wire-contract builders have no handler to attach to. Do not force them in.

### Task 13: Scaffold the `commerce/backend-ui/2` extension

**Files:**
- Modify: `tax-integration/app.commerce.config.ts` (placeholder comment only, real config added in Task 14)
- Create (generated): `tax-integration/src/commerce-backend-ui-2/ext.config.yaml`
- Create (generated): `tax-integration/src/commerce-backend-ui-2/web-src/index.html`
- Create (generated): `tax-integration/src/commerce-backend-ui-2/web-src/src/app.jsx`
- Create (generated): `tax-integration/src/commerce-backend-ui-2/web-src/src/pages/main-page.jsx`
- Create (generated): `tax-integration/src/commerce-backend-ui-2/web-src/src/components/welcome.jsx`
- Modify (generated): `tax-integration/app.config.yaml` (adds the `extensions: commerce/backend-ui/2` include)
- Modify (generated): `tax-integration/install.yaml`, `tax-integration/extension-manifest.json`
- Modify (generated): `tax-integration/package.json` (pins `react`, `react-dom`, `@react-spectrum/s2`)

This task runs `@adobe/aio-commerce-lib-app`'s own generator CLI — **not** the Claude Code `commerce-app-migrate`/`commerce-app-management` plugins the design spec's non-goals exclude. The generator is the library's own idempotent scaffolding tool; hand-authoring the files it manages (the `hooks`, `operations`, and `web` sections of `ext.config.yaml`, plus `install.yaml`/`extension-manifest.json`) is explicitly discouraged by the SDK's own `commerce-app-admin-ui` skill documentation, since the build derives them from the `adminUi` config block.

Note: `@adobe/aio-commerce-lib-admin-ui` itself is **already** pinned in `package.json` (Task 1, exact beta `0.2.0-beta-20260702145741`) — that's a deliberate change from the generator's default behavior of choosing its own version, made explicitly by the design spec since the real release doesn't exist yet. If the generator tries to overwrite that pin with a different (older, stable) version when it runs `npm install`, re-pin the exact beta version in `package.json` afterward and re-run `npm install` — treat this as a known rough edge of mixing a hand-pinned beta with the generator's own dependency management, not a sign something is broken.

- [ ] **Step 1: Add the `adminUi` placeholder to `app.commerce.config.ts`** so the generator has something to key off of

In `tax-integration/app.commerce.config.ts`, add after the `installation` block (before the closing `});`):

```ts
  adminUi: {
    menu: {
      id: "oope_tax_management",
      label: "Tax management",
      description: "Manage out-of-process Commerce tax classes.",
    },
  },
```

- [ ] **Step 2: Run the generator**

Run: `cd tax-integration && npx @adobe/aio-commerce-lib-app init`
Expected: exits 0; creates `src/commerce-backend-ui-2/` (`ext.config.yaml`, `web-src/index.html`, `web-src/src/app.jsx`, `web-src/src/pages/main-page.jsx`, `web-src/src/components/welcome.jsx`), updates `install.yaml` and `extension-manifest.json`, adds `extensions.commerce/backend-ui/2` to `app.config.yaml`, and adds pinned `react`/`react-dom`/`@react-spectrum/s2` to `package.json` (`@adobe/aio-commerce-lib-admin-ui` is already pinned from Task 1 — see the note below if the generator tries to change that pin). Do not hand-edit the versions it pins.

- [ ] **Step 3: Verify `tax-integration/app.config.yaml` now includes the extension**

Confirm it contains:

```yaml
extensions:
  commerce/backend-ui/2:
    $include: src/commerce-backend-ui-2/ext.config.yaml
```

- [ ] **Step 4: Run the build to confirm the scaffold is valid**

Run: `cd tax-integration && npx aio app build`
Expected: build succeeds (validates `app.commerce.config.ts` against the schema)

- [ ] **Step 5: Commit the generated scaffold**

```bash
git add tax-integration/app.commerce.config.ts tax-integration/app.config.yaml tax-integration/install.yaml tax-integration/extension-manifest.json tax-integration/package.json tax-integration/package-lock.json tax-integration/src
git commit -m "tax-integration: scaffold commerce/backend-ui/2 extension via aio-commerce-lib-app init"
```

---

### Task 14: Finalize the `adminUi.menu` config

**Files:**
- Modify: `tax-integration/app.commerce.config.ts`

**Interfaces:**
- Produces: the `adminUi.menu` block the generated `src/commerce-backend-ui-2/ext.config.yaml` and Commerce Admin menu registration read from.

The v1 registration action nested "Tax management" under a custom "Apps" section — v2's `parentMenu` only accepts one of the 8 fixed Commerce menu constants (`MENU_SALES`, `MENU_CATALOG`, `MENU_CUSTOMERS`, `MENU_MARKETING`, `MENU_CONTENT`, `MENU_REPORTS`, `MENU_STORES`, `MENU_SYSTEM`), so the custom section can't be reproduced exactly. `MENU_STORES` is the closest analog, since Commerce's native tax configuration (Tax Rules, Tax Zones & Rates) already lives under **Stores > Settings > Tax**. Flag this placement for stakeholder sign-off during review — it's a judgment call, not a spec requirement.

- [ ] **Step 1: Update the `adminUi` block**

In `tax-integration/app.commerce.config.ts`, replace:

```ts
  adminUi: {
    menu: {
      id: "oope_tax_management",
      label: "Tax management",
      description: "Manage out-of-process Commerce tax classes.",
    },
  },
```

with:

```ts
  adminUi: {
    menu: {
      id: "oope_tax_management",
      label: "Tax management",
      description: "Manage out-of-process Commerce tax classes for the checkout starter kit.",
      parentMenu: MENU_STORES,
      pageTitle: "Tax management",
    },
  },
```

and add the import at the top of the file — from `@adobe/aio-commerce-lib-admin-ui/menu` directly, **not** `@adobe/aio-commerce-sdk/admin-ui/menu` (per the design spec, the meta-package doesn't re-export the admin-ui library):

```ts
import { MENU_STORES } from "@adobe/aio-commerce-lib-admin-ui/menu";
```

- [ ] **Step 2: Re-run the generator to sync the extension config, then rebuild**

Run: `cd tax-integration && npx @adobe/aio-commerce-lib-app init && npx aio app build`
Expected: both succeed; no changes needed outside `src/commerce-backend-ui-2/` beyond what init already manages

- [ ] **Step 3: Commit**

```bash
git add tax-integration/app.commerce.config.ts tax-integration/src
git commit -m "tax-integration: finalize adminUi.menu config (parentMenu: MENU_STORES)"
```

---

### Task 15: Port `TaxClassDialog` to Spectrum S2

`TaxClassDialog.js` is pure presentational form UI with no backend calls — it only needs its `@adobe/react-spectrum` (Spectrum 1) imports translated to `@react-spectrum/s2` (Spectrum 2) equivalents. Verify each of the following components individually against the installed `@react-spectrum/s2` version's actual exports before committing — do not assume 1:1 API parity: `Button`, `ButtonGroup`, `Content`, `Dialog`, `Divider`, `Form`, `Heading`, `InlineAlert`, `Item` (S2 often replaces `Item`-based collection APIs with plain arrays/children — check `Picker`'s S2 signature specifically), `Picker`, `TextField`.

**Files:**
- Create: `tax-integration/src/commerce-backend-ui-2/web-src/src/components/TaxClassDialog.jsx`

- [ ] **Step 1: Check the installed `@react-spectrum/s2` version's `Picker` and `Item`/collection API**

Run: `cd tax-integration && node -e "console.log(Object.keys(require('@react-spectrum/s2')).filter(k => /Picker|Item|Button|Dialog|Heading|Divider|Form|InlineAlert|TextField|ButtonGroup|Content/.test(k)))"`
Expected: a list of exported component names — use this to confirm every name below actually exists before using it; if `Item` is absent, `Picker` takes a plain array of `{id, label}`-shaped objects instead of `<Item>` children (check the printed export list and adjust the JSX below accordingly).

- [ ] **Step 2: Create `TaxClassDialog.jsx`**, porting the component logic unchanged and updating only the import source and any component API differences found in Step 1:

```jsx
import {
  Button,
  ButtonGroup,
  Content,
  Dialog,
  Divider,
  Form,
  Heading,
  InlineAlert,
  Picker,
  PickerItem,
  TextField,
} from "@react-spectrum/s2";
import { useState } from "react";

export function TaxClassDialog({ taxClass, customTaxCodes = [], onSave, close }) {
  const isEdit = Boolean(taxClass);
  const [className, setClassName] = useState(taxClass?.className || "");
  const [classType, setClassType] = useState(taxClass?.classType || "PRODUCT");
  const [selectedTaxCode, setSelectedTaxCode] = useState(
    taxClass?.customTaxCode || "",
  );
  const [formError, setFormError] = useState(null);

  const handleSubmit = () => {
    if (!className.trim()) {
      setFormError("Class Name is required.");
      return;
    }

    const selectedCode = customTaxCodes.find(
      (code) => code.taxCode === selectedTaxCode,
    );
    if (!selectedCode) {
      setFormError("Please select a valid Custom Tax Code.");
      return;
    }

    const updatedTaxClass = {
      id: taxClass?.id,
      className: className.trim(),
      customTaxCode: selectedCode.taxCode,
      customTaxLabel: selectedCode.name,
      classType,
    };

    setFormError(null);
    onSave(updatedTaxClass);
    close();
  };

  return (
    <Dialog>
      <Heading>{isEdit ? "Edit Tax Class" : "Add New Tax Class"}</Heading>
      <Divider />
      <Content>
        {formError && (
          <InlineAlert variant="negative">
            <Heading>{formError}</Heading>
          </InlineAlert>
        )}
        <Form>
          <TextField
            isRequired
            label="Class Name"
            onChange={setClassName}
            value={className}
          />
          <Picker
            isDisabled={isEdit}
            isRequired
            label="Class Type"
            onSelectionChange={setClassType}
            selectedKey={classType}>
            <PickerItem id="PRODUCT">PRODUCT</PickerItem>
            <PickerItem id="SHIPPING">SHIPPING</PickerItem>
            <PickerItem id="CUSTOMER">CUSTOMER</PickerItem>
          </Picker>
          <Picker
            isRequired
            label="Custom Tax Code"
            onSelectionChange={setSelectedTaxCode}
            selectedKey={selectedTaxCode}>
            {customTaxCodes.map((code) => (
              <PickerItem id={code.taxCode} key={code.taxCode}>
                {`${code.taxCode} (${code.name})`}
              </PickerItem>
            ))}
          </Picker>
          <ButtonGroup align="end">
            <Button
              data-testid="tax-class-cancel-button"
              onPress={close}
              variant="secondary">
              Cancel
            </Button>
            <Button
              data-testid="tax-class-save-button"
              onPress={handleSubmit}
              variant="accent">
              Save
            </Button>
          </ButtonGroup>
        </Form>
      </Content>
    </Dialog>
  );
}
```

Note: `variant="cta"` (Spectrum 1) has no direct S2 equivalent — S2's closest accent button variant is `"accent"`; verify this against Step 1's export check and the current `@react-spectrum/s2` docs before finalizing, and adjust if the installed version names it differently.

- [ ] **Step 3: Build to catch any component/prop mismatches**

Run: `cd tax-integration && npx aio app build`
Expected: no bundler errors referencing `TaxClassDialog.jsx`; fix any component/prop name mismatch surfaced here against Step 1's confirmed export list before moving on

- [ ] **Step 4: Commit**

```bash
git add tax-integration/src/commerce-backend-ui-2/web-src/src/components/TaxClassDialog.jsx
git commit -m "tax-integration: port TaxClassDialog to Spectrum S2"
```

---

### Task 16: Write the failing test for the direct Commerce-REST helper functions

The v1 `useCommerceTaxClasses.js` hook called the `commerce/index.js` proxy action via `callAction()`. In v2 there's no proxy action — the frontend calls Commerce REST directly using the admin's own IMS token (`useIms()`) and Commerce host (`useCommerce()`). Extracting the actual `fetch()` calls into plain, hook-independent functions keeps them unit-testable under the project's existing Node-environment Vitest setup (no jsdom/testing-library is configured in this repo, and this plan does not introduce one — see the Global Constraints).

**Files:**
- Test: `tax-integration/test/admin-ui/commerce-tax-classes.test.js`

**Interfaces:**
- Consumes (once implemented in Task 17): `fetchCommerceTaxClasses(commerceHost, imsToken)` and `createOrUpdateCommerceTaxClass(commerceHost, imsToken, taxClass)` from `../../src/commerce-backend-ui-2/web-src/src/lib/commerce-tax-classes.js`.

- [ ] **Step 1: Write the failing test**

```js
// tax-integration/test/admin-ui/commerce-tax-classes.test.js
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

import {
  createOrUpdateCommerceTaxClass,
  fetchCommerceTaxClasses,
} from "../../src/commerce-backend-ui-2/web-src/src/lib/commerce-tax-classes.js";

describe("fetchCommerceTaxClasses", () => {
  test("maps Commerce taxClasses/search items into the row shape the table expects", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            {
              class_id: 2,
              class_type: "PRODUCT",
              class_name: "Taxable Goods",
              custom_attributes: [
                { attribute_code: "tax_code", value: "001" },
                { attribute_code: "tax_label", value: "Books" },
              ],
            },
          ],
        }),
    });

    const rows = await fetchCommerceTaxClasses(
      "https://commerce.example.com/rest/all/",
      "test-ims-token",
    );

    expect(rows).toEqual([
      {
        rowNumber: 1,
        id: 2,
        classType: "PRODUCT",
        className: "Taxable Goods",
        customTaxCode: "001",
        customTaxLabel: "Books",
      },
    ]);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("taxClasses/search");
    expect(options.headers.Authorization).toBe("Bearer test-ims-token");
  });

  test("throws when Commerce responds with a non-ok status", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      fetchCommerceTaxClasses("https://commerce.example.com/rest/all/", "tok"),
    ).rejects.toThrow("Commerce request failed with status 500");
  });
});

describe("createOrUpdateCommerceTaxClass", () => {
  test("POSTs the mapped payload to V1/taxClasses with the admin's IMS token", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await createOrUpdateCommerceTaxClass(
      "https://commerce.example.com/rest/all/",
      "test-ims-token",
      {
        id: 2,
        className: "Taxable Goods",
        classType: "PRODUCT",
        customTaxCode: "001",
        customTaxLabel: "Books",
      },
    );

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://commerce.example.com/rest/all/V1/taxClasses");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-ims-token");
    expect(JSON.parse(options.body)).toEqual({
      taxClass: {
        class_id: 2,
        class_name: "Taxable Goods",
        class_type: "PRODUCT",
        custom_attributes: [
          { attribute_code: "tax_code", value: "001" },
          { attribute_code: "tax_label", value: "Books" },
        ],
      },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tax-integration && npx vitest run test/admin-ui/commerce-tax-classes.test.js`
Expected: FAIL — `Cannot find module '.../lib/commerce-tax-classes.js'`

- [ ] **Step 3: Commit the failing test**

```bash
git add tax-integration/test/admin-ui/commerce-tax-classes.test.js
git commit -m "tax-integration: add failing tests for direct Commerce-REST tax-class helpers"
```

---

### Task 17: Implement the direct Commerce-REST helper functions

**Files:**
- Create: `tax-integration/src/commerce-backend-ui-2/web-src/src/lib/commerce-tax-classes.js`

**Interfaces:**
- Produces: `fetchCommerceTaxClasses(commerceHost, imsToken) => Promise<Array<{rowNumber, id, classType, className, customTaxCode, customTaxLabel}>>`, `createOrUpdateCommerceTaxClass(commerceHost, imsToken, taxClass) => Promise<object>` — consumed by Task 18's `TaxClassesPage.jsx`.

- [ ] **Step 1: Create the file**

```js
/**
 * Fetches the first page of Commerce tax classes and maps them into the
 * row shape the tax-classes table renders.
 *
 * @param {string} commerceHost the Commerce REST base URL (from `useCommerce()`)
 * @param {string} imsToken the logged-in admin's IMS bearer token (from `useIms()`)
 * @returns {Promise<Array<{rowNumber: number, id: number, classType: string, className: string, customTaxCode: string, customTaxLabel: string}>>}
 */
export async function fetchCommerceTaxClasses(commerceHost, imsToken) {
  const queryParams = new URLSearchParams({
    "searchCriteria[currentPage]": 1,
    "searchCriteria[pageSize]": 100,
  }).toString();

  const response = await fetch(
    `${commerceHost}V1/taxClasses/search?${queryParams}`,
    {
      headers: { Authorization: `Bearer ${imsToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Commerce request failed with status ${response.status}`);
  }

  const { items } = await response.json();
  return items.map((item, index) => ({
    rowNumber: index + 1,
    id: item.class_id,
    classType: item.class_type,
    className: item.class_name,
    customTaxCode:
      item.custom_attributes?.find((attr) => attr.attribute_code === "tax_code")
        ?.value || "",
    customTaxLabel:
      item.custom_attributes?.find((attr) => attr.attribute_code === "tax_label")
        ?.value || "",
  }));
}

/**
 * Creates or updates a Commerce tax class.
 *
 * @param {string} commerceHost the Commerce REST base URL (from `useCommerce()`)
 * @param {string} imsToken the logged-in admin's IMS bearer token (from `useIms()`)
 * @param {{id?: number, className: string, classType: string, customTaxCode: string, customTaxLabel: string}} taxClass
 * @returns {Promise<object>} the parsed Commerce response body
 */
export async function createOrUpdateCommerceTaxClass(
  commerceHost,
  imsToken,
  taxClass,
) {
  const payload = {
    taxClass: {
      class_id: taxClass?.id,
      class_name: taxClass.className,
      class_type: taxClass.classType, // only the create request uses class_type
      custom_attributes: [
        { attribute_code: "tax_code", value: taxClass.customTaxCode },
        { attribute_code: "tax_label", value: taxClass.customTaxLabel },
      ],
    },
  };

  const response = await fetch(`${commerceHost}V1/taxClasses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${imsToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Commerce request failed with status ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd tax-integration && npx vitest run test/admin-ui/commerce-tax-classes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
git add tax-integration/src/commerce-backend-ui-2/web-src/src/lib/commerce-tax-classes.js
git commit -m "tax-integration: implement direct Commerce-REST tax-class helpers"
```

---

### Task 18: Port `TaxClassesPage` and wire it into `main-page.jsx`

**Files:**
- Create: `tax-integration/src/commerce-backend-ui-2/web-src/src/components/TaxClassesPage.jsx`
- Create: `tax-integration/src/commerce-backend-ui-2/web-src/src/hooks/useCustomTaxCodes.js` (ported unchanged — it's a self-contained mock, not a Commerce call)
- Modify (generated file): `tax-integration/src/commerce-backend-ui-2/web-src/src/pages/main-page.jsx`

Same Spectrum-S2 component-verification caveat as Task 15 applies here: `Cell`, `Column`, `Content`, `DialogTrigger` (formerly a compound "trigger + render-prop" pattern — check whether S2 keeps that API or replaces it with a controlled `isOpen`/`onOpenChange` pattern), `Flex`, `Heading`, `IllustratedMessage`, `ProgressCircle`, `Row`, `TableBody`, `TableHeader`, `TableView`, `Text`.

**Interfaces:**
- Consumes: `TaxClassDialog` (Task 15), `fetchCommerceTaxClasses`/`createOrUpdateCommerceTaxClass` (Task 17), `useCustomTaxCodes` (this task), `useIms()`/`useCommerce()` from `@adobe/aio-commerce-lib-admin-ui/web`.

- [ ] **Step 1: Create `useCustomTaxCodes.js`**, ported unchanged from `commerce-backend-ui-1/web-src/src/hooks/useCustomTaxCodes.js` (it's an explicitly-marked mock/demo hook, not a Commerce call, so nothing about the v1→v2 migration affects it — only the `props` parameter is dropped since it was unused there too)

```js
import { useCallback, useEffect, useState } from "react";

export function useCustomTaxCodes() {
  const [customTaxCodes, setCustomTaxCodes] = useState([]);
  const [isLoadingCustomTaxCodes, setIsLoadingCustomTaxCodes] = useState(true);

  const fetchCustomTaxCodes = useCallback(() => {
    setIsLoadingCustomTaxCodes(true);

    try {
      // fetch here your custom tax codes
      // Mock tax codes for example
      const codes = [
        { taxCode: "001", name: "Books" },
        { taxCode: "002", name: "Food" },
        { taxCode: "003", name: "Clothing" },
      ];

      setCustomTaxCodes(codes);
    } catch (error) {
      console.error("Error fetching custom tax codes:", error);
      setCustomTaxCodes([]);
    } finally {
      setIsLoadingCustomTaxCodes(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomTaxCodes();
  }, [fetchCustomTaxCodes]);

  return { customTaxCodes, isLoadingCustomTaxCodes };
}
```

- [ ] **Step 2: Create `TaxClassesPage.jsx`**, rewriting the two Commerce-facing hooks inline via `useIms()`/`useCommerce()` + the Task 17 helpers instead of `callAction()`

```jsx
import { useCommerce, useIms } from "@adobe/aio-commerce-lib-admin-ui/web";
import {
  Button,
  Cell,
  Column,
  Content,
  DialogTrigger,
  Flex,
  Heading,
  IllustratedMessage,
  ProgressCircle,
  Row,
  TableBody,
  TableHeader,
  TableView,
  Text,
} from "@react-spectrum/s2";
import { useCallback, useEffect, useState } from "react";

import {
  createOrUpdateCommerceTaxClass,
  fetchCommerceTaxClasses,
} from "../lib/commerce-tax-classes.js";
import { useCustomTaxCodes } from "../hooks/useCustomTaxCodes.js";
import { TaxClassDialog } from "./TaxClassDialog.jsx";

export function TaxClassesPage() {
  const { imsToken } = useIms();
  const { commerceHost } = useCommerce();
  const { customTaxCodes, isLoadingCustomTaxCodes } = useCustomTaxCodes();

  const [isLoadingCommerceTaxClasses, setIsLoadingCommerceTaxClasses] =
    useState(true);
  const [commerceTaxClasses, setCommerceTaxClasses] = useState([]);

  const refetchCommerceTaxClasses = useCallback(async () => {
    setIsLoadingCommerceTaxClasses(true);
    try {
      const rows = await fetchCommerceTaxClasses(commerceHost, imsToken);
      setCommerceTaxClasses(rows);
    } catch (error) {
      console.error("Error fetching commerce tax classes:", error);
      setCommerceTaxClasses([]);
    } finally {
      setIsLoadingCommerceTaxClasses(false);
    }
  }, [commerceHost, imsToken]);

  useEffect(() => {
    refetchCommerceTaxClasses();
  }, [refetchCommerceTaxClasses]);

  const handleSave = useCallback(
    async (newTaxClass) => {
      try {
        await createOrUpdateCommerceTaxClass(commerceHost, imsToken, newTaxClass);
        await refetchCommerceTaxClasses();
      } catch (error) {
        console.error("Something went wrong while saving tax class:", error);
      }
    },
    [commerceHost, imsToken, refetchCommerceTaxClasses],
  );

  function renderEmptyState() {
    return (
      <IllustratedMessage>
        <Content>No data available</Content>
      </IllustratedMessage>
    );
  }

  return (
    <Flex direction="column" marginX={20}>
      <Flex
        alignItems="center"
        direction="row"
        gap="size-200"
        justifyContent="space-between"
        marginX={5}>
        <Heading level={1}>Manage Tax Classes</Heading>

        <DialogTrigger type="modal">
          <Button isDisabled={isLoadingCustomTaxCodes} variant="accent">
            Add New Tax Class
          </Button>
          {(close) => (
            <TaxClassDialog
              close={close}
              customTaxCodes={customTaxCodes}
              onSave={handleSave}
              taxClass={null}
            />
          )}
        </DialogTrigger>
      </Flex>

      {isLoadingCustomTaxCodes || isLoadingCommerceTaxClasses ? (
        <Flex alignItems="center" height="100vh" justifyContent="center">
          <ProgressCircle aria-label="Loading…" isIndeterminate size="L" />
        </Flex>
      ) : (
        <Flex>
          <TableView
            aria-label="tax class table"
            flex
            minHeight="static-size-1000"
            overflowMode="wrap"
            renderEmptyState={renderEmptyState}
            width="100%">
            <TableHeader>
              <Column align="start" width={10}>#</Column>
              <Column>Commerce ID</Column>
              <Column>Class Type</Column>
              <Column>Class Name</Column>
              <Column>Custom Tax Code</Column>
              <Column>Actions</Column>
            </TableHeader>

            <TableBody items={commerceTaxClasses}>
              {(item) => (
                <Row key={item.id}>
                  <Cell>
                    <Text UNSAFE_style={{ color: "grey" }}>{item.rowNumber}</Text>
                  </Cell>
                  <Cell>{item.id}</Cell>
                  <Cell>{item.classType}</Cell>
                  <Cell>{item.className}</Cell>
                  <Cell>
                    {item.customTaxCode
                      ? `${item.customTaxCode} (${item.customTaxLabel})`
                      : ""}
                  </Cell>
                  <Cell>
                    <DialogTrigger
                      key={`${item.id}-${customTaxCodes.length}`}
                      type="modal">
                      <Button style="outline" variant="secondary">
                        Edit
                      </Button>
                      {(close) => (
                        <TaxClassDialog
                          close={close}
                          customTaxCodes={customTaxCodes}
                          onSave={handleSave}
                          taxClass={item}
                        />
                      )}
                    </DialogTrigger>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </Flex>
      )}
    </Flex>
  );
}
```

- [ ] **Step 3: Wire it into the generated `main-page.jsx`**

In `tax-integration/src/commerce-backend-ui-2/web-src/src/pages/main-page.jsx`, replace the generated placeholder body (the `Welcome`/`welcome.jsx` render) with:

```jsx
import { TaxClassesPage } from "#web/components/TaxClassesPage.jsx";

export function MainPage() {
  return <TaxClassesPage />;
}
```

(Keep whatever copyright header, if any, the generated file already has — the SDK's scaffold generates `web-src` files with no header, per its own convention noted in the `commerce-app-admin-ui` skill.)

- [ ] **Step 4: Build**

Run: `cd tax-integration && npx aio app build`
Expected: no bundler errors; fix any Spectrum S2 component/prop mismatch surfaced here (see the caveat above this task) before proceeding

- [ ] **Step 5: Commit**

```bash
git add tax-integration/src/commerce-backend-ui-2/web-src/src/components/TaxClassesPage.jsx tax-integration/src/commerce-backend-ui-2/web-src/src/hooks/useCustomTaxCodes.js tax-integration/src/commerce-backend-ui-2/web-src/src/pages/main-page.jsx
git commit -m "tax-integration: port TaxClassesPage to commerce/backend-ui/2, calling Commerce REST directly"
```

---

### Task 19: Decision point — validate direct-from-browser Commerce REST calls (CORS)

This task is a **required manual validation gate**, not optional polish. The v1 `commerce/index.js` proxy action existed partly to avoid the browser's CORS restrictions (a server-to-server call isn't subject to them). Task 17/18's direct `fetch()` calls from the extension's iframe are subject to CORS, and there's no existing evidence in this repo that the target Commerce instance's REST API sends the necessary `Access-Control-Allow-Origin` headers for the App Builder extension's origin.

**Files:**
- Conditionally create (fallback branch only): `tax-integration/src/commerce-backend-ui-2/actions/commerce-tax-classes/index.js`
- Conditionally modify (fallback branch only): `tax-integration/src/commerce-backend-ui-2/ext.config.yaml` (preserved `runtimeManifest` section, per the SDK's own instruction that the build keeps hand-added packages there across rebuilds)
- Conditionally modify (fallback branch only): `tax-integration/src/commerce-backend-ui-2/web-src/src/lib/commerce-tax-classes.js` (call the fallback action instead of Commerce directly)

- [ ] **Step 1: Deploy to a workspace and manually exercise the Tax management page**

Run: `cd tax-integration && npx aio app deploy --force-build --force-deploy`, then open Commerce Admin, navigate to **Stores > Tax management**, and check the browser devtools Network/Console tabs while the page loads and while saving a tax class.

- [ ] **Step 2: Branch on the result**

  - **If the requests succeed** (Commerce returns the data with no CORS error in the console): no further action — Tasks 17/18's direct-call implementation stands. Document this outcome in `tax-integration/README.md` (Task 23) so the next contributor doesn't second-guess it.
  - **If the browser blocks the requests with a CORS error**: implement the fallback below.

- [ ] **Step 3 (fallback branch only): add a minimal proxy action that forwards the admin's own IMS token**, *not* machine `OAUTH_*` credentials (unlike the old `commerce/index.js`, which used the app's service-account credentials) — create `tax-integration/src/commerce-backend-ui-2/actions/commerce-tax-classes/index.js`. `@adobe/aio-commerce-sdk/core/headers`'s `parseBearerToken` is a clean fit for validating the incoming `Authorization` header (rejecting anything that isn't a well-formed Bearer token before it's forwarded to Commerce) — it's a pure function with no wire-format ambiguity. For the response envelope, use `ok()` from `@adobe/aio-commerce-sdk/core/responses` for the success path only (verified — Tasks 5/6 already confirm `ok()` produces the flat `{statusCode, body}` shape OpenWhisk web actions expect); its `badRequest`/`internalServerError` counterparts return a nested `{type: "error", error: {statusCode, body}}` envelope instead, which OpenWhisk's web-action dispatch does not unwrap on its own — since there's no confirmed wrapper for that shape in this app, the error paths below use plain object literals rather than asserting an unverified integration detail:

```js
import { ok } from "@adobe/aio-commerce-sdk/core/responses";
import { parseBearerToken } from "@adobe/aio-commerce-sdk/core/headers";

export async function main(params) {
  const { operation, method = "GET", payload = null } = params;

  let bearerToken;
  try {
    bearerToken = parseBearerToken(params.__ow_headers?.authorization ?? "");
  } catch {
    return { statusCode: 400, body: { message: "Missing or malformed Authorization header" } };
  }

  try {
    const response = await fetch(`${params.COMMERCE_BASE_URL}V1/${operation}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken.token}`,
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });

    return ok({ body: await response.json() });
  } catch (error) {
    return { statusCode: 500, body: { message: `Commerce request failed: ${error.message}` } };
  }
}
```

- [ ] **Step 4 (fallback branch only): declare it in `tax-integration/src/commerce-backend-ui-2/ext.config.yaml`** under a hand-added package (the generator preserves this section across re-runs):

```yaml
runtimeManifest:
  packages:
    tax-integration-admin-ui:
      license: Apache-2.0
      actions:
        commerce-tax-classes:
          function: actions/commerce-tax-classes/index.js
          web: 'yes'
          runtime: nodejs:24
          inputs:
            LOG_LEVEL: debug
            COMMERCE_BASE_URL: $COMMERCE_BASE_URL
          annotations:
            require-adobe-auth: true
            final: true
```

- [ ] **Step 5 (fallback branch only): update `commerce-tax-classes.js`'s two functions to call this action** (via its generated runtime URL, forwarding `imsToken` as the `Authorization` header) instead of calling `commerceHost` directly, keeping the exact same exported function signatures (`fetchCommerceTaxClasses(commerceHost, imsToken)`, `createOrUpdateCommerceTaxClass(commerceHost, imsToken, taxClass)`) so Task 16's tests and Task 18's `TaxClassesPage.jsx` don't need to change.

- [ ] **Step 6: Record the outcome**

```bash
git add -A tax-integration
git commit -m "tax-integration: record CORS validation outcome for direct Commerce REST calls"
```

(If Step 2 resolved to "succeeds", this commit has no code changes beyond the README note from Task 23 — skip committing here and fold the note into Task 23's commit instead.)

---

## Phase 6 — Auth strategy for the runtime webhook actions (gated on `shipping-method/`)

### Task 20: Decision point — association-based auth for `collect-taxes`/`collect-adjustment-taxes`

The design spec asks every domain app to attempt swapping its runtime webhook actions from the legacy hand-rolled `lib/adobe-commerce.js` OAuth1/IMS client to the SDK's association-based `getCommerceClient`/`getCommerceInstance`, **gated on `shipping-method/`'s validation spike succeeding** for `shipping-methods` under real webhook traffic.

**Finding specific to tax:** neither `collect-taxes` (Task 5) nor `collect-adjustment-taxes` (Task 6) instantiates a Commerce HTTP client at all, today or in this plan — both are pure calculation webhooks that only call `webhookVerify`/`webhookErrorResponse` and return computed tax operations. There is no hand-rolled client usage in either action to swap. This task is therefore a documented no-op today, plus a guard test and forward-looking guidance for if/when a future tax webhook needs Commerce API access.

**Files:**
- Test: `tax-integration/test/actions/no-commerce-client.test.js`
- Modify: `tax-integration/README.md` (Task 23 folds this in)

**Interfaces:**
- None — this task only adds a regression guard, no production code changes.

- [ ] **Step 1: Check whether `shipping-method/`'s spike has concluded**

Look for the recorded outcome in `shipping-method/README.md` or its implementation plan under `docs/superpowers/plans/` (once that worktree has merged). Two outcomes, both leading to the same action for tax today:

  - **Spike succeeded:** future tax webhook actions that need Commerce API access should use `getCommerceClient(resolveImsAuthParams(params))` with `AIO_COMMERCE_AUTH_IMS_*` action inputs (mirroring Task 12's install-step pattern), and `getCommerceInstance()` in place of a `COMMERCE_BASE_URL` input.
  - **Spike failed:** future tax webhook actions that need Commerce API access should keep a hand-rolled client analogous to the (not-migrated-here) `lib/adobe-commerce.js`'s `getAdobeCommerceClient`, with `OAUTH_*`/`COMMERCE_CONSUMER_*` action inputs, until the SDK's runtime-webhook auth path is fixed upstream.

Neither branch requires a code change to `collect-taxes`/`collect-adjustment-taxes` today.

- [ ] **Step 2: Write a regression test guarding against silently reintroducing a Commerce client into these two actions**

```js
// tax-integration/test/actions/no-commerce-client.test.js
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

import fs from "node:fs";

import { describe, expect, test } from "vitest";

describe("collect-taxes / collect-adjustment-taxes have no Commerce client dependency", () => {
  test.each([
    "actions/collect-taxes/index.js",
    "actions/collect-adjustment-taxes/index.js",
  ])("%s does not import getCommerceClient or a Commerce HTTP client", (file) => {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

    expect(source).not.toMatch(/getCommerceClient/);
    expect(source).not.toMatch(/getAdobeCommerceClient/);
  });
});
```

- [ ] **Step 3: Run the test to verify it passes immediately** (it documents current-state behavior, not a new capability, so no red/green cycle is needed here)

Run: `cd tax-integration && npx vitest run test/actions/no-commerce-client.test.js`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add tax-integration/test/actions/no-commerce-client.test.js
git commit -m "tax-integration: guard collect-taxes/collect-adjustment-taxes against a Commerce client dependency"
```

---

## Phase 7 — Webhook subscriptions, full test run, and README

### Task 21: Declare webhook subscriptions in `app.commerce.config.ts`

`@adobe/aio-commerce-lib-app`'s `defineConfig` has a top-level `webhooks` array (schema: `source/config/schema/webhooks.ts` in the `aio-commerce-sdk` monorepo) that auto-registers a runtime action as a Commerce webhook subscriber at install time — no custom installation-step code needed. This supersedes any assumption elsewhere in this plan that "Create Webhooks" stays a manual README step (see Task 23).

Per the design spec's "Webhook subscriptions (declarative `webhooks` config)" section, the `webhook_method` string differs between PaaS and SaaS for both tax actions (only the `"magento."` prefix changes), so each action needs **two** env-scoped entries (`env: ["paas"]` and `env: ["saas"]`) — four entries total. The values below are sourced directly from `AdobeDocs/commerce-extensibility`, not fabricated. Field names follow the SDK schema's snake_case (`webhook_method`, `webhook_type`, `batch_name`, `hook_name`, `soft_timeout`, `fallback_error_message`) — not the camelCase names used in `webhooks.xml` PaaS examples.

| Action | env | `webhook_method` |
|---|---|---|
| `collect-taxes` | `paas` | `plugin.magento.out_of_process_tax_management.api.oop_tax_collection.collect_taxes` |
| `collect-taxes` | `saas` | `plugin.out_of_process_tax_management.api.oop_tax_collection.collect_taxes` |
| `collect-adjustment-taxes` | `paas` | `plugin.magento.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes` |
| `collect-adjustment-taxes` | `saas` | `plugin.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes` |

All four entries share: `webhook_type: "before"`, `batch_name: "collect_taxes"`, `hook_name: "collect_taxes"`, `method: "POST"`, `timeout: 10_000`, `soft_timeout: 2000`, `priority: 100`, `required: true`. `fallback_error_message` differs per action: `"Tax calculation failed. Please try again later."` for `collect-taxes`, `"Adjustment tax calculation failed. Please try again later."` for `collect-adjustment-taxes`.

**Files:**
- Modify: `tax-integration/app.commerce.config.ts` (add top-level `webhooks` array)
- Test: `tax-integration/test/app.commerce.config.test.js`

**Interfaces:**
- Consumes: `runtimeAction` values `"commerce-checkout-starter-kit/collect-taxes"` and `"commerce-checkout-starter-kit/collect-adjustment-taxes"`, matching the exact `<package>/<action>` names wired into `app.config.yaml` in Task 8.
- Produces: the `webhooks` array on the default-exported config, read by `aio-commerce-lib-app`'s install workflow — no other task consumes this programmatically.

- [ ] **Step 1: Write the failing test**

```js
// tax-integration/test/app.commerce.config.test.js
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

const SHARED_FIELDS = {
  webhook_type: "before",
  batch_name: "collect_taxes",
  hook_name: "collect_taxes",
  method: "POST",
  timeout: 10_000,
  soft_timeout: 2000,
  priority: 100,
  required: true,
};

describe("app.commerce.config.ts webhooks", () => {
  test("declares exactly 4 webhook entries total", () => {
    expect(config.webhooks).toHaveLength(4);
  });

  test("declares PaaS and SaaS entries for collect-taxes", () => {
    const entries = config.webhooks.filter(
      (entry) =>
        entry.runtimeAction === "commerce-checkout-starter-kit/collect-taxes",
    );
    expect(entries).toHaveLength(2);

    const paas = entries.find((entry) => entry.env?.includes("paas"));
    expect(paas.webhook).toMatchObject({
      ...SHARED_FIELDS,
      webhook_method:
        "plugin.magento.out_of_process_tax_management.api.oop_tax_collection.collect_taxes",
      fallback_error_message: "Tax calculation failed. Please try again later.",
    });

    const saas = entries.find((entry) => entry.env?.includes("saas"));
    expect(saas.webhook).toMatchObject({
      ...SHARED_FIELDS,
      webhook_method:
        "plugin.out_of_process_tax_management.api.oop_tax_collection.collect_taxes",
      fallback_error_message: "Tax calculation failed. Please try again later.",
    });
  });

  test("declares PaaS and SaaS entries for collect-adjustment-taxes", () => {
    const entries = config.webhooks.filter(
      (entry) =>
        entry.runtimeAction ===
        "commerce-checkout-starter-kit/collect-adjustment-taxes",
    );
    expect(entries).toHaveLength(2);

    const paas = entries.find((entry) => entry.env?.includes("paas"));
    expect(paas.webhook).toMatchObject({
      ...SHARED_FIELDS,
      webhook_method:
        "plugin.magento.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes",
      fallback_error_message:
        "Adjustment tax calculation failed. Please try again later.",
    });

    const saas = entries.find((entry) => entry.env?.includes("saas"));
    expect(saas.webhook).toMatchObject({
      ...SHARED_FIELDS,
      webhook_method:
        "plugin.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes",
      fallback_error_message:
        "Adjustment tax calculation failed. Please try again later.",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tax-integration && npx vitest run test/app.commerce.config.test.js`
Expected: FAIL — `expected undefined to have a length of 4` (no `webhooks` key on the config yet)

- [ ] **Step 3: Add the `webhooks` array to `tax-integration/app.commerce.config.ts`**

Add a top-level `webhooks` key to the `defineConfig({...})` call (alongside `metadata`, `installation`, `adminUi`):

```ts
  webhooks: [
    {
      label: "Collect taxes (PaaS)",
      description:
        "Subscribes collect-taxes to the PaaS out-of-process tax collection webhook.",
      env: ["paas"],
      runtimeAction: "commerce-checkout-starter-kit/collect-taxes",
      requireAdobeAuth: false,
      webhook: {
        webhook_method:
          "plugin.magento.out_of_process_tax_management.api.oop_tax_collection.collect_taxes",
        webhook_type: "before",
        batch_name: "collect_taxes",
        hook_name: "collect_taxes",
        method: "POST",
        timeout: 10_000,
        soft_timeout: 2000,
        priority: 100,
        required: true,
        fallback_error_message: "Tax calculation failed. Please try again later.",
      },
    },
    {
      label: "Collect taxes (SaaS)",
      description:
        "Subscribes collect-taxes to the SaaS out-of-process tax collection webhook.",
      env: ["saas"],
      runtimeAction: "commerce-checkout-starter-kit/collect-taxes",
      requireAdobeAuth: false,
      webhook: {
        webhook_method:
          "plugin.out_of_process_tax_management.api.oop_tax_collection.collect_taxes",
        webhook_type: "before",
        batch_name: "collect_taxes",
        hook_name: "collect_taxes",
        method: "POST",
        timeout: 10_000,
        soft_timeout: 2000,
        priority: 100,
        required: true,
        fallback_error_message: "Tax calculation failed. Please try again later.",
      },
    },
    {
      label: "Collect adjustment taxes (PaaS)",
      description:
        "Subscribes collect-adjustment-taxes to the PaaS out-of-process credit-memo tax collection webhook.",
      env: ["paas"],
      runtimeAction: "commerce-checkout-starter-kit/collect-adjustment-taxes",
      requireAdobeAuth: false,
      webhook: {
        webhook_method:
          "plugin.magento.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes",
        webhook_type: "before",
        batch_name: "collect_taxes",
        hook_name: "collect_taxes",
        method: "POST",
        timeout: 10_000,
        soft_timeout: 2000,
        priority: 100,
        required: true,
        fallback_error_message:
          "Adjustment tax calculation failed. Please try again later.",
      },
    },
    {
      label: "Collect adjustment taxes (SaaS)",
      description:
        "Subscribes collect-adjustment-taxes to the SaaS out-of-process credit-memo tax collection webhook.",
      env: ["saas"],
      runtimeAction: "commerce-checkout-starter-kit/collect-adjustment-taxes",
      requireAdobeAuth: false,
      webhook: {
        webhook_method:
          "plugin.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes",
        webhook_type: "before",
        batch_name: "collect_taxes",
        hook_name: "collect_taxes",
        method: "POST",
        timeout: 10_000,
        soft_timeout: 2000,
        priority: 100,
        required: true,
        fallback_error_message:
          "Adjustment tax calculation failed. Please try again later.",
      },
    },
  ],
```

`requireAdobeAuth: false` mirrors the `require-adobe-auth: false` annotation already on both actions in `app.config.yaml` (Task 8) — these are Commerce-invoked `raw-http` webhooks, not IMS-authenticated Runtime calls, so the subscription config shouldn't assume an Adobe IMS token is required either.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tax-integration && npx vitest run test/app.commerce.config.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and build**

Run: `cd tax-integration && npm run typecheck && npx aio app build`
Expected: both succeed (validates the `webhooks` array against `WebhooksSchema`)

- [ ] **Step 6: Commit**

```bash
git add tax-integration/app.commerce.config.ts tax-integration/test/app.commerce.config.test.js
git commit -m "tax-integration: declare collect-taxes/collect-adjustment-taxes webhook subscriptions"
```

---

### Task 22: Run the full test suite and coverage for `tax-integration/`

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `cd tax-integration && npm test`
Expected: all tests pass (webhook helpers, both webhook actions, install step, webhook subscription config, Commerce-REST helpers, no-Commerce-client guard)

- [ ] **Step 2: Run coverage**

Run: `cd tax-integration && npm run test:coverage`
Expected: report generated with no failures; `lib/webhook.js`, both action files, `scripts/create-tax-integrations.js`, and `app.commerce.config.ts` show meaningful coverage

- [ ] **Step 3: Run lint and format checks**

Run: `cd tax-integration && npm run code:check`
Expected: no violations (fix any Biome/Ultracite findings before proceeding)

- [ ] **Step 4: Run the full build**

Run: `cd tax-integration && npx aio app build`
Expected: succeeds

- [ ] **Step 5: Commit any lint/format fixes**

```bash
git add tax-integration
git commit -m "tax-integration: fix lint/format findings"
```

(Skip this commit if Step 3 found nothing to fix.)

---

### Task 23: Write `tax-integration/README.md`

Per the design spec, this follows the App Management install/build/deploy/association flow by linking to Adobe's docs rather than re-documenting it, keeping only tax-specific guidance: webhook signature setup, the tax-use-cases doc link, Admin UI usage, and validation steps. It also folds in the CORS decision recorded in Task 19, the auth-swap decision recorded in Task 20, and reflects that webhook *subscription* (as opposed to signature verification) is now automatic per Task 21 — no manual "Create Webhooks" step remains.

**Files:**
- Create: `tax-integration/README.md`

- [ ] **Step 1: Create the file**

```markdown
# Checkout Tax Integration

Out-of-process tax collection (`collect-taxes`, `collect-adjustment-taxes`), tax-integration
onboarding, and Commerce Admin tax-class management for the Adobe Commerce checkout starter kit.
This app is one of four independently-deployable domain apps split out of the monolithic
[commerce-checkout-starter-kit](../README.md) — see
[the domain-split design doc](../docs/superpowers/specs/2026-07-07-app-management-domain-split-design.md)
for the overall rationale.

This app is configured via [`app.commerce.config.ts`](./app.commerce.config.ts) using
[`@adobe/aio-commerce-lib-app`](https://github.com/adobe/aio-commerce-sdk). For install, build,
deploy, and Commerce-association steps, follow the
[Adobe App Management documentation](https://developer.adobe.com/commerce/extensibility/app-development/)
— this README only covers what's specific to the tax domain.

> **Beta dependencies:** this app pins beta builds of `@adobe/aio-commerce-lib-app`,
> `@adobe/aio-commerce-sdk`, and `@adobe/aio-commerce-lib-admin-ui` (see `package.json`) ahead of
> their real releases. `@adobe/aio-commerce-lib-admin-ui` is additionally marked
> **Experimental — not yet production-ready** by its own maintainers; this app is the only one of
> the four checkout domain apps that depends on it, since it's the only one with an Admin UI
> extension.

## Prerequisites

- Adobe Commerce as a Cloud Service (SaaS), or Adobe Commerce `2.4.5`+ (PaaS) with:

  ```bash
  composer require magento/module-out-of-process-tax-management --with-dependencies
  composer require "magento/commerce-backend-sdk": ">=3.0"
  ```

- [Commerce Webhooks](https://developer.adobe.com/commerce/extensibility/webhooks/installation/) installed (PaaS).
- Complete the [Admin UI SDK installation process](https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/installation/)
  in Commerce Admin manually before associating this app — this app does not automate Admin UI SDK
  enablement via a custom installation step (a deliberate scope decision; see the design spec's
  "SDK packages (beta)" section for the `enableAdminUiSdk`/`registerExtension` API this could use
  in a future iteration).

## Install

Follow [App Management's install flow](https://developer.adobe.com/commerce/extensibility/app-development/) to
associate this app with your Commerce instance and run its custom installation step
("Create tax integrations"), which registers the integrations defined in
[`tax-integrations.yaml`](./tax-integrations.yaml).

## Webhook subscriptions

`collect-taxes` and `collect-adjustment-taxes` are subscribed to Commerce automatically at install
time via the declarative `webhooks` array in [`app.commerce.config.ts`](./app.commerce.config.ts)
— App Management resolves each action's deployed Runtime URL and registers it against the correct
webhook method for your instance's flavor (PaaS or SaaS) as part of association. There is no
manual "Create Webhooks" step to follow.

## Configure webhook signature verification

The one piece App Management doesn't cover is enabling and sharing the Commerce webhook signing
key — that's a Commerce Admin configuration step, not an app-association step, so it stays manual:

1. In Adobe Commerce, go to **Stores > Settings > Configuration > Adobe Services > Webhooks**.
2. Enable **Digital Signature Configuration** and click **Regenerate Key Pair**.
3. Add the generated **Public Key** to your `.env` as
   [documented](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action):

   ```env
   COMMERCE_WEBHOOKS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   -----END PUBLIC KEY-----"
   ```

See the [tax use cases documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/tax-use-cases/)
for the full webhook contract and sample payloads.

## Admin UI — Tax management

This app registers a **Tax management** entry under **Stores** in the Commerce Admin menu (via the
`commerce/backend-ui/2` extension point), letting merchants view and create/edit Commerce tax
classes without leaving the Admin. The page calls the Commerce REST API directly from the browser,
using the logged-in admin's own IMS token — there is no backend proxy action for this.

<!-- Fill in after Task 19 runs against a real Commerce instance: -->
<!-- "Direct browser-to-Commerce REST calls were validated against <instance> on <date> with no CORS issues." -->
<!-- or, if the fallback proxy action was needed: -->
<!-- "Commerce blocked direct browser calls with a CORS error; this app uses a thin proxy action -->
<!-- (`src/commerce-backend-ui-2/actions/commerce-tax-classes/`) that forwards the admin's own IMS -->
<!-- token, instead of the app's machine credentials." -->

## Auth strategy for `collect-taxes` / `collect-adjustment-taxes`

These two webhook actions never call the Commerce REST API — they only verify the webhook
signature and return computed tax operations — so the association-based `getCommerceClient`/
`getCommerceInstance` auth swap validated by `shipping-method/`'s spike does not apply to them.
If a future tax webhook needs Commerce API access, check `shipping-method/`'s recorded outcome
before choosing between the SDK's association-based client and a hand-rolled one.

## Validation

1. Confirm the tax class appears in Commerce Admin's checkout after deployment.
2. Place an order and confirm the correct tax amount is applied at checkout.
3. Issue a credit memo with a refund/fee adjustment and confirm `collect-adjustment-taxes`
   computes the adjustment tax correctly.
4. Open **Stores > Tax management** in Commerce Admin and confirm the tax-class table loads and
   the "Add New Tax Class" / "Edit" dialogs save successfully.
```

- [ ] **Step 2: Fill in the Admin UI CORS outcome comment from Task 19's result**, replacing the placeholder HTML comments with the actual recorded outcome.

- [ ] **Step 3: Commit**

```bash
git add tax-integration/README.md
git commit -m "tax-integration: add README with App Management flow and tax-specific guidance"
```

---

## Self-Review

**Spec coverage:**
- Self-contained app with own `package.json`/`app.config.yaml`/`app.commerce.config.ts`/`biome.jsonc`/`vitest.config.js` at top-level `tax-integration/` (not `apps/tax/`) — Tasks 1, 2, 8, 9.
- `collect-taxes`/`collect-adjustment-taxes` moved — Tasks 5, 6.
- `create-tax-integrations.js` rewritten as `defineCustomInstallationStep` using `getCommerceClient(resolveImsAuthParams(context.params))` — Task 12.
- `tax-integrations.yaml` moved — Task 10.
- Admin UI v1→v2 migration, explicit dedicated phase — Phase 5 (Tasks 13-19), including the experimental-package risk disclosure and the two explicit scope decisions (skip `enableAdminUiSdk`/`registerExtension`; grid/mass-action/order-view-button builders not applicable).
- `commerce-checkout-starter-kit/info` duplicated unchanged — Task 7.
- `webhookVerify` split out of `lib/adobe-commerce.js`; `webhookSuccessResponse`/`webhookErrorResponse` dropped and replaced by `@adobe/aio-commerce-sdk/webhooks/responses`'s typed builders (`addOperation`/`replaceOperation`/`exceptionOperation`/`ok`) inside the two webhook actions themselves — Tasks 3, 5, 6.
- Beta SDK package versions pinned exactly per the design spec's "SDK packages (beta)" table (`aio-commerce-lib-app@1.8.0-beta-...`, `aio-commerce-sdk@1.4.0-beta-...`, `aio-commerce-lib-admin-ui@0.2.0-beta-...`) — Task 1.
- `@adobe/aio-commerce-sdk/core/*` adopted where a clean drop-in (`HTTP_OK` in `telemetry.js`, Task 4; `parseBearerToken`/`ok` in Task 19's conditional CORS-fallback proxy action) and explicitly not forced elsewhere (`lib/http.js` stays for the untouched info action; `allNonEmpty` has no natural home in this app's scope) — Tasks 3, 4, 19.
- Auth-swap gated on `shipping-method/`'s spike, decision point present — Task 20.
- Declarative `webhooks` config: 4 env-scoped entries (2 per action, PaaS + SaaS) with the exact confirmed `webhook_method`/`batch_name`/`hook_name`/timing/`fallback_error_message` values, replacing the manual "Create Webhooks" README step — Task 21, folded into the README at Task 23.
- README following App Management flow, tax-specific guidance only, including the beta-dependency and experimental-admin-ui disclosure, and the now-automatic webhook subscription — Task 23.
- Tests moved/added alongside code, new tests for the rewritten install step and the webhook subscription config — Tasks 5, 6, 11, 16, 20, 21, throughout.
- No root-level file touched — enforced as a Global Constraint and never violated by any task's file list.

**Placeholder scan:** no "TBD"/"handle it"/"similar to Task N" — the two HTML-comment placeholders in Task 23's README are intentional and are explicitly filled in by Task 19's outcome in Task 23 Step 2, not left dangling.

**Type/name consistency:** `createTaxIntegrations(client, data)` (Task 11's test, Task 12's implementation) — consistent. `fetchCommerceTaxClasses(commerceHost, imsToken)` / `createOrUpdateCommerceTaxClass(commerceHost, imsToken, taxClass)` (Task 16's test, Task 17's implementation, Task 18's usage) — consistent. `webhookVerify` (Task 3) and `HTTP_OK` (Task 3, info-action-only) import paths match across Tasks 5, 6, 7. `addOperation`/`replaceOperation`/`exceptionOperation`/`ok` from `@adobe/aio-commerce-sdk/webhooks/responses` (Tasks 5, 6) and `MENU_STORES` from `@adobe/aio-commerce-lib-admin-ui/menu` (Task 14, corrected from an earlier draft that wrongly sourced it from `@adobe/aio-commerce-sdk/admin-ui/menu`) use the exact subpaths confirmed against the `aio-commerce-sdk` monorepo source. Task 21's `webhooks[].runtimeAction` values (`"commerce-checkout-starter-kit/collect-taxes"`, `"commerce-checkout-starter-kit/collect-adjustment-taxes"`) use the exact `<package>/<action>` name wired into `app.config.yaml` by Task 8 (`commerce-checkout-starter-kit` package, unchanged from root, "do not change" tracking-action naming aside) — consistent.
