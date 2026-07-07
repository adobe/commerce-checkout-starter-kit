# Totals Collector App Management Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `total-collector-discounts` action group out of the checkout-starter-kit monolith into a fully self-contained, independently deployable App Builder / App Management app at the repo-root directory `totals-collector/`.

**Architecture:** `totals-collector/` becomes a sibling of `actions/`, `lib/`, etc. (not nested under any shared `apps/` parent — there is no such parent). It owns every file it needs (`package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`) with zero shared root-level tooling. The 9 discount webhook actions, their shared helper module, and the Adobe tracking `info` action are relocated (not shared) into this directory. Because these actions never call the Commerce REST API — they are pure webhook payload transforms driven only by the incoming request body — the app carries a minimal webhook-signature-verification helper (`webhookVerify`/`webhookErrorResponse`/`webhookSuccessResponse`, extracted from `lib/adobe-commerce.js`) instead of the full Commerce HTTP client (`got`, `oauth-1.0a`, `@adobe/aio-sdk`'s `Core.Logger`, OAuth env vars). `app.commerce.config.ts` therefore declares only `metadata` — no `installation.customInstallationSteps` (there is no Commerce-side registration script for these actions today, and none is being added) and no `adminUi`.

**Tech Stack:** Node.js `^24.0.0`, App Builder (`aio app` runtime manifest), `@adobe/aio-commerce-lib-app` (config source of truth), Vitest 4, Biome 2 (`ultracite` presets), Husky + lint-staged.

## Global Constraints

- Root directory for this domain is `totals-collector/` at the repo root — **not** `apps/fees/` and **not** nested under any `apps/` parent (per the corrected spec at `docs/superpowers/specs/2026-07-07-app-management-domain-split-design.md`).
- `totals-collector/` is fully self-contained: own `package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`. No shared root-level tooling, no npm workspaces.
- No Commerce REST API client, no OAuth/IMS credentials, no `installation.customInstallationSteps`, and no association-based `getCommerceClient` auth anywhere in this app — these actions never call Commerce.
- Do not modify the business logic inside any of the 9 discount actions (structural/config migration only).
- The `commerce-checkout-starter-kit/info` action content must not change — only its package address changes as an inherent consequence of the split.
- Do not touch `shipping-method/`, `payment-method/`, `tax-integration/`, or any root-level file outside what this plan creates (those domains are planned separately, in sibling worktrees).
- Do not remove the root-level monolith (`actions/`, `lib/`, etc.) — that happens in a separate, later "remove the monolith" PR after all four domains are merged.

---

## Source-of-truth reference (read, do not re-derive)

These facts were confirmed by reading the current repo and are load-bearing for the tasks below:

- All 9 discount actions (`actions/total-collector-discounts/*/index.js`) import only three things: `{ webhookErrorResponse, webhookVerify }` from `lib/adobe-commerce.js`, `{ HTTP_OK }` from `lib/http.js`, and assorted helpers from `lib/total-collector-discounts.js`. None imports `got`, `oauth-1.0a`, `@adobe/aio-sdk`, or `getAdobeCommerceClient`.
- `webhookSuccessResponse` (also defined in `lib/adobe-commerce.js`) is **not** used by any of the 9 discount actions today (confirmed via repo-wide search — it's used only by `validate-payment`, `filter-payment`, `shipping-methods`, `collect-taxes`, `collect-adjustment-taxes`). It is still extracted into the new shared module for API completeness/symmetry with the other three domain apps, but no discount action currently calls it.
- `webhookVerify`, `webhookErrorResponse`, and `webhookSuccessResponse` (`lib/adobe-commerce.js:307-390`) depend only on `node:crypto` and the `HTTP_OK` constant from `lib/http.js` — zero dependency on `got`, `Oauth1a`, `@adobe/aio-sdk`, or `resolveAuthOptions`.
- `lib/http.js` is a tiny, fully self-contained file of HTTP status constants with no imports.
- `lib/total-collector-discounts.js` is a fully self-contained helper module (`parseJsonBody`, `round2`, `getShippingItems`, `itemIdentifierForLookup`, `buildQuoteItemIndex`, `resolveQuoteLineForShippingItem`, `getExistingItemBaseDiscount`, `getExistingItemDiscountAmount`, `zeroDiscountOperation`, `discountOperation`, `categoryFromSku`, `itemCategoryFromSku`) with no imports of its own.
- Every one of the 9 discount actions in `app.config.yaml:92-199` has the identical shape: `web: 'yes'`, `runtime: nodejs:24`, `inputs: { LOG_LEVEL: debug, COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY, ENABLE_TELEMETRY: true }`, `annotations: { require-adobe-auth: false, raw-http: true, final: true }`.
- `actions/commerce-checkout-starter-kit-info/index.js` (`app.config.yaml:11-17`, the `info` action) imports only `{ HTTP_OK }` from `../../lib/http.js` and has annotations `{ require-adobe-auth: true, final: true }`, no `inputs`.
- `hooks/pre-app-build.js` runs `scripts/sync-oauth-credentials.js`, which exists solely to sync Commerce OAuth/IMS credentials — irrelevant to this domain. `totals-collector/app.config.yaml` must not declare a `pre-app-build` hook.
- No existing test file references `total-collector-discounts` or `lib/total-collector-discounts.js` (confirmed via a scoped search of `test/` and `e2e/`) — there is nothing to port for the discount actions themselves.
- `test/lib/adobe-commerce.test.js:110-176` contains a `describe("webhookVerify", ...)` block with 5 tests that exercises exactly the function being extracted into this app's `lib/webhooks.js`. These tests are ported (not the surrounding `getAdobeCommerceClient` tests, which don't apply here).
- `@adobe/aio-commerce-lib-app` (current version `1.7.0`) requires only a `metadata` object on `defineConfig` — `installation`, `adminUi`, `eventing`, `businessConfig`, and `webhooks` are all optional. A config with only `metadata` is confirmed valid by that package's own test suite. `metadata` requires exactly `id` (alphanumeric/hyphen, ≤100 chars), `displayName` (≤50 chars), `description` (≤255 chars), `version` (semver `X.Y.Z`).

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
    "@adobe/aio-commerce-lib-app": "^1.7.0"
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

Note: no `got`, `oauth-1.0a`, `@adobe/aio-sdk`, `js-yaml`, or `dotenv` — this app has no Commerce HTTP client and no `create-*` onboarding script, so none of those are needed.

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

Expected: install succeeds with no peer-dependency errors.

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

### Task 2: Extract webhook signature helpers into `totals-collector/lib/`

**Files:**
- Create: `totals-collector/lib/http.js`
- Create: `totals-collector/lib/webhooks.js`
- Test: `totals-collector/test/lib/webhooks.test.js`

**Interfaces:**
- Produces: `HTTP_OK` (and `HTTP_BAD_REQUEST`, `HTTP_INTERNAL_ERROR`, `HTTP_NOT_FOUND`, `HTTP_UNAUTHORIZED`) from `totals-collector/lib/http.js`; `webhookVerify(params)`, `webhookErrorResponse(message)`, `webhookSuccessResponse()` from `totals-collector/lib/webhooks.js`. Task 3 and Task 4 import from these two files.

- [ ] **Step 1: Create `totals-collector/lib/http.js` (verbatim copy)**

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

export const HTTP_BAD_REQUEST = 400;
export const HTTP_INTERNAL_ERROR = 500;
export const HTTP_NOT_FOUND = 404;
export const HTTP_OK = 200;
export const HTTP_UNAUTHORIZED = 401;
```

- [ ] **Step 2: Write the failing tests for `webhooks.js` — port the existing `webhookVerify` suite and add new tests for the two response helpers**

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

import {
  webhookErrorResponse,
  webhookSuccessResponse,
  webhookVerify,
} from "../../lib/webhooks.js";

describe("webhookErrorResponse", () => {
  test("returns HTTP 200 with an exception op and the given message", () => {
    const result = webhookErrorResponse("something went wrong");
    expect(result).toEqual({
      statusCode: 200,
      body: { op: "exception", message: "something went wrong" },
    });
  });
});

describe("webhookSuccessResponse", () => {
  test("returns HTTP 200 with a success op", () => {
    const result = webhookSuccessResponse();
    expect(result).toEqual({
      statusCode: 200,
      body: { op: "success" },
    });
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

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd totals-collector && npx vitest run test/lib/webhooks.test.js
```

Expected: FAIL — `Cannot find module '../../lib/webhooks.js'` (file doesn't exist yet).

- [ ] **Step 4: Create `totals-collector/lib/webhooks.js`**

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

import { HTTP_OK } from "./http.js";

/**
 * Returns webhook response error according to Adobe Commerce Webhooks spec.
 *
 * @param {string} message the error message.
 * @returns {object} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
export function webhookErrorResponse(message) {
  return {
    statusCode: HTTP_OK,
    body: {
      op: "exception",
      message,
    },
  };
}

/**
 * Returns webhook response success according to Adobe Commerce Webhooks spec.
 *
 * @returns {object} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
export function webhookSuccessResponse() {
  return {
    statusCode: HTTP_OK,
    body: {
      op: "success",
    },
  };
}

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

Note: this file has **no** import of `got`, `Oauth1a`, `@adobe/aio-sdk`, or `resolveAuthOptions` — only `node:crypto` and the local `HTTP_OK` constant.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd totals-collector && npx vitest run test/lib/webhooks.test.js
```

Expected: PASS — 7 tests (1 `webhookErrorResponse`, 1 `webhookSuccessResponse`, 5 `webhookVerify`).

- [ ] **Step 6: Commit**

```bash
git add totals-collector/lib/http.js totals-collector/lib/webhooks.js totals-collector/test/lib/webhooks.test.js
git commit -m "totals-collector: extract webhook signature helpers, drop Commerce HTTP client"
```

---

### Task 3: Copy the shared discount helper module

**Files:**
- Create: `totals-collector/lib/total-collector-discounts.js`
- Test: `totals-collector/test/lib/total-collector-discounts.test.js`

**Interfaces:**
- Consumes: nothing (no imports of its own).
- Produces: `parseJsonBody`, `round2`, `getShippingItems`, `itemIdentifierForLookup`, `buildQuoteItemIndex`, `resolveQuoteLineForShippingItem`, `getExistingItemBaseDiscount`, `getExistingItemDiscountAmount`, `zeroDiscountOperation`, `discountOperation`, `categoryFromSku`, `itemCategoryFromSku` — consumed by all 9 discount actions in Task 4.

- [ ] **Step 1: Copy the file verbatim (no business-logic changes)**

```bash
cp /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees/lib/total-collector-discounts.js \
   /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees/totals-collector/lib/total-collector-discounts.js
```

- [ ] **Step 2: Verify it's an exact copy**

```bash
diff lib/total-collector-discounts.js totals-collector/lib/total-collector-discounts.js
```

Expected: no output (files are identical).

- [ ] **Step 3: Write a module-loads smoke test**

This module has no pre-existing tests in the repo (confirmed by search) and its business logic is out of scope for this migration, so the only new coverage needed is confirming the relocated module still loads and exports every function callers rely on.

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

import { describe, expect, test } from "vitest";

import * as totalCollectorDiscounts from "../../lib/total-collector-discounts.js";

describe("total-collector-discounts module", () => {
  test("exports every helper the discount actions rely on", () => {
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
      "categoryFromSku",
      "itemCategoryFromSku",
    ];

    for (const exportName of expectedExports) {
      expect(typeof totalCollectorDiscounts[exportName]).toBe("function");
    }
  });

  test("zeroDiscountOperation returns a no-op JSON-patch replace", () => {
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
});
```

- [ ] **Step 4: Run the test**

```bash
cd totals-collector && npx vitest run test/lib/total-collector-discounts.test.js
```

Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add totals-collector/lib/total-collector-discounts.js totals-collector/test/lib/total-collector-discounts.test.js
git commit -m "totals-collector: copy shared discount helper module"
```

---

### Task 4: Relocate the 9 discount webhook actions

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
- Consumes: `webhookErrorResponse`, `webhookVerify` from `../../lib/webhooks.js`; `HTTP_OK` from `../../lib/http.js`; helpers from `../../lib/total-collector-discounts.js` (from Task 2 and Task 3).
- Produces: `export function main(params)` in each of the 9 files — consumed by `totals-collector/app.config.yaml` in Task 6.

No business logic changes: each file is copied verbatim, then only the two `lib/adobe-commerce.js` / `lib/http.js` / `lib/total-collector-discounts.js` import paths are rewritten to match the new, one-level-shallower directory layout (`totals-collector/actions/<name>/index.js` is 2 directories above `totals-collector/lib/`, vs. 3 above the original `lib/`), and the helper file `adobe-commerce.js` is renamed to `webhooks.js` in the import.

- [ ] **Step 1: Copy all 9 action files verbatim**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees
for name in tiered-quantity-discount tiered-category-discount category-based-discount \
            cheapest-item-discount expensive-item-discount cheapest-quantity-discount \
            step-price-discount multi-condition-discount tiered-total-spend-discount; do
  mkdir -p "totals-collector/actions/${name}"
  cp "actions/total-collector-discounts/${name}/index.js" "totals-collector/actions/${name}/index.js"
done
```

- [ ] **Step 2: Rewrite the shared-lib import paths in each copied file**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees/totals-collector
for name in tiered-quantity-discount tiered-category-discount category-based-discount \
            cheapest-item-discount expensive-item-discount cheapest-quantity-discount \
            step-price-discount multi-condition-discount tiered-total-spend-discount; do
  f="actions/${name}/index.js"
  sed -i '' \
    -e 's#"\.\./\.\./\.\./lib/adobe-commerce\.js"#"../../lib/webhooks.js"#' \
    -e 's#"\.\./\.\./\.\./lib/http\.js"#"../../lib/http.js"#' \
    -e 's#"\.\./\.\./\.\./lib/total-collector-discounts\.js"#"../../lib/total-collector-discounts.js"#' \
    "$f"
done
```

- [ ] **Step 3: Verify no file still references the old 3-levels-up path or the old filename**

```bash
grep -rn '\.\./\.\./\.\./lib\|adobe-commerce\.js' totals-collector/actions/
```

Expected: no output.

- [ ] **Step 4: Verify each file's only functional diff vs. the original is the import paths**

```bash
for name in tiered-quantity-discount tiered-category-discount category-based-discount \
            cheapest-item-discount expensive-item-discount cheapest-quantity-discount \
            step-price-discount multi-condition-discount tiered-total-spend-discount; do
  echo "--- $name ---"
  diff "../actions/total-collector-discounts/${name}/index.js" "actions/${name}/index.js"
done
```

Expected for every action: exactly 3 changed lines (or fewer, if an action doesn't import all three), each only differing in the module specifier path/filename — no other diff.

- [ ] **Step 5: Write a cross-action regression test for the rewired imports**

This does not re-test discount math (out of scope, unchanged) — it proves the relocated import wiring (`../../lib/webhooks.js`, `../../lib/http.js`, `../../lib/total-collector-discounts.js`) resolves correctly and that webhook-signature verification still gates every action.

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
    "%s rejects a request with a missing webhook signature",
    (_name, main) => {
      const result = main({
        __ow_headers: {},
        __ow_body: Buffer.from(JSON.stringify({})).toString("base64"),
        COMMERCE_WEBHOOKS_PUBLIC_KEY: "not-a-real-key",
      });

      expect(result.statusCode).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({ op: "exception" }),
      );
    },
  );
});
```

- [ ] **Step 6: Run the tests**

```bash
cd totals-collector && npx vitest run test/actions/total-collector-discounts.test.js
```

Expected: PASS — 18 tests (9 actions × 2 assertions each).

- [ ] **Step 7: Commit**

```bash
git add totals-collector/actions totals-collector/test/actions/total-collector-discounts.test.js
git commit -m "totals-collector: relocate the 9 discount webhook actions"
```

---

### Task 5: Relocate the Adobe tracking `info` action (do not change its content)

**Files:**
- Create: `totals-collector/actions/commerce-checkout-starter-kit-info/index.js`
- Test: `totals-collector/test/actions/commerce-checkout-starter-kit-info.test.js`

**Interfaces:**
- Consumes: `HTTP_OK` from `../../lib/http.js` (Task 2).
- Produces: `export function main(_params)` — consumed by `totals-collector/app.config.yaml` in Task 6 as the `info` action.

- [ ] **Step 1: Copy the file verbatim — no changes at all**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees
mkdir -p totals-collector/actions/commerce-checkout-starter-kit-info
cp actions/commerce-checkout-starter-kit-info/index.js \
   totals-collector/actions/commerce-checkout-starter-kit-info/index.js
```

- [ ] **Step 2: Verify it's byte-identical (its relative import depth to `lib/` is unchanged: 2 levels up in both the old and new locations)**

```bash
diff actions/commerce-checkout-starter-kit-info/index.js \
     totals-collector/actions/commerce-checkout-starter-kit-info/index.js
```

Expected: no output.

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
git commit -m "totals-collector: relocate the commerce-checkout-starter-kit-info tracking action (unchanged)"
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

```bash
cd totals-collector && npx --yes js-yaml@5 app.config.yaml | grep -c "^  "
```

Run this only as a sanity smell-test; the authoritative check is a manual read-through confirming: 10 actions total (`info` + 9 discount actions), each discount action's `function:` path matches a file created in Task 4, and `info`'s `function:` path matches the file created in Task 5.

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
- Consumes: `defineConfig` from `@adobe/aio-commerce-lib-app/config` (Task 1's `package.json` dependency).
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

### Task 8: Write `totals-collector/README.md`

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
operation. There is no Commerce-side install/registration step for this domain.

## Install, Build, Deploy, Association

This app follows the standard Adobe App Management flow. Refer to Adobe's documentation rather
than this README for the generic mechanics:

- [Install an App Builder application](https://developer.adobe.com/commerce/extensibility/app-management/install/)
- [Build and deploy an App Builder application](https://developer.adobe.com/commerce/extensibility/app-management/deploy/)
- [Associate an application with a Commerce instance](https://developer.adobe.com/commerce/extensibility/app-management/association/)
- [Configure an application](https://developer.adobe.com/commerce/extensibility/app-management/configure/)

`app.commerce.config.ts` in this directory is the source of truth for this app's identity
(`metadata`). It intentionally declares no `installation.customInstallationSteps` — there is
nothing to register on the Commerce side for these discount actions.

## Prerequisites

```bash
cd totals-collector
npm install
cp env.dist .env
```

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

## Subscribe the Discount Webhooks

After deploying (see [Build and deploy](https://developer.adobe.com/commerce/extensibility/app-management/deploy/)),
[create a webhook](https://developer.adobe.com/commerce/extensibility/webhooks/create-webhooks/)
for each discount rule you want active, pointing at the corresponding deployed action. Unlike the
tax/payment/shipping domains — which hook a single well-known Commerce out-of-process API — these
are general-purpose cart/quote total-collector webhooks, so **you choose which Commerce plugin
hook point each one subscribes to** based on the discount rule you're implementing (for example, a
`before`/`after` hook around cart totals collection).

Follow the same `webhooks.xml` pattern used elsewhere in this project (see the root
[checkout starter kit README's webhook example](../README.md)), substituting the `method`
attribute for your chosen Commerce hook point and the `url` attribute for the deployed action:

```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_AdobeCommerceWebhooks:etc/webhooks.xsd">
    <method name="<your-chosen-commerce-hook-point>" type="before">
        <hooks>
            <batch name="tiered_quantity_discount">
                <hook
                    name="tiered_quantity_discount"
                    url="https://<your_app_builder>.runtime.adobe.io/api/v1/web/totals-collector/tiered-quantity-discount"
                    method="POST" timeout="10000" softTimeout="2000"
                    priority="300" required="true" fallbackErrorMessage="Discount calculation failed. Please try again later."
                    ttl="0"
                />
            </batch>
        </hooks>
    </method>
</config>
```

For SaaS instances, register the equivalent webhook subscription in **System > Webhooks > Webhook
Subscriptions** instead of editing `webhooks.xml` directly.

Repeat for each of the 9 actions you want to enable:

| Action | Deployed path |
|---|---|
| `tiered-quantity-discount` | `totals-collector/tiered-quantity-discount` |
| `tiered-category-discount` | `totals-collector/tiered-category-discount` |
| `category-based-discount` | `totals-collector/category-based-discount` |
| `cheapest-item-discount` | `totals-collector/cheapest-item-discount` |
| `expensive-item-discount` | `totals-collector/expensive-item-discount` |
| `cheapest-quantity-discount` | `totals-collector/cheapest-quantity-discount` |
| `step-price-discount` | `totals-collector/step-price-discount` |
| `multi-condition-discount` | `totals-collector/multi-condition-discount` |
| `tiered-total-spend-discount` | `totals-collector/tiered-total-spend-discount` |

## Validation

1. Enable one discount webhook (e.g. `tiered-quantity-discount`) against a test Commerce instance.
2. Add items to a cart that satisfy that rule's condition (see the doc comment at the top of
   `actions/<action-name>/index.js` for the exact threshold and discount percentage).
3. Confirm the cart/quote total reflects the expected discount, and that the response includes a
   `discount` result operation rather than an `exception` op.
4. Confirm requests with a missing or invalid `x-adobe-commerce-webhook-signature` header are
   rejected (see `test/actions/total-collector-discounts.test.js` for the equivalent automated
   check).

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

### Task 9: Full-suite verification and final sanity checks

**Files:** none created; verification only.

- [ ] **Step 1: Run the full test suite**

```bash
cd totals-collector && npm test
```

Expected: PASS — all tests across `test/lib/webhooks.test.js`, `test/lib/total-collector-discounts.test.js`, `test/actions/total-collector-discounts.test.js`, `test/actions/commerce-checkout-starter-kit-info.test.js`, `test/app.commerce.config.test.js`.

- [ ] **Step 2: Run lint and typecheck**

```bash
cd totals-collector && npm run lint:check && npm run typecheck
```

Expected: both exit 0 with no errors.

- [ ] **Step 3: Confirm zero Commerce-client / OAuth dependency anywhere in the new app**

```bash
grep -rn "got\|oauth-1.0a\|@adobe/aio-sdk\|getAdobeCommerceClient\|getCommerceClient\|resolveImsAuthParams\|OAUTH_CLIENT_ID\|COMMERCE_BASE_URL" totals-collector --include="*.js" --include="*.ts" --include="*.yaml" --include="*.json" | grep -v node_modules
```

Expected: no output. This confirms the app never references the Commerce HTTP client, OAuth/IMS credentials, or the association-based `getCommerceClient` auth pattern flagged as out of scope for this domain.

- [ ] **Step 4: Confirm the app is self-contained (no imports reaching outside `totals-collector/`)**

```bash
grep -rn 'from "\.\./\.\./\.\./' totals-collector --include="*.js" --include="*.ts" | grep -v node_modules
```

Expected: no output — no relative import climbs out of `totals-collector/`.

- [ ] **Step 5: Confirm no other domain or root-level file was modified**

```bash
cd /Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/fees && git status --short | grep -v '^?? totals-collector/' | grep -v '^A  totals-collector/'
```

Expected: no output (or only the earlier spec-doc commit already made), confirming this plan's execution touches only `totals-collector/`.

- [ ] **Step 6: Final commit (if any of the above steps produced uncommitted fixes)**

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

- `shipping-method/`, `payment-method/`, `tax-integration/` — planned independently in sibling worktrees.
- Removing the root-level monolith (`actions/`, `lib/`, `scripts/`, `hooks/`, root `app.config.yaml`, root `package.json`, `test/`, `e2e/`, `commerce-backend-ui-1/`) — happens in the final "remove the monolith" PR after all four domains are merged to `main`.
- The association-based `getCommerceClient`/`getCommerceInstance` auth swap flagged as a risk in the design spec — not applicable to this domain since it never calls Commerce.
- Any change to discount calculation business logic inside the 9 actions.
