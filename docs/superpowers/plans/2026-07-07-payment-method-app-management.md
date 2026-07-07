# Payment Domain App Management Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the payment domain (`validate-payment`, `filter-payment`, `create-payment-methods.js`) out of the monolithic checkout starter kit into a fully self-contained, independently deployable App Management app at `payment-method/`, using `app.commerce.config.ts` as the source of truth and a `defineCustomInstallationStep` in place of the ad-hoc `npm run create-payment-methods` script.

**Architecture:** `payment-method/` is a top-level directory (sibling of `actions/`, `lib/`, `scripts/` — NOT nested under any shared `apps/` parent) with its own `package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, and `vitest.config.js`. It carries its own copies of the two webhook actions (behavior-preserving, but their response bodies are now built with `@adobe/aio-commerce-sdk/webhooks/responses`' typed builders instead of hand-rolled object literals), the `commerce-checkout-starter-kit/info` tracking action (untouched), and a small `lib/webhook.js` with just the hand-rolled webhook-signature check (`webhookVerify` — the one piece with no SDK equivalent). The legacy hand-rolled OAuth1/IMS Commerce client (`getAdobeCommerceClient` in the current root `lib/adobe-commerce.js`) is **not** copied into `payment-method/` at all: the rewritten install script uses the new SDK's `getCommerceClient`, and the two webhook actions never call Commerce today, so there is nothing in this app that needs the legacy client. The root monolith is left untouched by this plan (it is deleted later, in the final "remove monolith" PR, per the design spec).

**Tech Stack:** Node.js 24 (ESM, `"type": "module"`), Adobe I/O Runtime actions, `@adobe/aio-commerce-lib-app` (`defineConfig`, `defineCustomInstallationStep`, `getCommerceClient`), `@adobe/aio-commerce-lib-auth` (`resolveImsAuthParams`), `@adobe/aio-commerce-sdk` (`webhooks/responses`' `ok`/`successOperation`/`exceptionOperation`/`addOperation`; `core/responses`' `HTTP_OK`), `@adobe/aio-lib-telemetry`, Vitest 4, Biome 2 (via `ultracite`), `js-yaml`.

## Global Constraints

- Directory name is `payment-method/` at the repo root — not `apps/payment/`, not nested under any `apps/` parent. (Design spec, "Target repo layout".)
- `payment-method/` is fully self-contained: own `package.json`, `app.config.yaml`, `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`. No shared root-level tooling — do not add workspace references back to the repo root `package.json`. (Design spec, "Target repo layout".)
- Do not touch `shipping-method/`, `tax-integration/`, `totals-collector/`, or any root-level file outside what this plan explicitly creates. Those are being planned in parallel, in sibling worktrees.
- Do not change checkout business logic inside any action (discount calculation, tax calculation, payment/shipping validation). This is a structural/config migration only. (Design spec, "Non-goals".)
- Do not drive Adobe's `commerce-app-migrate` / `commerce-app-management` Claude Code plugins against this repo. Their schemas and docs are reference material only. (Design spec, "Non-goals".)
- The `commerce-checkout-starter-kit/info` action must be relocated/duplicated verbatim — do not modify its logic. (Design spec, "Every app additionally gets".)
- The runtime auth swap (`getCommerceClient`/`getCommerceInstance` replacing the legacy OAuth1/IMS client) for webhook actions is gated on `shipping-method/`'s validation spike succeeding. Never assume it succeeded. (Design spec, "Auth strategy for runtime (webhook) actions — flagged risk".)
- The `defineCustomInstallationStep` pattern for the install script (`create-payment-methods.js`) is **not** part of that risk — it's a documented-safe pattern per `@adobe/aio-commerce-lib-app`'s own `InstallationContext.params` typing contract. Apply it unconditionally.
- Pin `@adobe/aio-commerce-lib-app` to `1.8.0-beta-20260702145741` and `@adobe/aio-commerce-sdk` to `1.4.0-beta-20260702145741` in `payment-method/package.json` — the released versions of these packages don't yet include what this migration needs. (Design spec, "SDK packages (beta)".)
- `validate-payment`/`filter-payment`'s webhook response bodies are built with `@adobe/aio-commerce-sdk/webhooks/responses`' `successOperation`/`exceptionOperation`/`addOperation` (wrapped in `ok()`) — the hand-rolled `webhookSuccessResponse`/`webhookErrorResponse` are **not** carried forward into `payment-method/`. `webhookVerify` (the signature check) has no SDK equivalent and stays hand-rolled, unchanged. (Design spec, "SDK packages (beta)".)

---

## Context for the implementer

Everything below was verified by reading the actual source in this worktree (`/Users/obarcelonapa/dev/github/adobe/commerce-checkout-starter-kit-worktrees/payment/`) and the `@adobe/aio-commerce-lib-app` / `@adobe/aio-commerce-lib-api` source in `/Users/obarcelonapa/dev/github/adobe/aio-commerce-sdk/packages/`.

**Why the legacy Commerce client is not copied into `payment-method/`:** `actions/validate-payment/index.js` and `actions/filter-payment/index.js` only import `webhookVerify`, `webhookSuccessResponse`, `webhookErrorResponse` from `lib/adobe-commerce.js` — neither action ever calls `getAdobeCommerceClient` or makes a Commerce HTTP request. `scripts/create-payment-methods.js` is the only payment-domain code that touches the legacy client, and it's being rewritten to use the new SDK's `getCommerceClient` instead. So there is no code path in the payment domain that needs `lib/adobe-commerce.js`'s `getAdobeCommerceClient`, `lib/adobe-auth.js`, or `lib/params.js` — carrying them over would be dead code, which the design spec explicitly says to drop rather than migrate ("Dead scaffolding ... is removed, not migrated").

**Why the "auth swap" is a documentation-only step here, not a code change:** The design spec's flagged-risk section lists `validate-payment`/`filter-payment` as swap candidates, but as verified above, neither action calls Commerce today, and app.config.yaml gives them no `OAUTH_*`/`COMMERCE_CONSUMER_*` inputs to swap. There is nothing to swap in this PR. Task 9 below adds the decision record so that if/when someone adds a Commerce call to these actions (e.g. filling in the "Check if the payment information is valid with the payment gateway" placeholder in `validate-payment`), they check `shipping-method/`'s outcome first instead of guessing.

**Why `webhookSuccessResponse`/`webhookErrorResponse` are dropped, not just relocated:** The design spec's "SDK packages (beta)" section retires these two hand-rolled helpers in favor of `@adobe/aio-commerce-sdk/webhooks/responses`' typed operation builders. `webhookVerify` (the `x-adobe-commerce-webhook-signature` check) is unaffected — none of the three new SDK packages implement webhook signature verification, so it stays hand-rolled in `lib/webhook.js`, unchanged. See Task 3 and Task 4 below for the exact response-shape mapping.

**New SDK contracts referenced (all read directly from source, for exact signatures):**
- `defineConfig(config)` — `@adobe/aio-commerce-sdk/packages/aio-commerce-lib-app/source/config/lib/define.ts` — identity function for type inference only.
- `defineCustomInstallationStep(handler)` — `.../source/management/installation/custom-installation/define.ts` — accepts `(config, context) => result` or `{ install, uninstall }`.
- `ExecutionContext` (the `context` a step handler receives) — `.../source/management/installation/workflow/step.ts` — extends `InstallationContext` which guarantees `context.params.AIO_COMMERCE_AUTH_IMS_CLIENT_ID`, `AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS`, `AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID`, `AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL`, `AIO_COMMERCE_AUTH_IMS_ORG_ID`, `AIO_COMMERCE_AUTH_IMS_SCOPES`, plus `context.logger`.
- `getCommerceClient(auth, fetchOptions?)` — `.../source/access/commerce-instance.ts` — returns `Promise<AdobeCommerceHttpClient>`, a ky-based client (`.get/.post/.put/.delete/.patch(url, options)`, each returning a ky `Response`-like object you call `.json()` on). Throws on non-2xx responses (ky `HTTPError`), unlike the current `got`-based wrapper which returned `{ success, message }`.
- `AdobeCommerceHttpClient` base path already includes the API version prefix (`V1` by default) and the PaaS `rest/<store_view_code>/` segment — call `client.post("oope_payment_method/", { json: paymentMethod })`, **not** `client.post("V1/oope_payment_method/", ...)`.
- `successOperation()` / `exceptionOperation(message, exceptionClass?)` / `addOperation(path, value, instance?)` / `replaceOperation(path, value, instance?)` / `removeOperation(path)` — `@adobe/aio-commerce-sdk/webhooks/responses` (re-exports `@adobe/aio-commerce-lib-webhooks/responses`, source at `packages/aio-commerce-lib-webhooks/source/responses/operations/presets.ts`) — pure builders for the Commerce webhook operation shape: `successOperation()` → `{ op: "success" }`; `exceptionOperation(message)` → `{ op: "exception", message }`; `addOperation(path, value)` → `{ op: "add", path, value }`.
- `ok(operations)` — same module (`.../source/responses/presets.ts`) — accepts a single operation or an array of operations and returns `{ type: "success", statusCode: 200, body: operations }`. It shadows `@adobe/aio-commerce-sdk/core/responses`' generic `ok()` (which instead expects `ok({ body, headers })`) with a webhook-specific signature — do not import both `ok`s into the same file under the same name. The extra `type: "success"` discriminator field is additive: Adobe I/O Runtime web actions only read `statusCode`/`body`/`headers` off the object a `main` function returns, so this doesn't change what Commerce receives over the wire.
- `HTTP_OK` (and the other HTTP status constants) — `@adobe/aio-commerce-sdk/core/responses` (re-exports `@adobe/aio-commerce-lib-core/responses`, source at `packages/aio-commerce-lib-core/source/responses/presets.ts`) — same value (`200`) as the local `lib/http.js` constant it replaces. `lib/http.js` is dropped entirely in this plan (Task 3) since, once `webhookSuccessResponse`/`webhookErrorResponse` are gone, its only remaining consumers (`telemetry.js`'s `isWebhookSuccessful`, the `commerce-checkout-starter-kit-info` action) need nothing but this one constant.

**Wire-format note for `filter-payment` — verify during implementation:** the current code manually does `body: JSON.stringify(operations)` for its success response, while its error paths (via `webhookErrorResponse`) pass an object body un-stringified — an existing inconsistency in the pre-migration code. Task 4's rewrite uses `ok(operations)` for both paths uniformly, which sets `body: operations` as the actual array, not a pre-stringified string. This is the normalization the design spec's "SDK packages (beta)" section calls for, not a business-logic change — but since this plan can't exercise a live raw-http deployment, Task 11's verification pass includes an explicit step to confirm Commerce still parses the array-of-operations response correctly after this change before considering the migration done.

---

### Task 1: Scaffold `payment-method/` project files

**Files:**
- Create: `payment-method/package.json`
- Create: `payment-method/biome.jsonc`
- Create: `payment-method/vitest.config.js`
- Create: `payment-method/vitest.setup.js`
- Create: `payment-method/.gitignore`
- Create: `payment-method/env.dist`

**Interfaces:**
- Produces: an installable, lintable, testable npm project rooted at `payment-method/` that later tasks add source files into. No app code yet.

- [ ] **Step 1: Create `payment-method/package.json`**

```json
{
  "name": "checkout-payment-method",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@adobe/aio-commerce-lib-app": "1.8.0-beta-20260702145741",
    "@adobe/aio-commerce-lib-auth": "^0.1.0",
    "@adobe/aio-commerce-sdk": "1.4.0-beta-20260702145741",
    "@adobe/aio-lib-telemetry": "^1.1.0",
    "@adobe/aio-sdk": "^6",
    "js-yaml": "^5.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.0",
    "@vitest/coverage-v8": "^4.0.7",
    "nock": "^14.0.5",
    "ultracite": "^7.0.0",
    "vitest": "^4.0.7"
  },
  "scripts": {
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
  }
}
```

Notes for the implementer: `@adobe/aio-commerce-lib-app` and `@adobe/aio-commerce-sdk` are pinned to the exact beta versions from the design spec's "SDK packages (beta)" table (`1.8.0-beta-20260702145741` and `1.4.0-beta-20260702145741` respectively) — do not use caret ranges for these two, and do not substitute a different beta timestamp. `@adobe/aio-commerce-lib-auth` is not in that beta table, so verify its current published version on npm before finalizing — run `npm view @adobe/aio-commerce-lib-auth version` and pin to whatever is current — then `npm install` inside `payment-method/` to generate its own `package-lock.json`. Neither `@adobe/aio-commerce-lib-webhooks` nor `@adobe/aio-commerce-lib-core` need to be installed directly — they're consumed through `@adobe/aio-commerce-sdk`'s `webhooks/*` and `core/*` subpath exports. There is no root `husky`/`lint-staged` wiring here — the design spec marks that as "if needed", and this app doesn't need a pre-commit hook of its own while it still lives inside the monolith's repo (the existing root `.husky/` continues to run `npm run code:fix` at the repo root scope for whatever's staged, including files under `payment-method/`, until the final "remove monolith" PR).

- [ ] **Step 2: Create `payment-method/biome.jsonc`**

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
              {
                "type": false,
                "source": [":PACKAGE:", ":PACKAGE_WITH_PROTOCOL:"]
              },
              ":BLANK_LINE:",
              { "type": false, "source": [":ALIAS:"] },
              ":BLANK_LINE:",
              { "type": false, "source": [":PATH:"] },
              ":BLANK_LINE:",

              { "type": true, "source": [":BUN:", ":NODE:"] },
              {
                "type": true,
                "source": [":PACKAGE:", ":PACKAGE_WITH_PROTOCOL:"]
              },
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

This drops the `ultracite/biome/react` extension and the `commerce-backend-ui-1`-specific override from the root `biome.jsonc` — `payment-method/` has no React UI, so those don't apply.

- [ ] **Step 3: Create `payment-method/vitest.config.js`**

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
      include: ["actions/**/*.js", "lib/**/*.js", "scripts/**/*.js"],
      exclude: ["node_modules/", "dist/", "test/"],
    },
  },
});
```

- [ ] **Step 4: Create `payment-method/vitest.setup.js`**

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

Copied verbatim from the root `vitest.setup.js` — same mocking convention.

- [ ] **Step 5: Create `payment-method/.gitignore`**

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
.aws.tmp.creds.json
.wskdebug.props.tmp
```

Copied verbatim from the root `.gitignore` — same App Builder/Node toolchain artifacts to ignore.

- [ ] **Step 6: Create `payment-method/env.dist`**

```env
# Commerce HTTP client authentication configuration for the create-payment-methods
# custom installation step. Supplied automatically by the App Management install
# workflow at install time (see InstallationContext.params in
# @adobe/aio-commerce-lib-app) — you do not need to set these manually for a
# normal install.
#AIO_COMMERCE_AUTH_IMS_CLIENT_ID=
#AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS=[""]
#AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID=
#AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL=
#AIO_COMMERCE_AUTH_IMS_ORG_ID=
#AIO_COMMERCE_AUTH_IMS_SCOPES=[""]

# Required if webhooks are used and signature verification is enabled
COMMERCE_WEBHOOKS_PUBLIC_KEY=

# The payment method codes that this app implements, must be in sync with
# payment-methods.yaml
COMMERCE_PAYMENT_METHOD_CODES=[""]
```

Unlike the root `env.dist`, there is no `COMMERCE_BASE_URL` or `OAUTH_*`/`COMMERCE_CONSUMER_*` block here — the install step gets its Commerce base URL from `getCommerceInstance()` (association data) and its credentials from `context.params`, both supplied by the App Management framework, not from a local `.env`.

- [ ] **Step 7: Commit**

```bash
cd payment-method
npm install
cd ..
git add payment-method/package.json payment-method/package-lock.json payment-method/biome.jsonc payment-method/vitest.config.js payment-method/vitest.setup.js payment-method/.gitignore payment-method/env.dist
git commit -m "Scaffold payment-method app project files"
```

---

### Task 2: Relocate the `commerce-checkout-starter-kit/info` tracking action (do not change)

**Files:**
- Create: `payment-method/actions/commerce-checkout-starter-kit-info/index.js`

**Interfaces:**
- Produces: `main(_params)` — identical signature and body to the root action; registered in `payment-method/app.config.yaml` in Task 6.

- [ ] **Step 1: Create `payment-method/actions/commerce-checkout-starter-kit-info/index.js`**

Copy from `actions/commerce-checkout-starter-kit-info/index.js`, keeping the body byte-for-byte, only swapping the `HTTP_OK` import from the (now-dropped, see Task 3) local `lib/http.js` to `@adobe/aio-commerce-sdk/core/responses`, which exports the same constant (`HTTP_OK = 200`):

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

import { HTTP_OK } from "@adobe/aio-commerce-sdk/core/responses";

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

The design spec explicitly says "do not change" this action — the response behavior (`{ statusCode: 200 }`) is identical; only the source of the `HTTP_OK` constant changes, per the design spec's "SDK packages (beta)" section (`lib/http.js`'s status constants are a clean drop-in replacement by `@adobe/aio-commerce-sdk/core/responses`).

- [ ] **Step 2: Commit**

```bash
git add payment-method/actions/commerce-checkout-starter-kit-info/index.js
git commit -m "Relocate commerce-checkout-starter-kit/info tracking action into payment-method"
```

---

### Task 3: Split out `webhookVerify` into `payment-method/lib/webhook.js`

**Files:**
- Create: `payment-method/lib/webhook.js`
- Test: `payment-method/test/lib/webhook.test.js`

**Interfaces:**
- Produces: `webhookVerify(params)` from `lib/webhook.js`. `validate-payment` and `filter-payment` (Task 4) import it for the signature check; they get their response-building functions (`ok`, `successOperation`, `exceptionOperation`, `addOperation`) directly from `@adobe/aio-commerce-sdk/webhooks/responses` instead (no local module for those — see "Context for the implementer").
- Consumes: nothing new — `webhookVerify` extracted unchanged from the root `lib/adobe-commerce.js`.

There is no `payment-method/lib/http.js` in this plan: per the design spec's "SDK packages (beta)" section, `webhookSuccessResponse`/`webhookErrorResponse` (the only local consumers of the `HTTP_OK` constant inside a webhook-response object) are replaced by the SDK's `ok()`/`successOperation()`/`exceptionOperation()`, and the two remaining `HTTP_OK` consumers in this app (`telemetry.js`'s `isWebhookSuccessful`, the `commerce-checkout-starter-kit-info` action, both Task 4/Task 2) import it directly from `@adobe/aio-commerce-sdk/core/responses` instead.

- [ ] **Step 1: Create `payment-method/lib/webhook.js`**

Extracted from the signature-verification function in the root `lib/adobe-commerce.js` (the Commerce-HTTP-client parts of that file — `getAdobeCommerceClient`, `getCommerceHttpClient`, `oauth1aHeadersProvider` — are deliberately left out, see "Context for the implementer" above for why; and the response-building functions `webhookSuccessResponse`/`webhookErrorResponse` are deliberately left out too, replaced by the SDK per the design spec's "SDK packages (beta)" section):

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

- [ ] **Step 2: Write the migrated test file `payment-method/test/lib/webhook.test.js`**

This is the `webhookVerify` describe block from the root `test/lib/adobe-commerce.test.js`, moved and re-pointed at the new module. The `getAdobeCommerceClient` describe block from that same root file is **not** migrated — that function isn't part of `payment-method/` (see "Context for the implementer").

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

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd payment-method && npx vitest run test/lib/webhook.test.js`
Expected: `5 passed`

- [ ] **Step 4: Commit**

```bash
git add payment-method/lib/webhook.js payment-method/test/lib/webhook.test.js
git commit -m "Extract webhookVerify signature check into payment-method/lib"
```

---

### Task 4: Relocate `validate-payment` and `filter-payment` actions, plus their telemetry dependencies

**Files:**
- Create: `payment-method/actions/checkout-metrics.js`
- Create: `payment-method/actions/telemetry.js`
- Create: `payment-method/actions/validate-payment/index.js`
- Create: `payment-method/actions/filter-payment/index.js`

**Interfaces:**
- Consumes: `webhookVerify` from `../../lib/webhook.js` (Task 3); `ok`, `successOperation`, `exceptionOperation`, `addOperation` from `@adobe/aio-commerce-sdk/webhooks/responses`; `HTTP_OK` from `@adobe/aio-commerce-sdk/core/responses`.
- Produces: `main` (instrumented) exported from both action files, registered in `payment-method/app.config.yaml` in Task 6.

- [ ] **Step 1: Create `payment-method/actions/checkout-metrics.js`**

Copy from the root `actions/checkout-metrics.js`, keeping only the payment-related counters (`validatePaymentCounter`, `filterPaymentCounter`) — the shipping and tax counters in the root file belong to domains this plan doesn't touch:

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
 * Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for payment checkout actions using dimensions/attributes pattern.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics for payment-related actions. */
export const checkoutMetrics = defineMetrics((meter) => {
  return {
    validatePaymentCounter: meter.createCounter(
      "checkout.validate_payment.requests_total",
      {
        description: "Total number of validate payment requests.",
        valueType: ValueType.INT,
      },
    ),
    filterPaymentCounter: meter.createCounter(
      "checkout.filter_payment.requests_total",
      {
        description: "Total number of filter payment requests.",
        valueType: ValueType.INT,
      },
    ),
  };
});
```

Metric names (`checkout.validate_payment.requests_total`, `checkout.filter_payment.requests_total`) are unchanged from the root file, so existing dashboards/alerts keep working.

- [ ] **Step 2: Create `payment-method/actions/telemetry.js`**

Copy verbatim from the root `actions/telemetry.js`, changing the `serviceName` so telemetry from this app is attributable separately from the other three domains, and pointing the `HTTP_OK` import at `@adobe/aio-commerce-sdk/core/responses` (there is no local `lib/http.js` in this app — see Task 3):

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
 * @see https://github.com/adobe/aio-lib-telemetry
 */

import {
  defineTelemetryConfig,
  getAioRuntimeResource,
  getPresetInstrumentations,
} from "@adobe/aio-lib-telemetry";
import { HTTP_OK } from "@adobe/aio-commerce-sdk/core/responses";

/** The telemetry configuration to be used across all payment-method actions */
const telemetryConfig = defineTelemetryConfig((_params, _isDev) => {
  return {
    sdkConfig: {
      serviceName: "checkout-payment-method",
      instrumentations: getPresetInstrumentations("simple"),
      resource: getAioRuntimeResource(),
    },
  };
});

/**
 * Helper function to determine if a webhook response is successful.
 * Webhooks return HTTP_OK even for errors, so we check the body.op field.
 * @param {unknown} result - The result of the instrumented webhook action.
 * @returns {boolean} - True if the webhook response is successful, false otherwise.
 */
function isWebhookSuccessful(result) {
  if (result && typeof result === "object") {
    if ("statusCode" in result && result.statusCode === HTTP_OK) {
      if ("body" in result && typeof result.body === "object") {
        return result.body.op !== "exception";
      }
      return true;
    }
    return false;
  }
  return false;
}

export { isWebhookSuccessful, telemetryConfig };
```

Dropped `localCollectorConfig` (unused local-dev helper, commented out in the original too) to keep this file YAGNI-clean; re-add it if `payment-method/` later needs local OTEL collector export.

- [ ] **Step 3: Create `payment-method/actions/validate-payment/index.js`**

Copy from the root `actions/validate-payment/index.js`, keeping the control flow and messages byte-for-byte, but replacing every `webhookErrorResponse(message)` call with `ok(exceptionOperation(message))` and every `webhookSuccessResponse()` call with `ok(successOperation())` — both imported from `@adobe/aio-commerce-sdk/webhooks/responses` per the design spec's "SDK packages (beta)" section. `webhookVerify` still comes from the local `lib/webhook.js` (Task 3), unchanged:

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
  exceptionOperation,
  ok,
  successOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhook.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

/**
 * This action validates the payment information before the order is placed.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params input parameters
 * @returns {Promise<{type: string, statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function validatePayment(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug("Starting payment validation process");

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.validatePaymentCounter.add(1, {
        status: "error",
        error_code: "verification_failed",
      });
      return ok(
        exceptionOperation(`Failed to verify the webhook signature: ${error}`),
      );
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));

    const {
      payment_method: paymentMethod,
      payment_additional_information: paymentInfo,
    } = body;

    logger.info(
      `Payment method ${paymentMethod} with additional info.`,
      paymentInfo,
    );
    currentSpan.setAttribute("payment.method", paymentMethod);

    const supportedPaymentMethods = JSON.parse(
      params.COMMERCE_PAYMENT_METHOD_CODES,
    );
    if (!supportedPaymentMethods.includes(paymentMethod)) {
      // The validation of this payment method is not implemented by this action, ideally the webhook subscription
      // has to be constrained to the payment method code implemented by this app so this should never happen.
      logger.debug(`Payment method ${paymentMethod} not handled by this app.`);
      checkoutMetrics.validatePaymentCounter.add(1, {
        status: "success",
        result: "not_supported",
      });
      return ok(successOperation());
    }

    if (!paymentInfo) {
      // payment_additional_information is set using the graphql mutation setPaymentMethodOnCart
      // see https://developer.adobe.com/commerce/webapi/graphql/schema/cart/mutations/set-payment-method/#paymentmethodinput-attributes
      logger.warn(
        "payment_additional_information not found in the request",
        paymentMethod,
      );
      checkoutMetrics.validatePaymentCounter.add(1, {
        status: "error",
        error_code: "missing_info",
      });
      return ok(
        exceptionOperation(
          "payment_additional_information not found in the request",
        ),
      );
    }

    // Check if the payment information is valid with the payment gateway, this is vendor specific
    logger.debug(
      "Validated payment information successfully.",
      paymentMethod,
      paymentInfo,
    );

    checkoutMetrics.validatePaymentCounter.add(1, { status: "success" });

    return ok(successOperation());
  } catch (error) {
    logger.error("Error in payment validation:", error);
    checkoutMetrics.validatePaymentCounter.add(1, {
      status: "error",
      error_code: "exception",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(validatePayment, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
```

Response-shape mapping (verified against `packages/aio-commerce-lib-webhooks/source/responses/operations/presets.ts` and `.../responses/presets.ts` in `aio-commerce-sdk`): the original `webhookErrorResponse(message)` returned `{ statusCode: 200, body: { op: "exception", message } }`; `ok(exceptionOperation(message))` returns `{ type: "success", statusCode: 200, body: { op: "exception", message } }` — same `statusCode`/`body` Commerce reads, plus an additive `type` field that Adobe I/O Runtime ignores. Likewise `webhookSuccessResponse()` → `ok(successOperation())` maps `{ statusCode: 200, body: { op: "success" } }` to the same shape plus `type: "success"`.

- [ ] **Step 4: Create `payment-method/actions/filter-payment/index.js`**

Copy from the root `actions/filter-payment/index.js`, keeping the filtering logic byte-for-byte, but: (a) replace `webhookErrorResponse(message)` with `ok(exceptionOperation(message))`; (b) replace the local `createPaymentRemovalOperation(paymentCode)` helper with a direct call to the SDK's `addOperation("result", { code: paymentCode })` — it's the same shape (`{ op: "add", path: "result", value: { code: paymentCode } }`), so the local wrapper is no longer needed; (c) replace the final `{ statusCode: HTTP_OK, body: JSON.stringify(operations) }` with `ok(operations)`, which passes the array through as an actual array/object body instead of a pre-stringified string — see the "Wire-format note" in "Context for the implementer" above, and verify this in Task 11:

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
  addOperation,
  exceptionOperation,
  ok,
} from "@adobe/aio-commerce-sdk/webhooks/responses";

import { webhookVerify } from "../../lib/webhook.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

/**
 * This action returns the list of out-of-process payment method codes
 * that needs to be filtered out from the list of available payment methods.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params the input parameters
 * @returns {Promise<{type: string, statusCode: number, body: object}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function filterPayment(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug("Starting payment filter process");

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.filterPaymentCounter.add(1, {
        status: "error",
        error_code: "verification_failed",
      });
      return ok(
        exceptionOperation(`Failed to verify the webhook signature: ${error}`),
      );
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    const { payload = {} } = body;

    // if the "raw-http: false" then the request can be used directly from params
    // const { payload = {} } = params;

    logger.info("Received payload: ", payload);

    const operations = [];

    // The payment method can be filtered out based on some conditions.
    operations.push(addOperation("result", { code: "checkmo" }));

    // If the Commerce customer is logged in, the payload contains customer data otherwise the customer is set to null
    // In the next example, the payment method is filtered out based on Customer group id
    const { customer: Customer = {} } = payload;

    if (
      Customer !== null &&
      typeof Customer === "object" &&
      Object.hasOwn(Customer, "group_id") &&
      Customer.group_id === "1"
    ) {
      operations.push(addOperation("result", { code: "cashondelivery" }));
    }

    // The payment method can be filtered out based on product custom attribute values.
    // In the next example, payment method can is filtered out if any of `country_origin` attributes is equal to China
    const { items: cartItems = [] } = payload.cart;

    currentSpan.setAttribute("cart.items.count", cartItems.length);

    for (const cartItem of cartItems) {
      const { country_origin: country = "" } =
        cartItem?.product?.attributes ?? {};

      if (country.toLowerCase() === "china") {
        operations.push(addOperation("result", { code: "banktransfer" }));
      }
    }

    logger.info(`Filtered ${operations.length} payment methods`);

    checkoutMetrics.filterPaymentCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in payment filtering:", error);
    checkoutMetrics.filterPaymentCounter.add(1, {
      status: "error",
      error_code: "exception",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(filterPayment, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
```

Response-shape mapping: `createPaymentRemovalOperation(paymentCode)` returned `{ op: "add", path: "result", value: { code: paymentCode } }` — exactly `addOperation("result", { code: paymentCode })`'s output, so the helper is now a redundant wrapper and is dropped (DRY). The original success return was `{ statusCode: 200, body: JSON.stringify(operations) }` (a string); `ok(operations)` returns `{ type: "success", statusCode: 200, body: operations }` (the actual array). `telemetry.js`'s `isWebhookSuccessful(result)` still works unmodified against this: `typeof result.body === "object"` is `true` for an array too, and `result.body.op` is `undefined` on an array (no top-level `op` field), so `undefined !== "exception"` correctly reports success.

- [ ] **Step 5: Commit**

```bash
git add payment-method/actions/checkout-metrics.js payment-method/actions/telemetry.js payment-method/actions/validate-payment/index.js payment-method/actions/filter-payment/index.js
git commit -m "Relocate validate-payment and filter-payment actions into payment-method"
```

No new tests here: there were no pre-existing tests for `validate-payment`/`filter-payment` in the root repo (`test/scripts/create-payment-methods.test.js` and `test/lib/adobe-commerce.test.js` are the only payment-touching test files, both handled in Task 3 and Task 8) — nothing to move for these two action files. The checkout business logic itself is unchanged (design spec non-goal), but the response-*building* mechanism did change (hand-rolled objects → SDK builders); Task 11's verification pass includes a manual check of the actual emitted response shapes for both actions before considering this task done, in lieu of adding new telemetry-mocked test scaffolding that doesn't exist anywhere else in this app.

---

### Task 5: Move `payment-methods.yaml`

**Files:**
- Create: `payment-method/payment-methods.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: the fixture data read by the rewritten install step in Task 8.

- [ ] **Step 1: Create `payment-method/payment-methods.yaml`**

Copy verbatim from the root `payment-methods.yaml`:

```yaml
methods:
  - payment_method:
      code: 'method-1'
      title: 'Method one'
      active: true
      backend_integration_url: http://oope-payment-method.pay/event
      stores:
        - default
      order_status: processing
      countries:
        - US
      currencies:
        - USD
      custom_config:
        - key: can_refund
          value: true
```

- [ ] **Step 2: Commit**

```bash
git add payment-method/payment-methods.yaml
git commit -m "Move payment-methods.yaml into payment-method"
```

---

### Task 6: Write `payment-method/app.config.yaml`

**Files:**
- Create: `payment-method/app.config.yaml`

**Interfaces:**
- Consumes: `payment-method/actions/commerce-checkout-starter-kit-info/index.js` (Task 2), `payment-method/actions/validate-payment/index.js`, `payment-method/actions/filter-payment/index.js` (Task 4).
- Produces: the App Builder runtime manifest that `aio app build`/`aio app deploy` reads for this app.

- [ ] **Step 1: Create `payment-method/app.config.yaml`**

Copy only the `commerce-checkout-starter-kit/info`, `validate-payment`, and `filter-payment` action definitions from the root `app.config.yaml` — same `function` paths (now relative to `payment-method/`), same `inputs`, same `annotations`. Drop the `hooks.pre-app-build` reference (that hook runs `sync-oauth-credentials.js`, which only exists for the legacy `OAUTH_*` `.env` sync flow this app doesn't use) and drop the `events`/`extensions`/`productDependencies` blocks that belong to other domains:

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
          # https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/payment-use-cases/
          validate-payment:
            function: actions/validate-payment/index.js
            web: 'yes'
            runtime: nodejs:24
            inputs:
              LOG_LEVEL: debug
              COMMERCE_PAYMENT_METHOD_CODES: $COMMERCE_PAYMENT_METHOD_CODES
              COMMERCE_WEBHOOKS_PUBLIC_KEY: $COMMERCE_WEBHOOKS_PUBLIC_KEY
              # https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#setting-the-enable_telemetry-environment-variable
              ENABLE_TELEMETRY: true
            annotations:
              require-adobe-auth: false
              raw-http: true
              final: true
          filter-payment:
            function: actions/filter-payment/index.js
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

`inputs`/`annotations` are byte-for-byte identical to the root config for these three actions — no behavior change. `AIO_COMMERCE_AUTH_IMS_*` inputs are intentionally **not** added here — see Task 9's decision record for why.

- [ ] **Step 2: Commit**

```bash
git add payment-method/app.config.yaml
git commit -m "Add payment-method app.config.yaml runtime manifest"
```

---

### Task 7: Write `payment-method/app.commerce.config.ts`

**Files:**
- Create: `payment-method/app.commerce.config.ts`
- Create: `payment-method/tsconfig.json`

**Interfaces:**
- Consumes: `defineConfig`, `validateCommerceAppConfig` from `@adobe/aio-commerce-lib-app/config`.
- Produces: the `installation.customInstallationSteps` entry that Task 8's rewritten install script is wired into, and the `webhooks` entries that the App Management install workflow subscribes to Commerce automatically — no manual "Create Webhooks" step and no custom installation-step code for this (see Task 10's README rewrite).

- [ ] **Step 1: Create `payment-method/tsconfig.json`**

`app.commerce.config.ts` is the only TypeScript file in this app (everything else stays plain ESM `.js`, matching the rest of the repo) — a minimal `tsconfig.json` is enough for editor/type support:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["app.commerce.config.ts", "scripts/**/*.ts"]
}
```

- [ ] **Step 2: Create `payment-method/app.commerce.config.ts`**

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
    id: "checkout-payment-method",
    displayName: "Checkout Payment Method",
    version: "1.0.0",
    description:
      "Out-of-process payment method validation and filtering for the Adobe Commerce checkout starter kit.",
  },
  installation: {
    customInstallationSteps: [
      {
        script: "./scripts/create-payment-methods.js",
        name: "create-payment-methods",
        description:
          "Creates the out-of-process payment methods defined in payment-methods.yaml on the associated Commerce instance.",
      },
    ],
  },
  // Declarative webhook subscriptions: the App Management install workflow resolves
  // each `runtimeAction`'s deployed URL and subscribes it to Commerce automatically —
  // no manual "Create Webhooks" step, no custom installation-step code for this.
  // Both actions run with `require-adobe-auth: false` / `raw-http: true` in
  // app.config.yaml (Commerce calls them directly, verified via COMMERCE_WEBHOOKS_PUBLIC_KEY
  // signature checking, not IMS auth) — `requireAdobeAuth: false` here must match that, or
  // the SDK would attach `developer_console_oauth` credentials Commerce doesn't need and
  // this action doesn't check.
  //
  // webhook_method/webhook_type/batch_name/hook_name/timeout/soft_timeout/priority/required/
  // fallback_error_message values below are sourced directly from AdobeDocs/commerce-extensibility
  // (the checkout starter kit's payment-use-cases doc), not fabricated. `batch_name`/`hook_name`
  // are namespaced by the SDK at subscribe time (prefixed with the lowercased, underscore-safe
  // form of `metadata.id`, e.g. `checkout_payment_method_validate_payment`), so they don't need to
  // be globally unique here.
  webhooks: [
    {
      label: "Validate Payment (PaaS)",
      description:
        "Validates out-of-process payment information before an order is placed (PaaS).",
      category: "validation",
      env: ["paas"],
      runtimeAction: "commerce-checkout-starter-kit/validate-payment",
      requireAdobeAuth: false,
      webhook: {
        webhook_method: "observer.sales_order_place_before",
        webhook_type: "before",
        batch_name: "out_of_process_payment_methods",
        hook_name: "validate_payment",
        method: "POST",
        timeout: 20_000,
        soft_timeout: 0,
        priority: 100,
        required: true,
        fallback_error_message: "Error on validation",
      },
    },
    {
      label: "Validate Payment (SaaS)",
      description:
        "Validates out-of-process payment information before an order is placed (SaaS).",
      category: "validation",
      env: ["saas"],
      runtimeAction: "commerce-checkout-starter-kit/validate-payment",
      requireAdobeAuth: false,
      webhook: {
        webhook_method: "observer.sales_order_place_before",
        webhook_type: "before",
        batch_name: "validate_payment",
        hook_name: "oope_payment_methods_sales_order_place_before",
        method: "POST",
        timeout: 20_000,
        soft_timeout: 0,
        priority: 100,
        required: true,
        fallback_error_message: "Error on validation",
      },
    },
    {
      label: "Filter Payment Methods (PaaS)",
      description:
        "Filters out-of-process payment methods from checkout's available list (PaaS).",
      category: "append",
      env: ["paas"],
      runtimeAction: "commerce-checkout-starter-kit/filter-payment",
      requireAdobeAuth: false,
      webhook: {
        webhook_method:
          "plugin.magento.out_of_process_payment_methods.api.payment_method_filter.get_list",
        webhook_type: "after",
        batch_name: "out_of_process_payment_methods",
        hook_name: "payment_method_filter",
        method: "POST",
        timeout: 20_000,
        soft_timeout: 0,
      },
    },
    {
      label: "Filter Payment Methods (SaaS)",
      description:
        "Filters out-of-process payment methods from checkout's available list (SaaS).",
      category: "append",
      env: ["saas"],
      runtimeAction: "commerce-checkout-starter-kit/filter-payment",
      requireAdobeAuth: false,
      webhook: {
        webhook_method:
          "plugin.out_of_process_payment_methods.api.payment_method_filter.get_list",
        webhook_type: "after",
        batch_name: "out_of_process_payment_methods",
        hook_name: "payment_method_filter",
        method: "POST",
        timeout: 20_000,
        soft_timeout: 0,
      },
    },
  ],
});
```

`metadata.id` uses only alphanumerics and hyphens (validation constraint confirmed in `@adobe/aio-commerce-lib-app`'s `commerce-app-init` skill docs: "accepts alphanumeric characters and hyphens only — no dots, underscores, or spaces"). `version` is plain semver, no pre-release identifier, for the same reason.

`category: "validation"`/`"append"` are this plan's judgment call, not sourced from AdobeDocs (the coordinator's confirmed values covered `webhook_method`/`webhook_type`/`batch_name`/`hook_name`/`method`/`timeout`/`soft_timeout`/`priority`/`required`/`fallback_error_message` only). `validate-payment` only ever returns `successOperation()`/`exceptionOperation()` (accept-or-reject, no data mutation) → `"validation"`. `filter-payment` only ever returns `addOperation(...)` (adds entries to the result list, never replaces/removes) → `"append"`, per the three-way split in `@adobe/aio-commerce-lib-app`'s schema (`packages/aio-commerce-lib-app/source/config/schema/webhooks.ts`: `"validation" | "append" | "modification"`). `category` only affects the SDK's own conflict-detection warning (`validateWebhookConflicts`, which only inspects `"modification"` entries) — revisit if a future change makes either action call `replaceOperation`/`removeOperation`.

- [ ] **Step 3: Write the config-validation test `payment-method/test/app.commerce.config.test.js`**

There were zero tests for `app.commerce.config.ts` anywhere in this plan before this revision — this is the first one, added specifically to lock in the four `webhooks` entries above (2 per action, env-split) against the SDK's own schema rather than trusting hand-typed object literals:

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

import { validateCommerceAppConfig } from "@adobe/aio-commerce-lib-app/config";
import { describe, expect, test } from "vitest";

import config from "../app.commerce.config.ts";

const VALIDATE_PAYMENT_ACTION = "commerce-checkout-starter-kit/validate-payment";
const FILTER_PAYMENT_ACTION = "commerce-checkout-starter-kit/filter-payment";

function byEnv(entries, env) {
  return entries.find((entry) => entry.env?.[0] === env);
}

describe("app.commerce.config.ts webhooks", () => {
  test("validates against the SDK's CommerceAppConfigSchema", () => {
    expect(() => validateCommerceAppConfig(config)).not.toThrow();
  });

  test("declares exactly 4 webhook entries: 2 for validate-payment, 2 for filter-payment", () => {
    const validated = validateCommerceAppConfig(config);
    expect(validated.webhooks).toHaveLength(4);

    const validatePaymentEntries = validated.webhooks.filter(
      (entry) => entry.runtimeAction === VALIDATE_PAYMENT_ACTION,
    );
    const filterPaymentEntries = validated.webhooks.filter(
      (entry) => entry.runtimeAction === FILTER_PAYMENT_ACTION,
    );
    expect(validatePaymentEntries).toHaveLength(2);
    expect(filterPaymentEntries).toHaveLength(2);
  });

  test("validate-payment: webhook_method is fixed, but batch_name/hook_name differ by env", () => {
    const validated = validateCommerceAppConfig(config);
    const entries = validated.webhooks.filter(
      (entry) => entry.runtimeAction === VALIDATE_PAYMENT_ACTION,
    );
    const paas = byEnv(entries, "paas");
    const saas = byEnv(entries, "saas");

    expect(paas.webhook.webhook_method).toBe("observer.sales_order_place_before");
    expect(saas.webhook.webhook_method).toBe("observer.sales_order_place_before");

    expect(paas.webhook.batch_name).toBe("out_of_process_payment_methods");
    expect(paas.webhook.hook_name).toBe("validate_payment");
    expect(saas.webhook.batch_name).toBe("validate_payment");
    expect(saas.webhook.hook_name).toBe("oope_payment_methods_sales_order_place_before");

    for (const entry of [paas, saas]) {
      expect(entry.webhook.method).toBe("POST");
      expect(entry.webhook.timeout).toBe(20_000);
      expect(entry.webhook.soft_timeout).toBe(0);
      expect(entry.webhook.priority).toBe(100);
      expect(entry.webhook.required).toBe(true);
      expect(entry.webhook.fallback_error_message).toBe("Error on validation");
    }
  });

  test("filter-payment: webhook_method differs by env (magento. prefix), batch_name/hook_name stay the same", () => {
    const validated = validateCommerceAppConfig(config);
    const entries = validated.webhooks.filter(
      (entry) => entry.runtimeAction === FILTER_PAYMENT_ACTION,
    );
    const paas = byEnv(entries, "paas");
    const saas = byEnv(entries, "saas");

    expect(paas.webhook.webhook_method).toBe(
      "plugin.magento.out_of_process_payment_methods.api.payment_method_filter.get_list",
    );
    expect(saas.webhook.webhook_method).toBe(
      "plugin.out_of_process_payment_methods.api.payment_method_filter.get_list",
    );
    expect(paas.webhook.batch_name).toBe(saas.webhook.batch_name);
    expect(paas.webhook.hook_name).toBe(saas.webhook.hook_name);

    for (const entry of [paas, saas]) {
      expect(entry.webhook.webhook_type).toBe("after");
      expect(entry.webhook.method).toBe("POST");
      expect(entry.webhook.timeout).toBe(20_000);
      expect(entry.webhook.soft_timeout).toBe(0);
    }
  });

  test("every webhook entry sets requireAdobeAuth: false, matching the raw-http actions in app.config.yaml", () => {
    const validated = validateCommerceAppConfig(config);
    for (const entry of validated.webhooks) {
      expect(entry.requireAdobeAuth).toBe(false);
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd payment-method && npx vitest run test/app.commerce.config.test.js`
Expected: `5 passed`. If Vitest can't resolve the `.ts` import out of the box, add `"@vitejs/plugin-basic-ssl"`-free plain esbuild transform is already Vite's default for `.ts` files with no decorators/enums (which `app.commerce.config.ts` doesn't use) — no extra Vitest config should be needed, but if it fails, add `esbuild: { loader: "ts" }` under `test` in `payment-method/vitest.config.js` rather than converting the config file to `.js`.

- [ ] **Step 5: Commit**

```bash
git add payment-method/app.commerce.config.ts payment-method/tsconfig.json payment-method/test/app.commerce.config.test.js
git commit -m "Add payment-method app.commerce.config.ts with declarative webhook subscriptions"
```

---

### Task 8: Rewrite `create-payment-methods.js` as a `defineCustomInstallationStep`

**Files:**
- Create: `payment-method/scripts/create-payment-methods.js`
- Test: `payment-method/test/scripts/create-payment-methods.test.js`
- Create: `payment-method/test/scripts/payment-methods-test.yaml`

**Interfaces:**
- Consumes: `defineCustomInstallationStep` from `@adobe/aio-commerce-lib-app/management`; `getCommerceClient` from `@adobe/aio-commerce-lib-app`; `resolveImsAuthParams` from `@adobe/aio-commerce-lib-auth`. `context.params`, `context.logger` per `ExecutionContext` (see "Context for the implementer").
- Produces: a default export consumed by the App Management install workflow via the `script` path registered in Task 7's `app.commerce.config.ts`.

- [ ] **Step 1: Write the failing test `payment-method/test/scripts/create-payment-methods.test.js`**

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

import path from "node:path";
import { fileURLToPath } from "node:url";

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { beforeEach, describe, expect, test, vi } from "vitest";

import createPaymentMethodsStep from "../../scripts/create-payment-methods.js";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));

vi.mock("@adobe/aio-commerce-lib-auth", () => ({
  resolveImsAuthParams: vi.fn((params) => params),
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeContext() {
  return {
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    params: {
      AIO_COMMERCE_AUTH_IMS_CLIENT_ID: "test-client-id",
      AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: ["test-secret"],
      AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: "test-technical-account-id",
      AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: "test@example.com",
      AIO_COMMERCE_AUTH_IMS_ORG_ID: "test-org-id",
      AIO_COMMERCE_AUTH_IMS_SCOPES: ["scope1"],
    },
  };
}

describe("create-payment-methods install step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates all payment methods and returns their codes", async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({ success: true }) })
      .mockReturnValueOnce({ json: () => Promise.resolve({ success: true }) });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createPaymentMethodsStep.install(
      {},
      { ...makeContext(), configFilePath: path.join(__dirname, "payment-methods-test.yaml") },
    );

    expect(result.createdPaymentMethods).toEqual(["method-1", "method-2"]);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(
      1,
      "oope_payment_method/",
      expect.objectContaining({
        json: expect.objectContaining({
          payment_method: expect.objectContaining({ code: "method-1" }),
        }),
      }),
    );
  });

  test("continues past a failed payment method and only reports the successful ones", async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({ success: true }) })
      .mockReturnValueOnce({
        json: () => Promise.reject(new Error("Commerce API rejected the request")),
      });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createPaymentMethodsStep.install(
      {},
      { ...makeContext(), configFilePath: path.join(__dirname, "payment-methods-test.yaml") },
    );

    expect(result.createdPaymentMethods).toEqual(["method-1"]);
  });

  test("reports no created methods when the Commerce client can't be built", async () => {
    getCommerceClient.mockRejectedValue(new Error("not associated"));

    await expect(
      createPaymentMethodsStep.install(
        {},
        { ...makeContext(), configFilePath: path.join(__dirname, "payment-methods-test.yaml") },
      ),
    ).rejects.toThrow("not associated");
  });
});
```

- [ ] **Step 2: Create the fixture `payment-method/test/scripts/payment-methods-test.yaml`**

Copy verbatim from the root `test/scripts/payment-methods-test.yaml`:

```yaml
methods:
  - payment_method:
      code: 'method-1'
      title: 'Method one'
      active: true
      backend_integration_url: http://oope-payment-method.pay/event
      stores:
        - default
      order_status: complete
      countries:
        - ES
        - US
      currencies:
        - EUR
        - USD
      custom_config:
        - key: foo
          value: bar
  - payment_method:
      code: 'method-2'
      title: 'Method Two'
      active: true
      backend_integration_url: http://oope-payment-method.pay/event
      stores:
        - default
      order_status: complete
      countries:
        - ES
        - US
      currencies:
        - EUR
        - USD
      custom_config:
        - key: foo
          value: bar
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd payment-method && npx vitest run test/scripts/create-payment-methods.test.js`
Expected: FAIL — `Cannot find module '../../scripts/create-payment-methods.js'` (file doesn't exist yet).

- [ ] **Step 4: Write `payment-method/scripts/create-payment-methods.js`**

The `configFilePath` on `context` in the test above is a test-only seam (the real App Management workflow won't pass it) — the script defaults to the co-located `payment-methods.yaml` when absent, matching the original script's default of `payment-methods.yaml` relative to the repo it runs from:

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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";
import { load } from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "payment-methods.yaml");

/**
 * Creates all the payment methods defined in payment-methods.yaml on the
 * Commerce instance this app is associated with.
 *
 * @param {object} _config the validated app.commerce.config.ts config (unused by this step)
 * @param {object} context install execution context: `logger`, `params`, and (test-only) `configFilePath`
 * @returns {Promise<{createdPaymentMethods: string[]}>} the codes of the payment methods that were created
 */
async function install(_config, context) {
  const { logger, params, configFilePath = DEFAULT_CONFIG_PATH } = context;

  logger.info("Reading payment configuration file...");
  const fileContents = fs.readFileSync(configFilePath, "utf8");
  const data = load(fileContents);

  logger.info("Creating payment methods...");
  const client = await getCommerceClient(resolveImsAuthParams(params));

  const createdPaymentMethods = [];
  for (const paymentMethod of data.methods) {
    const paymentMethodCode = paymentMethod.payment_method.code;
    try {
      await client.post("oope_payment_method/", { json: paymentMethod }).json();
      logger.info(`Payment method ${paymentMethodCode} created`);
      createdPaymentMethods.push(paymentMethodCode);
    } catch (error) {
      logger.error(
        `Failed to create payment method ${paymentMethodCode}: ${error.message}`,
      );
    }
  }

  return { createdPaymentMethods };
}

export default defineCustomInstallationStep(install);
```

Note for the implementer: `defineCustomInstallationStep` returns whatever was passed to it — a plain function, in this case — so `createPaymentMethodsStep.install` in the test above only works if `defineCustomInstallationStep` is given the object form (`{ install }`) rather than a bare function, since a bare function has no `.install` property. Adjust the export to the object form to match the test:

```js
export default defineCustomInstallationStep({ install });
```

(Verify this against the currently-published `@adobe/aio-commerce-lib-app` version when implementing — `defineCustomInstallationStep`'s two accepted shapes are documented in its JSDoc `@example` blocks in `source/management/installation/custom-installation/define.ts`; the object form is what makes `.install` reachable for direct unit testing without going through the full install workflow runner.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd payment-method && npx vitest run test/scripts/create-payment-methods.test.js`
Expected: `3 passed`

- [ ] **Step 6: Commit**

```bash
git add payment-method/scripts/create-payment-methods.js payment-method/test/scripts/create-payment-methods.test.js payment-method/test/scripts/payment-methods-test.yaml
git commit -m "Rewrite create-payment-methods as a defineCustomInstallationStep"
```

---

### Task 9: Record the runtime auth-swap decision (conditional on shipping-method's spike)

**Files:**
- Create: `payment-method/docs/AUTH_DECISION.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: a decision record referenced from `payment-method/README.md` in Task 10.

This task exists because the design spec explicitly lists `validate-payment`/`filter-payment` as candidates for the association-based `getCommerceClient`/`getCommerceInstance` swap, gated on `shipping-method/`'s validation spike. As established in "Context for the implementer" above, neither action calls Commerce today, so there is no code to change in this PR — but the decision must be recorded so a future contributor doesn't have to re-derive it.

- [ ] **Step 1: Create `payment-method/docs/AUTH_DECISION.md`**

```markdown
# Runtime auth strategy for payment-method webhook actions

`validate-payment` and `filter-payment` do not call the Adobe Commerce REST API
today — they only verify the incoming webhook signature (`webhookVerify`) and
return a webhook operation response built with `@adobe/aio-commerce-sdk/webhooks/responses`
(`ok`, `successOperation`, `exceptionOperation`, `addOperation`). Neither
action instantiates a Commerce HTTP client, so there is currently nothing to
swap between the legacy hand-rolled OAuth1/IMS client and the SDK's
association-based `getCommerceClient`/`getCommerceInstance`.

The install-time script (`scripts/create-payment-methods.js`) already uses the
SDK's `getCommerceClient` — that pattern is documented-safe for custom
installation steps regardless of the decision below, and is not gated on
anything.

**If a future change adds a Commerce API call to `validate-payment` or
`filter-payment`** (for example, filling in the "Check if the payment
information is valid with the payment gateway" step in `validate-payment`),
check the outcome of `shipping-method/`'s validation spike before choosing an
auth approach for the runtime action:

- **If `getCommerceClient`/`getCommerceInstance` held up for `shipping-methods`
  under real webhook traffic** (a `raw-http: true` / `require-adobe-auth:
  false` action invoked directly by Commerce): use the same pattern here.
  Add `AIO_COMMERCE_AUTH_IMS_CLIENT_ID`, `AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS`,
  `AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID`,
  `AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL`, `AIO_COMMERCE_AUTH_IMS_ORG_ID`,
  `AIO_COMMERCE_AUTH_IMS_SCOPES` as action `inputs` in `app.config.yaml`, and
  call `getCommerceClient(resolveImsAuthParams(params))` /
  `getCommerceInstance()` from within the action handler.
- **If the spike failed** (documented in `shipping-method/`'s README/decision
  record): do not attempt the swap here either. Reintroduce a hand-rolled
  OAuth1/IMS Commerce client scoped to `payment-method/` — the original
  implementation is preserved in git history at the pre-migration root
  `lib/adobe-commerce.js` (function `getAdobeCommerceClient`) for reference —
  and wire it through `COMMERCE_CONSUMER_KEY`/`COMMERCE_ACCESS_TOKEN`-style
  `inputs`, exactly as the monolith did.

Do not guess. This file must be updated with a concrete "spike succeeded" /
"spike failed" note (with a link to `shipping-method/`'s decision record) the
first time either action gains a Commerce API call.
```

- [ ] **Step 2: Commit**

```bash
git add payment-method/docs/AUTH_DECISION.md
git commit -m "Record runtime auth-swap decision gate for payment-method webhook actions"
```

---

### Task 10: Write `payment-method/README.md`

**Files:**
- Create: `payment-method/README.md`

**Interfaces:**
- Consumes: `payment-method/docs/AUTH_DECISION.md` (Task 9, linked from here).

- [ ] **Step 1: Create `payment-method/README.md`**

```markdown
# Checkout Payment Method

Out-of-process payment method validation and filtering for the Adobe Commerce
checkout starter kit, packaged as an [Adobe App
Management](https://developer.adobe.com/commerce/extensibility/app-development/)
app.

For install, build, deploy, and Commerce-instance association, follow the
[App Management documentation](https://developer.adobe.com/commerce/extensibility/app-development/).
This README only covers what's specific to the payment domain.

## What this app does

- `validate-payment`: validates payment information before an order is
  placed. Subscribed as a Commerce webhook automatically at install time
  (see "Webhook subscriptions" below).
- `filter-payment`: filters out-of-process payment methods from the
  checkout's available list based on cart/customer conditions. Subscribed as
  a Commerce webhook automatically at install time (see "Webhook
  subscriptions" below).
- `commerce-checkout-starter-kit/info`: Adobe's usage-tracking action. Do not
  modify.
- A custom installation step (`scripts/create-payment-methods.js`, wired into
  `app.commerce.config.ts`) creates the payment methods defined in
  `payment-methods.yaml` on the associated Commerce instance during
  `aio app install`/App Management's install flow — this replaces the old
  `npm run create-payment-methods` script.

See the [payment use-cases
documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/payment-use-cases/)
for the business context behind these actions.

## Configure payment methods

Edit `payment-methods.yaml` with your payment method definitions, then run
the app's install flow (see the App Management docs linked above) — the
`create-payment-methods` custom installation step creates them on your
associated Commerce instance automatically.

After the methods are created, set `COMMERCE_PAYMENT_METHOD_CODES` for the
`validate-payment` action's configuration to the codes you defined, e.g.
`["your-payment-code"]` — this is what `validate-payment` checks incoming
webhook calls against.

## Webhook signature setup

1. In Adobe Commerce, go to **Stores > Settings > Configuration > Adobe
   Services > Webhooks**.
2. Enable **Digital Signature Configuration** and click **Regenerate Key
   Pair**.
3. Set the generated **Public Key** as the `COMMERCE_WEBHOOKS_PUBLIC_KEY`
   configuration value for this app, in [the expected
   format](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action):

   ```
   -----BEGIN PUBLIC KEY-----
   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   -----END PUBLIC KEY-----
   ```

## Webhook subscriptions

`validate-payment` and `filter-payment` are subscribed to Commerce
automatically at install time — there is no manual "Create Webhooks" step.
`app.commerce.config.ts` declares a `webhooks` array (four entries: one PaaS
and one SaaS variant per action) using `@adobe/aio-commerce-lib-app`'s
declarative webhook config. At install, the SDK resolves each action's
deployed Runtime URL and calls Commerce's webhook subscription API for you,
filtered to whichever environment (PaaS or SaaS) your associated Commerce
instance actually is — the other environment's entries are skipped.

If you ever need to inspect or remove a subscription directly (e.g. while
debugging), the subscribed `batch_name`/`hook_name` values are prefixed with
this app's ID (`checkout-payment-method` → `checkout_payment_method_`), e.g.
`checkout_payment_method_validate_payment`.

## Runtime auth strategy

`validate-payment` and `filter-payment` don't call the Commerce REST API
today, so there's no Commerce-client auth to configure for them. If that
changes, see [`docs/AUTH_DECISION.md`](docs/AUTH_DECISION.md) before picking
an approach — it's gated on the `shipping-method/` app's validation spike for
the SDK's association-based Commerce client.

## Validation

1. Deploy, install, and associate the app with your Commerce instance (see
   the App Management docs linked above) — this also subscribes the two
   webhooks per the "Webhook subscriptions" section above.
2. Complete the webhook signature setup above if you haven't already.
3. Place an order and confirm the configured payment method appears on the
   Checkout page and that `validate-payment`/`filter-payment` behave as
   expected (check the action logs via `aio app logs`).
```

- [ ] **Step 2: Commit**

```bash
git add payment-method/README.md
git commit -m "Add payment-method README"
```

---

### Task 11: Full verification pass

**Files:**
- None created — this task only runs checks across everything built in Tasks 1-10.

**Interfaces:**
- Consumes: the entire `payment-method/` tree.

- [ ] **Step 1: Run the full test suite**

Run: `cd payment-method && npm test`
Expected: all test files pass (`test/lib/webhook.test.js` — 5 tests, `test/scripts/create-payment-methods.test.js` — 3 tests, `test/app.commerce.config.test.js` — 5 tests).

- [ ] **Step 1a: Manually verify the new webhook response shapes**

Task 4 swapped `validate-payment`/`filter-payment`'s hand-rolled `webhookSuccessResponse`/`webhookErrorResponse` for the SDK's `ok`/`successOperation`/`exceptionOperation`/`addOperation` builders. There are no pre-existing tests for these two actions to catch a regression here, so drive them directly with a throwaway script before considering the migration done:

```bash
cd payment-method
node -e '
import("@adobe/aio-commerce-sdk/webhooks/responses").then(({ ok, successOperation, exceptionOperation, addOperation }) => {
  console.log(JSON.stringify(ok(successOperation())));
  console.log(JSON.stringify(ok(exceptionOperation("test error"))));
  console.log(JSON.stringify(ok([addOperation("result", { code: "checkmo" })])));
});
'
```

Expected output (three lines):
```
{"type":"success","statusCode":200,"body":{"op":"success"}}
{"type":"success","statusCode":200,"body":{"op":"exception","message":"test error"}}
{"type":"success","statusCode":200,"body":[{"op":"add","path":"result","value":{"code":"checkmo"}}]}
```

Confirm `statusCode` is `200` and `body` carries the same `op`/`message`/`path`/`value` fields Commerce's webhook contract expects (per https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses) in all three cases — the extra top-level `type` field is additive and Adobe I/O Runtime ignores it. Pay particular attention to the third line: it must be a JSON array under `body`, not a JSON-encoded string (this is the wire-format change flagged in "Context for the implementer" for `filter-payment`) — if this ever needs to become a pre-stringified string again, wrap it explicitly (`JSON.stringify(ok(operations))` is wrong, since the SDK's `ok()` already returns a plain object — the return value from `filter-payment`'s handler should be the object from `ok(operations)` as-is).

- [ ] **Step 2: Run lint/format checks**

Run: `cd payment-method && npm run code:check`
Expected: no errors. Fix any Biome findings with `npm run code:fix` and re-run `npm test` if any fix touches behavior (it shouldn't — formatting/import-order only).

- [ ] **Step 3: Confirm no accidental cross-references to the monolith**

Run: `grep -rn "\.\./\.\./actions\|\.\./\.\./lib\|\.\./\.\./scripts" payment-method/ --include=*.js` (or the Scout-tool equivalent `keyword_search` scoped to `payment-method/`) to confirm every import inside `payment-method/` resolves within `payment-method/` itself, not back into the root monolith's `actions/`/`lib/`/`scripts/`.
Expected: no matches.

- [ ] **Step 4: Confirm the root monolith is untouched**

Run: `git status --short actions/ lib/ scripts/ payment-methods.yaml app.config.yaml`
Expected: no output — this plan does not modify or delete any root-level file.

- [ ] **Step 5: Commit the updated design spec**

The design spec at `docs/superpowers/specs/2026-07-07-app-management-domain-split-design.md` was updated (folder renamed from `apps/payment/` to the top-level `payment-method/`, `apps/shipping/` to `shipping-method/`) before this plan was written, but was still uncommitted in this worktree. Commit it alongside this plan:

```bash
git add docs/superpowers/specs/2026-07-07-app-management-domain-split-design.md docs/superpowers/plans/2026-07-07-payment-method-app-management.md
git commit -m "Add payment-method implementation plan; sync updated domain-split design spec"
```

---

## Self-Review

**Spec coverage** — every payment-domain requirement from the task and the design spec maps to a task above:
- `payment-method/` self-contained (own package.json/app.config.yaml/app.commerce.config.ts/biome.jsonc/vitest.config.js) → Task 1, 6, 7.
- `validate-payment`/`filter-payment` moved → Task 4.
- `create-payment-methods.js` → `defineCustomInstallationStep` wired into `app.commerce.config.ts` → Task 7, 8.
- `payment-methods.yaml` moved → Task 5.
- `commerce-checkout-starter-kit/info` duplicated unchanged → Task 2.
- Webhook helpers split out → Task 3.
- Runtime auth swap gated on `shipping-method/` spike, decision point documented rather than assumed → Task 9.
- README following App Management flow, payment-specific guidance only → Task 10.
- Tests moved + new install-step tests → Task 3 (webhook tests), Task 8 (new install-step tests).
- Folder is `payment-method/` at repo root, not `apps/payment/` → applied throughout after the coordinator's correction.
- `@adobe/aio-commerce-sdk@1.4.0-beta-20260702145741` added as a dependency, `@adobe/aio-commerce-lib-app` pinned to `1.8.0-beta-20260702145741` → Task 1.
- `webhookSuccessResponse`/`webhookErrorResponse` dropped, replaced by `@adobe/aio-commerce-sdk/webhooks/responses`' `successOperation`/`exceptionOperation`/`addOperation` wrapped in `ok()`, with both actions' response shapes mapped explicitly → Task 3 (removal), Task 4 (`validate-payment`/`filter-payment` rewrite with shape-mapping notes).
- `webhookVerify` unaffected, still hand-rolled → Task 3.
- `@adobe/aio-commerce-sdk/core/*` adopted only where a clean drop-in: `HTTP_OK` from `core/responses` replaces the now-dropped local `lib/http.js` → Task 2, Task 3, Task 4. `actions/utils.js`'s helpers were not touched — neither `validate-payment` nor `filter-payment` ever imported them, so there's nothing to replace there.
- Declarative `webhooks` config (`defineConfig`'s top-level `webhooks` array) replaces the earlier "keep Create Webhooks manual" decision this plan made when it had only evaluated the lower-level `subscribeWebhook` API: 4 env-scoped entries (2 per action, PaaS/SaaS) declared in `app.commerce.config.ts`, validated by a new test against the SDK's own `validateCommerceAppConfig` → Task 7. README's "Create the webhooks" manual step is removed; only webhook *signature* setup (`COMMERCE_WEBHOOKS_PUBLIC_KEY`, unrelated to subscription registration) remains manual → Task 10. This also corrects this plan's own earlier claim that `validate-payment`'s webhook method was "payment-gateway-specific" and unsafe to automate — the coordinator's confirmed AdobeDocs values show it's actually a fixed Magento observer event (`observer.sales_order_place_before`), so that earlier reasoning was wrong and is retracted.

**Placeholder scan** — no "TBD"/"handle appropriately" left; every step shows complete file contents or an exact command with expected output.

**Type/name consistency** — `webhookVerify` and `HTTP_OK` names match between Task 3/Task 2 (definition/import source) and Task 4 (consumption). `ok`/`successOperation`/`exceptionOperation`/`addOperation` import names and call shapes are consistent between the "Context for the implementer" contract list and Task 4's `validate-payment`/`filter-payment` rewrites. `createPaymentMethodsStep.install(config, context)` signature matches between Task 8's test and implementation (unaffected by this revision — the install step never used the webhook-response helpers). `context.params`/`context.logger`/`context.configFilePath` naming is consistent between the test and the script.
