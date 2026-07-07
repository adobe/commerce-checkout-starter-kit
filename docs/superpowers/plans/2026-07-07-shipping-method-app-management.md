# Shipping Method App Management Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the shipping domain out of the `commerce-checkout-starter-kit` monolith into a new,
fully self-contained top-level app, `shipping-method/`, that uses `@adobe/aio-commerce-lib-app`'s
`app.commerce.config.ts` as the source of truth for app metadata and installation, replacing the
current ad-hoc `npm run create-shipping-carriers` onboarding step.

**Architecture:** `shipping-method/` is scaffolded with the real `@adobe/aio-commerce-lib-app init`
generator (not a hand-rolled copy of the old `actions/`+`app.config.yaml` layout). That generator
produces `src/commerce-extensibility-1/` — an extension point containing an auto-regenerated
`app-management` package (executes `installation.customInstallationSteps` from
`app.commerce.config.ts` during App Management install/association) plus a `shipping-method` and a
`commerce-checkout-starter-kit` user package we hand-maintain for our own runtime actions. The
`shipping-methods` webhook action's business logic (payload parsing, operations list, telemetry) is
carried over byte-for-byte; only its module boundaries change. The experimental piece — swapping
this webhook action's own outbound Commerce auth from OAuth1 to the SDK's
`getCommerceClient`/`getCommerceInstance` — is validated with a throwaway spike (Task 8) *before* any
production code depends on the outcome, per the design spec.

**Tech Stack:** Adobe App Builder (`aio` CLI, Adobe I/O Runtime), `@adobe/aio-commerce-lib-app`
(config + custom installation steps + association-based Commerce client),
`@adobe/aio-commerce-lib-auth` (`resolveImsAuthParams`), `@adobe/aio-lib-telemetry`, Vitest, Biome
(`ultracite` preset), `nock` for HTTP mocking, `js-yaml`, `got` + `oauth-1.0a` (legacy Commerce
client, dev-script only).

## Global Constraints

- Domain folder is a **top-level directory**, `shipping-method/`, directly under the repo root — NOT
  nested under a shared `apps/` parent. (Design spec, "Target repo layout".)
- `shipping-method/` is fully self-contained: its own `package.json`, `app.config.yaml`,
  `app.commerce.config.ts`, `biome.jsonc`, `vitest.config.js`. No shared root-level tooling — do not
  add npm workspaces, do not import from the root `lib/`/`actions/`. (Design spec, "Target repo
  layout".)
- This plan only **adds** `shipping-method/`. It does not modify or delete anything under the
  existing root `actions/`, `lib/`, `scripts/`, `test/`, `hooks/`, `app.config.yaml`, or root
  `package.json`. Root cleanup happens in the separate, later "remove monolith" PR (design spec, "PR
  sequence" item 5), after all four domain apps have merged.
- No change to the actual checkout business logic inside `shipping-methods` (payload parsing,
  operations list construction). This is a structural/config migration only. (Design spec,
  "Non-goals".)
- The `commerce-checkout-starter-kit/info` action must not change — only relocate/duplicate it
  byte-for-byte, including its package name (`commerce-checkout-starter-kit`), since that name is
  part of the tracked action identity. (Original task instructions; design spec "Extras".)
- `webhookVerify`, `webhookSuccessResponse`, `webhookErrorResponse` get their own copy in
  `shipping-method/`, split out of the Commerce-HTTP-client parts of `lib/adobe-commerce.js`. (Design
  spec, "Extras".)
- `scripts/create-shipping-carriers.js` becomes a `defineCustomInstallationStep` wired into
  `app.commerce.config.ts`'s `installation.customInstallationSteps`.
  `scripts/get-shipping-carriers.js` stays a plain helper script, not an installation step. (Design
  spec, "Per-domain content mapping".)
- The install-time swap to `getCommerceClient(resolveImsAuthParams(context.params))` inside the
  custom installation step is **not experimental** — safe per `InstallationContext.params`'s typed
  contract. (Design spec, "`app.commerce.config.ts` shape".)
- Swapping a **runtime webhook action's own outbound Commerce call** to
  `getCommerceClient`/`getCommerceInstance` is **explicitly unproven**. `shipping-method/` is the
  validation vehicle for this pattern; it must be proven with a spike (unit tests with mocked IMS
  token exchange, plus manual testing against a real Commerce instance if feasible) before any
  production code depends on it, with a documented fallback to the legacy OAuth1/IMS client if it
  doesn't hold up. (Design spec, "Auth strategy for runtime (webhook) actions".)
- README follows the App Management install/build/deploy/association flow, linking to Adobe App
  Management docs instead of re-documenting them; keep only what's shipping-specific (webhook
  signature setup, shipping-use-cases link, validation steps). (Design spec, "Docs".)
- Tests move into `shipping-method/test/`, mirroring the code they test.

## Key finding (read before starting Task 8)

`actions/shipping-methods/index.js` **does not call the Commerce REST API today**. It only calls
`webhookVerify`/`webhookErrorResponse` (signature verification against `COMMERCE_WEBHOOKS_PUBLIC_KEY`
— no OAuth/IMS credentials involved) and then returns a computed JSON‑Patch-style operations list. Its
`app.config.yaml` entry has no `OAUTH_*` inputs. There is therefore no existing outbound Commerce call
inside this action to literally "swap" from OAuth1 to `getCommerceClient`. Task 8's spike validates
the underlying **mechanism** (can `getCommerceClient`/`getCommerceInstance` — which read association
data via `@adobe/aio-commerce-lib-config`'s `getSystemConfigByKey`, see
`packages/aio-commerce-lib-app/source/management/association/association-repository.ts` in
`aio-commerce-sdk` — and can Adobe I/O Runtime's own token/namespace context, resolve correctly
inside a `raw-http: true` / `require-adobe-auth: false` action) using a throwaway diagnostic harness,
without adding a permanent, needless Commerce call to the shipped action. The GO/NO-GO result is
recorded for reuse by the payment/tax domain plans, where the analogous webhook actions may have a
real call to swap (out of scope here to verify).

---

### Task 1: Scaffold `shipping-method/` as a self-contained App Builder + App Management project

**Files:**
- Create: `shipping-method/package.json`
- Create: `shipping-method/biome.jsonc`
- Create: `shipping-method/app.commerce.config.ts`
- Create: `shipping-method/vitest.config.js`
- Create: `shipping-method/vitest.setup.js`
- Create: `shipping-method/env.dist`
- Generated (by `init`, verify not hand-edit): `shipping-method/app.config.yaml`,
  `shipping-method/src/commerce-extensibility-1/`, `shipping-method/src/commerce-configuration-1/`

**Interfaces:**
- Produces: a buildable App Builder project at `shipping-method/` that later tasks add actions,
  scripts, and config to.

- [ ] **Step 1: Create the directory and a minimal `package.json`**

```bash
mkdir -p shipping-method
```

```json
// shipping-method/package.json
{
  "name": "checkout-shipping-method",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "engines": {
    "node": "^24.0.0"
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
    "code:fix": "npx biome check --write .",
    "get-shipping-carriers": "node scripts/get-shipping-carriers.js"
  },
  "dependencies": {},
  "devDependencies": {
    "@biomejs/biome": "^2.4.0",
    "@vitest/coverage-v8": "^4.0.7",
    "nock": "^14.0.5",
    "ultracite": "^7.0.0",
    "vitest": "^4.0.7"
  }
}
```

- [ ] **Step 2: Write the minimal `app.commerce.config.ts` (metadata only — install steps come in Task 9)**

```ts
// shipping-method/app.commerce.config.ts
import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  metadata: {
    id: "checkout-shipping-method",
    displayName: "Checkout Shipping Method",
    description:
      "Out-of-process shipping methods and carrier setup for the Adobe Commerce checkout starter kit.",
    version: "1.0.0",
  },
});
```

- [ ] **Step 3: Run the App Management init generator**

```bash
cd shipping-method
npx @adobe/aio-commerce-lib-app init
```

Expected: installs `@adobe/aio-commerce-sdk` and `@adobe/aio-commerce-lib-app` into
`package.json`, finds the existing `app.commerce.config.ts` (skips interactive prompts since it's
already present), and generates:
- `src/commerce-extensibility-1/` — contains the auto-generated `app-management` package (do not
  hand-edit that package's block; the build hook regenerates it every time)
- `src/commerce-configuration-1/` — business-config extension point (unused by shipping, left empty)
- an updated root `app.config.yaml` wiring the generated extension points
- a `postinstall` hook in `package.json` (re-runs generation after future `npm install`)

If the command prompts interactively for `appName`/`domains` despite the existing config, re-run
with `npx @adobe/aio-commerce-lib-app init --appName checkout-shipping-method` and pick no
additional domains (shipping has no eventing/business-config/admin-ui needs).

- [ ] **Step 4: Add `biome.jsonc` (trimmed — no admin UI, no backend-ui overrides)**

```jsonc
// shipping-method/biome.jsonc
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

- [ ] **Step 5: Add `vitest.config.js` and `vitest.setup.js` scoped to this app's own tree**

```js
// shipping-method/vitest.config.js
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
      include: ["src/**/*.js", "lib/**/*.js", "scripts/**/*.js"],
      exclude: ["node_modules/", "dist/", "test/"],
    },
  },
});
```

```js
// shipping-method/vitest.setup.js
import { beforeEach, vi } from "vitest";

global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  if (global.fetch?.mockReset) {
    global.fetch.mockReset();
  }
});
```

- [ ] **Step 6: Add `env.dist` documenting required environment variables (filled in across later tasks)**

```bash
# shipping-method/env.dist
# Populated automatically after Developer Console association + `aio app build`
# (see README.md "Install" section). Used by the AIO_COMMERCE_AUTH_IMS_* powered
# install step and the legacy dev-only get-shipping-carriers helper.

# Required if webhooks are used and signature verification is enabled
COMMERCE_WEBHOOKS_PUBLIC_KEY=

# Legacy Commerce client credentials, used only by `npm run get-shipping-carriers`
# (a local dev helper, not part of the App Management install workflow).
# Option 1: IMS
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRETS=[""]
OAUTH_TECHNICAL_ACCOUNT_ID=
OAUTH_TECHNICAL_ACCOUNT_EMAIL=
OAUTH_SCOPES=[""]
OAUTH_IMS_ORG_ID=
# Option 2: Commerce integration
#COMMERCE_CONSUMER_KEY=
#COMMERCE_CONSUMER_SECRET=
#COMMERCE_ACCESS_TOKEN=
#COMMERCE_ACCESS_TOKEN_SECRET=
COMMERCE_BASE_URL=
```

- [ ] **Step 7: Verify the scaffold builds**

```bash
cd shipping-method
aio app build
```

Expected: build completes without a config-validation error. (Requires `aio login` and a selected
Developer Console workspace — see README Task 10 for the full first-time setup a developer runs.)

- [ ] **Step 8: Commit**

```bash
git add shipping-method/
git commit -m "shipping-method: scaffold self-contained App Management project"
```

---

### Task 2: Duplicate the webhook helpers (`webhookVerify`, `webhookSuccessResponse`, `webhookErrorResponse`)

**Files:**
- Create: `shipping-method/lib/http.js`
- Create: `shipping-method/lib/webhook.js`
- Test: `shipping-method/test/lib/webhook.test.js`

**Interfaces:**
- Produces: `webhookVerify(params)`, `webhookSuccessResponse()`, `webhookErrorResponse(message)` from
  `shipping-method/lib/webhook.js`; `HTTP_OK` from `shipping-method/lib/http.js`. Consumed by Task 6
  (`shipping-methods` action).

- [ ] **Step 1: Create `lib/http.js` (copied verbatim — shipping only needs `HTTP_OK`, keep the others for parity with other domains' copies)**

```js
// shipping-method/lib/http.js
export const HTTP_BAD_REQUEST = 400;
export const HTTP_INTERNAL_ERROR = 500;
export const HTTP_NOT_FOUND = 404;
export const HTTP_OK = 200;
export const HTTP_UNAUTHORIZED = 401;
```

- [ ] **Step 2: Write the failing test for `lib/webhook.js`**

```js
// shipping-method/test/lib/webhook.test.js
import crypto from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  webhookErrorResponse,
  webhookSuccessResponse,
  webhookVerify,
} from "../../lib/webhook.js";

describe("webhookVerify", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 512,
  });
  const body = JSON.stringify({ test: "data" });
  const signature = crypto
    .createSign("SHA256")
    .update(body)
    .sign(privateKey, "base64");

  test("returns success true for a valid signature", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({ success: true });
  });

  test("returns success false when the signature header is missing", () => {
    const params = {
      __ow_headers: {},
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({
      success: false,
      error: expect.any(String),
    });
  });

  test("returns success false when the body is missing", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({
      success: false,
      error: expect.any(String),
    });
  });

  test("returns success false when the public key is missing", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      __ow_body: body,
    };

    expect(webhookVerify(params)).toEqual({
      success: false,
      error: expect.any(String),
    });
  });

  test("returns success false for an invalid signature", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": "invalid" },
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({
      success: false,
      error: expect.any(String),
    });
  });
});

describe("webhookSuccessResponse", () => {
  test("returns HTTP 200 with a success op", () => {
    expect(webhookSuccessResponse()).toEqual({
      statusCode: 200,
      body: { op: "success" },
    });
  });
});

describe("webhookErrorResponse", () => {
  test("returns HTTP 200 with an exception op and the given message", () => {
    expect(webhookErrorResponse("boom")).toEqual({
      statusCode: 200,
      body: { op: "exception", message: "boom" },
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd shipping-method && npx vitest run test/lib/webhook.test.js
```

Expected: FAIL — `Cannot find module '../../lib/webhook.js'`.

- [ ] **Step 4: Implement `lib/webhook.js` (extracted from the monolith's `lib/adobe-commerce.js`, Commerce-HTTP-client parts stripped out)**

```js
// shipping-method/lib/webhook.js
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

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd shipping-method && npx vitest run test/lib/webhook.test.js
```

Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add shipping-method/lib/http.js shipping-method/lib/webhook.js shipping-method/test/lib/webhook.test.js
git commit -m "shipping-method: add standalone webhook verification helpers"
```

---

### Task 3: Duplicate the legacy Commerce client, trimmed to the shipping-carrier surface

This is the client `get-shipping-carriers.js` (Task 7, a local dev-only CLI script) keeps using —
`getCommerceClient`/`getCommerceInstance` require Adobe I/O Runtime's own namespace/state context
(see association-repository.ts's use of `@adobe/aio-commerce-lib-config`), which a bare `node
scripts/x.js` invocation outside a deployed action does not automatically have. The
install-time step (Task 9) and the runtime webhook action spike (Task 8) are unaffected by this
task — they use the new SDK client per the design spec.

**Files:**
- Create: `shipping-method/lib/params.js`
- Create: `shipping-method/lib/adobe-auth.js`
- Create: `shipping-method/lib/commerce-client.js`
- Test: `shipping-method/test/lib/commerce-client.test.js`

**Interfaces:**
- Produces: `getAdobeCommerceClient(params)` from `shipping-method/lib/commerce-client.js`, returning
  `{ createOopeShippingCarrier, getOopeShippingCarrier, getOopeShippingCarriers }`. Consumed by Task 7
  (`get-shipping-carriers.js`).

- [ ] **Step 1: Create `lib/params.js` (copied verbatim from the monolith's `lib/params.js`)**

```js
// shipping-method/lib/params.js
/**
 * Checks if the given value is non-empty.
 *
 * @param {string} name of the parameter. Required because of `aio app dev` compatibility: inputs mapped to undefined env vars come as $<input_name> in dev mode, but as '' in prod mode.
 * @param {string} value of the parameter.
 * @returns {boolean} returns true if the value is non-empty, false otherwise.
 */
export function nonEmpty(name, value) {
  const v = value?.trim();
  return v && v !== `$${name}`;
}

/**
 * Checks if all required parameters are non-empty.
 * @param {object} params action input parameters.
 * @param {string[]} required list of required parameter names.
 * @returns {boolean} returns true if all required parameters are non-empty, false otherwise.
 */
export function allNonEmpty(params, required) {
  return required.every((name) => nonEmpty(name, params[name]));
}
```

- [ ] **Step 2: Create `lib/adobe-auth.js` (copied verbatim from the monolith's `lib/adobe-auth.js`)**

```js
// shipping-method/lib/adobe-auth.js
import aioIms from "@adobe/aio-lib-ims";

import { allNonEmpty } from "./params.js";

const { context, getToken } = aioIms;

/**
 * Generate access token to connect with Adobe services based on the given parameters.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<string>} returns the access token
 * @see https://developer.adobe.com/runtime/docs/guides/using/security_general/#secrets
 */
export async function getAdobeAccessToken(params) {
  const config = {
    client_id: params.OAUTH_CLIENT_ID,
    client_secrets: JSON.parse(params.OAUTH_CLIENT_SECRETS),
    technical_account_id: params.OAUTH_TECHNICAL_ACCOUNT_ID,
    technical_account_email: params.OAUTH_TECHNICAL_ACCOUNT_EMAIL,
    ims_org_id: params.OAUTH_IMS_ORG_ID,
    scopes: JSON.parse(params.OAUTH_SCOPES),
    env: params.AIO_CLI_ENV ?? "prod",
  };
  await context.set("shipping-method-creds", config);
  return getToken("shipping-method-creds", {});
}

/**
 * Generates the credentials for the Adobe services based on the given parameters.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<{apiKey: string, imsOrgId: string, accessToken: string}>} the generated credentials
 */
export async function resolveCredentials(params) {
  return {
    accessToken: await getAdobeAccessToken(params),
    imsOrgId: params.OAUTH_IMS_ORG_ID,
    apiKey: params.OAUTH_CLIENT_ID,
  };
}

/**
 * Resolve the authentication options based on the provided parameters.
 * Note that Commerce integration options is preferred over IMS authentication options.
 * @param {object} params action input parameters.
 * @returns {Promise<{imsOptions: object}|{integrationOptions: object}>} returns the resolved authentication options
 * @throws {Error} if neither Commerce integration options nor IMS options are provided as params
 */
export async function resolveAuthOptions(params) {
  if (
    allNonEmpty(params, [
      "COMMERCE_CONSUMER_KEY",
      "COMMERCE_CONSUMER_SECRET",
      "COMMERCE_ACCESS_TOKEN",
      "COMMERCE_ACCESS_TOKEN_SECRET",
    ])
  ) {
    return {
      integrationOptions: {
        consumerKey: params.COMMERCE_CONSUMER_KEY,
        consumerSecret: params.COMMERCE_CONSUMER_SECRET,
        accessToken: params.COMMERCE_ACCESS_TOKEN,
        accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET,
      },
    };
  }

  if (
    allNonEmpty(params, [
      "OAUTH_CLIENT_ID",
      "OAUTH_CLIENT_SECRETS",
      "OAUTH_TECHNICAL_ACCOUNT_ID",
      "OAUTH_TECHNICAL_ACCOUNT_EMAIL",
      "OAUTH_IMS_ORG_ID",
      "OAUTH_SCOPES",
    ])
  ) {
    return { imsOptions: await resolveCredentials(params) };
  }

  throw new Error(
    "Can't resolve authentication options for the given params. " +
      "Please provide either IMS options (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRETS, OAUTH_TECHNICAL_ACCOUNT_ID, OAUTH_TECHNICAL_ACCOUNT_EMAIL, OAUTH_IMS_ORG_ID, OAUTH_SCOPES) " +
      "or Commerce integration options (COMMERCE_CONSUMER_KEY, COMMERCE_CONSUMER_SECRET, COMMERCE_ACCESS_TOKEN, COMMERCE_ACCESS_TOKEN_SECRET). ",
  );
}
```

- [ ] **Step 3: Write the failing test for `lib/commerce-client.js`**

```js
// shipping-method/test/lib/commerce-client.test.js
import nock from "nock";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getAdobeCommerceClient } from "../../lib/commerce-client.js";

vi.mock("@adobe/aio-lib-ims", async () => {
  const actual = await vi.importActual("@adobe/aio-lib-ims");
  const getToken = vi.fn();
  return {
    default: { context: actual.context, getToken },
    context: actual.context,
    getToken,
  };
});

const { getToken: mockGetToken } = await import("@adobe/aio-lib-ims");

describe("getAdobeCommerceClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sharedParams = {
    COMMERCE_BASE_URL: "http://mycommerce.com",
    LOG_LEVEL: "debug",
  };

  test("creates a shipping carrier with IMS auth", async () => {
    const params = {
      ...sharedParams,
      OAUTH_CLIENT_ID: "test-client-id",
      OAUTH_CLIENT_SECRETS: JSON.stringify(["supersecret"]),
      OAUTH_TECHNICAL_ACCOUNT_ID: "test-technical-account-id",
      OAUTH_TECHNICAL_ACCOUNT_EMAIL: "test-email@example.com",
      OAUTH_IMS_ORG_ID: "test-org-id",
      OAUTH_SCOPES: JSON.stringify(["scope1", "scope2"]),
    };
    mockGetToken.mockResolvedValue("supersecrettoken");
    const scope = nock(params.COMMERCE_BASE_URL)
      .post("/V1/oope_shipping_carrier")
      .matchHeader("Authorization", "Bearer supersecrettoken")
      .reply(200, { success: true });

    const client = await getAdobeCommerceClient(params);
    const { success } = await client.createOopeShippingCarrier({
      carrier: { code: "DPS" },
    });

    expect(success).toBeTruthy();
    scope.done();
  });

  test("gets shipping carriers with Commerce integration auth", async () => {
    const params = {
      ...sharedParams,
      COMMERCE_CONSUMER_KEY: "test-consumer-key",
      COMMERCE_CONSUMER_SECRET: "test-consumer-secret",
      COMMERCE_ACCESS_TOKEN: "test-access-token",
      COMMERCE_ACCESS_TOKEN_SECRET: "test-access-token-secret",
    };
    const scope = nock(params.COMMERCE_BASE_URL)
      .get("/V1/oope_shipping_carrier/")
      .reply(200, [{ code: "DPS" }]);

    const client = await getAdobeCommerceClient(params);
    const { success, message } = await client.getOopeShippingCarriers();

    expect(success).toBeTruthy();
    expect(message).toEqual([{ code: "DPS" }]);
    scope.done();
  });

  test("throws when no auth method is configured", async () => {
    await expect(getAdobeCommerceClient(sharedParams)).rejects.toThrow(
      "Can't resolve authentication options for the given params.",
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd shipping-method && npx vitest run test/lib/commerce-client.test.js
```

Expected: FAIL — `Cannot find module '../../lib/commerce-client.js'`.

- [ ] **Step 5: Implement `lib/commerce-client.js` (trimmed to the shipping-carrier endpoints only)**

```js
// shipping-method/lib/commerce-client.js
import crypto from "node:crypto";

import { Core } from "@adobe/aio-sdk";
import got from "got";
import Oauth1a from "oauth-1.0a";

import { resolveAuthOptions } from "./adobe-auth.js";
import { HTTP_INTERNAL_ERROR } from "./http.js";

/**
 * Provides an instance of the Commerce HTTP client
 *
 * @param {string} commerceUrl Base URL of the Commerce API
 * @param {object} options Configuration options for the client
 * @param {object} [options.integrationOptions] Integration options for OAuth1.0a
 * @param {object} [options.imsOptions] IMS options for bearer token authentication
 * @param {object} options.logger Logger instance for logging requests
 * @returns {Promise<object>} Configured Got instance for making HTTP requests
 */
function getCommerceHttpClient(
  commerceUrl,
  { integrationOptions, imsOptions, logger },
) {
  if (!commerceUrl) {
    throw new Error("Commerce URL must be provided");
  }

  const commerceGot = got.extend({
    http2: true,
    responseType: "json",
    prefixUrl: commerceUrl,
    headers: {
      "Content-Type": "application/json",
    },
    hooks: {
      beforeRequest: [
        (options) => logger.debug(`Request [${options.method}] ${options.url}`),
      ],
      beforeError: [
        (error) => {
          const { response } = error;
          if (response?.body) {
            error.responseBody = response.body;
          }
          return error;
        },
      ],
    },
  });

  if (integrationOptions) {
    logger.debug("Using Commerce client with integration options");
    const oauth1aHeaders = oauth1aHeadersProvider(integrationOptions);

    return commerceGot.extend({
      handlers: [
        (options, next) => {
          options.headers = {
            ...options.headers,
            ...oauth1aHeaders(options.url.toString(), options.method),
          };
          return next(options);
        },
      ],
    });
  }

  logger.debug("Using Commerce client with IMS options");
  return commerceGot.extend({
    headers: {
      "x-ims-org-id": imsOptions.imsOrgId,
      "x-api-key": imsOptions.apiKey,
      Authorization: `Bearer ${imsOptions.accessToken}`,
    },
  });
}

/**
 * Generates OAuth1.0a headers for the given integration options
 *
 * @param {object} integrationOptions Options for OAuth1.0a
 * @returns {Function} Function that returns OAuth1.0a headers for a given URL and method
 */
function oauth1aHeadersProvider(integrationOptions) {
  const oauth = Oauth1a({
    consumer: {
      key: integrationOptions.consumerKey,
      secret: integrationOptions.consumerSecret,
    },
    signature_method: "HMAC-SHA256",
    hash_function: (baseString, key) =>
      crypto.createHmac("sha256", key).update(baseString).digest("base64"),
  });

  const oauthToken = {
    key: integrationOptions.accessToken,
    secret: integrationOptions.accessTokenSecret,
  };

  return (url, method) =>
    oauth.toHeader(oauth.authorize({ url, method }, oauthToken));
}

/**
 * Initializes the Commerce client according to the given params. Legacy dev-only client, used by
 * `scripts/get-shipping-carriers.js`. Not used by the App Management install step (that uses
 * `getCommerceClient` from `@adobe/aio-commerce-lib-app`, see `scripts/create-shipping-carriers.js`).
 *
 * @param {object} params to initialize the client
 * @returns {Promise<object>} the available api calls
 */
export async function getAdobeCommerceClient(params) {
  const logger = Core.Logger("shipping-commerce-client", {
    level: params.LOG_LEVEL ?? "info",
  });
  const options = {
    logger,
    ...(await resolveAuthOptions(params)),
  };

  const commerceGot = await getCommerceHttpClient(
    params.COMMERCE_BASE_URL ?? process.env.COMMERCE_BASE_URL,
    options,
  );

  const wrapper = async (callable) => {
    try {
      const message = await callable();
      return { success: true, message };
    } catch (e) {
      if (e.code === "ERR_GOT_REQUEST_ERROR") {
        logger.error("Error while calling Commerce API", e);
        return {
          success: false,
          statusCode: HTTP_INTERNAL_ERROR,
          message: `Unexpected error, check logs. Original error "${e.message}"`,
        };
      }
      return {
        success: false,
        statusCode: e.response?.statusCode || HTTP_INTERNAL_ERROR,
        message: e.message,
        body: e.responseBody,
      };
    }
  };

  return {
    // Out-of-process Shipping API: https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-reference/
    createOopeShippingCarrier: async (shippingCarrier) =>
      wrapper(() =>
        commerceGot("V1/oope_shipping_carrier", {
          method: "POST",
          json: shippingCarrier,
        }).json(),
      ),
    getOopeShippingCarrier: async (shippingCarrierCode) =>
      wrapper(() =>
        commerceGot(`V1/oope_shipping_carrier/${shippingCarrierCode}`, {
          method: "GET",
        }).json(),
      ),
    getOopeShippingCarriers: async () =>
      wrapper(() =>
        commerceGot("V1/oope_shipping_carrier/", {
          method: "GET",
        }).json(),
      ),
  };
}
```

- [ ] **Step 6: Add `got` and `oauth-1.0a` dependencies**

```bash
cd shipping-method
npm pkg set dependencies.got="^15.0.0" dependencies.oauth-1.0a="^2.2.6" dependencies["@adobe/aio-lib-ims"]="^8.0.0" dependencies["@adobe/aio-sdk"]="^6"
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd shipping-method && npx vitest run test/lib/commerce-client.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add shipping-method/lib/params.js shipping-method/lib/adobe-auth.js shipping-method/lib/commerce-client.js shipping-method/test/lib/commerce-client.test.js shipping-method/package.json
git commit -m "shipping-method: add legacy Commerce client for dev-only scripts"
```

---

### Task 4: Relocate `shipping-carriers.yaml` and the telemetry helpers

**Files:**
- Create: `shipping-method/shipping-carriers.yaml`
- Create: `shipping-method/src/commerce-extensibility-1/actions/checkout-metrics.js`
- Create: `shipping-method/src/commerce-extensibility-1/actions/telemetry.js`

**Interfaces:**
- Produces: `checkoutMetrics.shippingMethodsCounter` and `{ isWebhookSuccessful, telemetryConfig }`,
  consumed by Task 6 (`shipping-methods` action).

- [ ] **Step 1: Copy `shipping-carriers.yaml` verbatim**

```yaml
# shipping-method/shipping-carriers.yaml
shipping_carriers:
  - carrier:
      code: 'DPS'
      title: 'Demo Postal Service'
      stores:
        - default
      countries:
        - US
        - CA
      sort_order: 10
      active: true
      tracking_available: true
      shipping_labels_available: true
  - carrier:
      code: 'Fedex'
      title: 'Fedex Service'
      stores:
        - default
      countries:
        - US
      sort_order: 50
      active: true
      tracking_available: false
      shipping_labels_available: true
```

- [ ] **Step 2: Create `checkout-metrics.js`, trimmed to the shipping counter only**

```js
// shipping-method/src/commerce-extensibility-1/actions/checkout-metrics.js
/**
 * Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for the shipping-method app's actions.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics for shipping-related actions. */
export const checkoutMetrics = defineMetrics((meter) => {
  return {
    shippingMethodsCounter: meter.createCounter(
      "checkout.shipping_methods.requests_total",
      {
        description: "Total number of shipping methods requests.",
        valueType: ValueType.INT,
      },
    ),
  };
});
```

- [ ] **Step 3: Create `telemetry.js` (import path adjusted for the new location)**

```js
// shipping-method/src/commerce-extensibility-1/actions/telemetry.js
/**
 * Telemetry Configuration for Adobe App Builder Actions
 *
 * This file configures OpenTelemetry instrumentation using @adobe/aio-lib-telemetry.
 * @see https://github.com/adobe/aio-lib-telemetry
 */

import {
  defineTelemetryConfig,
  getAioRuntimeResource,
  getPresetInstrumentations,
} from "@adobe/aio-lib-telemetry";

import { HTTP_OK } from "../../../lib/http.js";

/** The telemetry configuration to be used across all shipping-method actions */
export const telemetryConfig = defineTelemetryConfig((_params, _isDev) => {
  return {
    sdkConfig: {
      serviceName: "checkout-shipping-method",
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
export function isWebhookSuccessful(result) {
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
```

- [ ] **Step 4: Add the `@adobe/aio-lib-telemetry` dependency**

```bash
cd shipping-method && npm pkg set dependencies["@adobe/aio-lib-telemetry"]="^1.1.0"
```

- [ ] **Step 5: Commit**

```bash
git add shipping-method/shipping-carriers.yaml shipping-method/src/commerce-extensibility-1/actions/checkout-metrics.js shipping-method/src/commerce-extensibility-1/actions/telemetry.js shipping-method/package.json
git commit -m "shipping-method: relocate shipping-carriers.yaml and telemetry helpers"
```

---

### Task 5: Duplicate the `commerce-checkout-starter-kit/info` tracking action (do not change its behavior)

**Files:**
- Create: `shipping-method/src/commerce-extensibility-1/actions/info/index.js`
- Modify: `shipping-method/src/commerce-extensibility-1/ext.config.yaml` (add the
  `commerce-checkout-starter-kit` package alongside the auto-generated `app-management` package)
- Test: `shipping-method/test/actions/info.test.js`

**Interfaces:**
- Produces: `main(_params)` returning `{ statusCode: 200 }`, registered as
  `commerce-checkout-starter-kit/info`.

- [ ] **Step 1: Write the failing test**

```js
// shipping-method/test/actions/info.test.js
import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/info/index.js";

describe("commerce-checkout-starter-kit/info", () => {
  test("returns HTTP 200", () => {
    expect(main({})).toEqual({ statusCode: 200 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shipping-method && npx vitest run test/actions/info.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the action (byte-for-byte copy of the monolith's, only the relative import path changes)**

```js
// shipping-method/src/commerce-extensibility-1/actions/info/index.js
import { HTTP_OK } from "../../../../lib/http.js";

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

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shipping-method && npx vitest run test/actions/info.test.js
```

Expected: PASS.

- [ ] **Step 5: Register the action in the generated `ext.config.yaml`**

Open `shipping-method/src/commerce-extensibility-1/ext.config.yaml` (generated by Task 1's `init` —
contains only the auto-generated `app-management` package block so far) and add a second,
hand-maintained package below it. `aio app build`'s pre-app-build hook regenerates the
`app-management` block on every build but preserves other packages, so this edit is safe to keep:

```yaml
# shipping-method/src/commerce-extensibility-1/ext.config.yaml
runtimeManifest:
  packages:
    app-management:
      # ... auto-generated — do not edit
    commerce-checkout-starter-kit:
      license: Apache-2.0
      actions:
        info:
          function: actions/info/index.js
          web: 'yes'
          runtime: nodejs:24
          annotations:
            require-adobe-auth: true
            final: true
```

- [ ] **Step 6: Verify the build still succeeds**

```bash
cd shipping-method && aio app build
```

Expected: build completes; the `commerce-checkout-starter-kit` package survives regeneration.

- [ ] **Step 7: Commit**

```bash
git add shipping-method/src/commerce-extensibility-1/actions/info shipping-method/src/commerce-extensibility-1/ext.config.yaml shipping-method/test/actions/info.test.js
git commit -m "shipping-method: relocate commerce-checkout-starter-kit/info tracking action"
```

---

### Task 6: Move the `shipping-methods` webhook action (business logic unchanged)

**Files:**
- Create: `shipping-method/src/commerce-extensibility-1/actions/shipping-methods/index.js`
- Modify: `shipping-method/src/commerce-extensibility-1/ext.config.yaml` (add the `shipping-method`
  package)
- Test: `shipping-method/test/actions/shipping-methods.test.js`

**Interfaces:**
- Consumes: `webhookVerify`, `webhookErrorResponse` (Task 2), `HTTP_OK` (Task 2),
  `checkoutMetrics`, `isWebhookSuccessful`, `telemetryConfig` (Task 4).
- Produces: `main(params)` registered as `shipping-method/shipping-methods`, annotated
  `require-adobe-auth: false`, `raw-http: true` — unchanged from the monolith.

- [ ] **Step 1: Write the failing test (ported from the payload-shape assertions implied by the current action; no equivalent test exists in the monolith today, so this is new coverage)**

```js
// shipping-method/test/actions/shipping-methods.test.js
import { describe, expect, test, vi } from "vitest";

vi.mock("../../lib/webhook.js", () => ({
  webhookVerify: vi.fn(),
  webhookErrorResponse: vi.fn((message) => ({
    statusCode: 200,
    body: { op: "exception", message },
  })),
}));

const { webhookVerify } = await import("../../lib/webhook.js");
const { main } = await import(
  "../../src/commerce-extensibility-1/actions/shipping-methods/index.js"
);

function buildParams(rateRequest) {
  return {
    __ow_body: btoa(JSON.stringify({ rateRequest })),
  };
}

describe("shipping-methods", () => {
  test("returns a verification error when the signature is invalid", async () => {
    webhookVerify.mockReturnValue({ success: false, error: "bad signature" });

    const result = await main(buildParams({}));

    expect(result.statusCode).toBe(200);
    expect(result.body.op).toBe("exception");
  });

  test("always returns the DPS base rate", async () => {
    webhookVerify.mockReturnValue({ success: true });

    const result = await main(
      buildParams({ dest_country_id: "US", dest_postcode: "12345" }),
    );

    const operations = JSON.parse(result.body);
    expect(operations).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_one" }),
      }),
    );
  });

  test("adds a second rate for postcodes above 30000", async () => {
    webhookVerify.mockReturnValue({ success: true });

    const result = await main(
      buildParams({ dest_country_id: "US", dest_postcode: "40000" }),
    );

    const operations = JSON.parse(result.body);
    expect(operations).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_two" }),
      }),
    );
  });

  test("adds a Canada-only rate for CA destinations", async () => {
    webhookVerify.mockReturnValue({ success: true });

    const result = await main(
      buildParams({ dest_country_id: "CA", dest_postcode: "12345" }),
    );

    const operations = JSON.parse(result.body);
    expect(operations).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_ca_one" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shipping-method && npx vitest run test/actions/shipping-methods.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the action (byte-for-byte business logic from the monolith; only imports change)**

```js
// shipping-method/src/commerce-extensibility-1/actions/shipping-methods/index.js
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import { webhookErrorResponse, webhookVerify } from "../../../../lib/webhook.js";
import { HTTP_OK } from "../../../../lib/http.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

/**
 * This action returns the list of out-of-process shipping methods for the given request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params the input parameters
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function shippingMethods(params) {
  const { logger } = getInstrumentationHelpers();

  logger.debug("Starting shipping methods process");

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.shippingMethodsCounter.add(1, {
        status: "error",
        error_code: "verification_failed",
      });
      return webhookErrorResponse(
        `Failed to verify the webhook signature: ${error}`,
      );
    }

    const payload = JSON.parse(atob(params.__ow_body));
    const { rateRequest: request } = payload;

    const {
      dest_country_id: destCountryId = "US",
      dest_postcode: destPostcode = "12345",
    } = request;

    logger.info("Received request: ", request);

    const operations = [];

    operations.push(
      createShippingOperation({
        carrier_code: "DPS",
        method: "dps_shipping_one",
        method_title: "Demo Custom Shipping One",
        price: 17,
        cost: 17,
        additional_data: [
          { key: "additional_data_key", value: "additional_data_value" },
          { key: "additional_data_key2", value: "additional_data_value2" },
          { key: "additional_data_key3", value: "additional_data_value3" },
        ],
      }),
    );

    if (destPostcode > 30_000) {
      operations.push(
        createShippingOperation({
          carrier_code: "DPS",
          method: "dps_shipping_two",
          method_title: "Demo Custom Shipping Two",
          price: 18,
          cost: 18,
          additional_data: {
            key: "additional_data_key",
            value: "additional_data_value",
          },
        }),
      );
    }

    if (destCountryId === "CA") {
      operations.push(
        createShippingOperation({
          carrier_code: "DPS",
          method: "dps_shipping_ca_one",
          method_title: "Demo Custom Shipping for Canada only",
          price: 18,
          cost: 18,
          additional_data: {
            key: "additional_data_key",
            value: "additional_data_value",
          },
        }),
      );
    }

    const { all_items: cartItems = [] } = request;

    for (const cartItem of cartItems) {
      const { country_origin: country = "" } =
        cartItem?.product?.attributes ?? {};

      if (country.toLowerCase() === "china") {
        operations.push({
          op: "add",
          path: "result",
          value: {
            carrier_code: "DPS",
            method: "dps_shipping_from_china",
            method_title: "Demo Custom Shipping country origin China",
            price: 230,
            cost: 230,
            additional_data: [
              { key: "shipped_from", value: "China" },
              { key: "delivery_time", value: "15 days" },
            ],
          },
        });
      }
    }

    const { customer: Customer = {} } = request;

    if (
      Customer !== null &&
      typeof Customer === "object" &&
      Object.hasOwn(Customer, "group_id") &&
      Customer.group_id === "1"
    ) {
      operations.push({
        op: "add",
        path: "result",
        value: {
          carrier_code: "DPS",
          method: "dps_shipping_customer_group_one",
          method_title: "Demo Custom Shipping based on customer group",
          price: 7,
          cost: 7,
          additional_data: [{ key: "group_special", value: "-20%" }],
        },
      });
    }

    logger.info(`Generated ${operations.length} shipping method operations`);

    checkoutMetrics.shippingMethodsCounter.add(1, { status: "success" });

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations),
    };
  } catch (error) {
    logger.error("Error in shipping methods:", error);
    checkoutMetrics.shippingMethodsCounter.add(1, {
      status: "error",
      error_code: "exception",
    });
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

/**
 * Creates a shipping operation
 *
 * @param {object} carrierData - The carrier data for the shipping operation
 * @returns {object} The shipping operation object
 */
function createShippingOperation(carrierData) {
  return {
    op: "add",
    path: "result",
    value: carrierData,
  };
}

export const main = instrumentEntrypoint(shippingMethods, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shipping-method && npx vitest run test/actions/shipping-methods.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Register the action, preserving today's exact annotations**

```yaml
# shipping-method/src/commerce-extensibility-1/ext.config.yaml (append)
    shipping-method:
      license: Apache-2.0
      actions:
        shipping-methods:
          function: actions/shipping-methods/index.js
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
```

- [ ] **Step 6: Verify the build still succeeds**

```bash
cd shipping-method && aio app build
```

- [ ] **Step 7: Commit**

```bash
git add shipping-method/src/commerce-extensibility-1/actions/shipping-methods shipping-method/src/commerce-extensibility-1/ext.config.yaml shipping-method/test/actions/shipping-methods.test.js
git commit -m "shipping-method: relocate shipping-methods webhook action"
```

---

### Task 7: Relocate `get-shipping-carriers.js` as a plain helper script

**Files:**
- Create: `shipping-method/scripts/get-shipping-carriers.js`
- Test: `shipping-method/test/scripts/get-shipping-carriers.test.js`

**Interfaces:**
- Consumes: `getAdobeCommerceClient` (Task 3).

- [ ] **Step 1: Write the failing test**

```js
// shipping-method/test/scripts/get-shipping-carriers.test.js
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getAdobeCommerceClient } from "../../lib/commerce-client.js";
import { main } from "../../scripts/get-shipping-carriers.js";

vi.mock("../../lib/commerce-client.js");

describe("get-shipping-carriers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("logs the fetched carriers on success", async () => {
    getAdobeCommerceClient.mockResolvedValue({
      getOopeShippingCarriers: vi
        .fn()
        .mockResolvedValue({ success: true, message: [{ code: "DPS" }] }),
    });

    await main();

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("Total 1 shipping carriers fetched"),
    );
  });

  test("logs an error when the request fails", async () => {
    getAdobeCommerceClient.mockResolvedValue({
      getOopeShippingCarriers: vi
        .fn()
        .mockResolvedValue({ success: false, message: "boom" }),
    });

    await main();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to retrieve shipping carriers"),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shipping-method && npx vitest run test/scripts/get-shipping-carriers.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the script (byte-for-byte from the monolith; only the import path changes)**

```js
// shipping-method/scripts/get-shipping-carriers.js
import { getAdobeCommerceClient } from "../lib/commerce-client.js";

/**
 * Retrieves all shipping carrier from the configured Adobe Commerce instance
 */
export async function main() {
  const client = await getAdobeCommerceClient(process.env);
  const response = await client.getOopeShippingCarriers();
  console.info("Fetching shipping carriers...");
  if (response.success) {
    console.info(
      `Total ${response.message.length} shipping carriers fetched: ${response.message
        .map((carrier) => `\n${JSON.stringify(carrier, null, 2)}`)
        .join("")}`,
    );
  } else {
    console.error(`Failed to retrieve shipping carriers${response.message}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shipping-method && npx vitest run test/scripts/get-shipping-carriers.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add shipping-method/scripts/get-shipping-carriers.js shipping-method/test/scripts/get-shipping-carriers.test.js
git commit -m "shipping-method: relocate get-shipping-carriers helper script"
```

---

### Task 8: Validate the auth-swap pattern for runtime webhook actions (spike — GO/NO-GO)

**Goal of this task:** produce a documented answer to "does `getCommerceClient`/`getCommerceInstance`
work inside a `raw-http: true` / `require-adobe-auth: false` action invoked directly by Commerce?"
before any production code depends on the answer. Per the Key Finding above, `shipping-methods` has
no outbound Commerce call to modify either way — this task does not touch it. Its only permanent
output is a recorded finding (used by Task 10's README and reusable by the payment/tax plans).

**Files:**
- Test: `shipping-method/test/spike/commerce-auth-spike.test.js` (kept — cheap regression coverage of
  the underlying mechanism; does not gate the app's own deploy)
- Temporary (deleted at the end of this task): `shipping-method/src/commerce-extensibility-1/actions/spike-commerce-auth-check/index.js`,
  a temporary `ext.config.yaml` package entry

- [ ] **Step 1: Add the SDK auth dependency needed for both this spike and Task 9**

```bash
cd shipping-method
npm pkg set dependencies["@adobe/aio-commerce-lib-auth"]="latest"
```

- [ ] **Step 2: Write the unit-test layer — real `resolveImsAuthParams`/`getCommerceClient` code paths, with the network and the association-storage lookup faked**

This test intentionally starts with `nock.disableNetConnect()`. If the real IMS token exchange calls
a different host than assumed below, the test fails with a clear "unmocked host" error naming the
actual host — update the intercept and re-run. Discovering the real call graph is part of this
spike, not a test-authoring mistake.

```js
// shipping-method/test/spike/commerce-auth-spike.test.js
import nock from "nock";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-config", () => ({
  getSystemConfigByKey: vi.fn().mockResolvedValue({
    baseUrl: "https://mycommerce.example.com",
    env: "paas",
  }),
  setSystemConfigByKey: vi.fn(),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const { resolveImsAuthParams } = await import("@adobe/aio-commerce-lib-auth");

const FAKE_RAW_HTTP_PARAMS = {
  // Shape of `params` a `raw-http: true` / `require-adobe-auth: false` action
  // actually receives — no Adobe-injected IMS/actor claims, only whatever this
  // app's own `inputs` supply plus the raw OpenWhisk envelope fields.
  __ow_method: "post",
  __ow_headers: { "content-type": "application/json" },
  __ow_body: "e30=", // base64("{}")
  AIO_COMMERCE_AUTH_IMS_CLIENT_ID: "test-client-id",
  AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: JSON.stringify(["test-secret"]),
  AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: "test-tech-account-id",
  AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: "test@example.com",
  AIO_COMMERCE_AUTH_IMS_ORG_ID: "test-org-id@AdobeOrg",
  AIO_COMMERCE_AUTH_IMS_SCOPES: JSON.stringify(["AdobeID", "openid"]),
};

describe("auth-swap spike: getCommerceClient inside a raw-http action", () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test("resolveImsAuthParams accepts raw-http action params without throwing", () => {
    expect(() => resolveImsAuthParams(FAKE_RAW_HTTP_PARAMS)).not.toThrow();
  });

  test("getCommerceClient authenticates and calls Commerce using only raw-http params", async () => {
    // Adjust this host if the real IMS auth flow targets a different one —
    // see the note above.
    const imsScope = nock("https://ims-na1.adobelogin.com")
      .post("/ims/token/v3")
      .reply(200, { access_token: "spike-token", expires_in: 3600 });

    const commerceScope = nock("https://mycommerce.example.com")
      .get("/V1/oope_shipping_carrier/")
      .matchHeader("Authorization", "Bearer spike-token")
      .reply(200, []);

    const auth = resolveImsAuthParams(FAKE_RAW_HTTP_PARAMS);
    const client = await getCommerceClient(auth);
    await client.get("V1/oope_shipping_carrier/").json();

    imsScope.done();
    commerceScope.done();
  });
});
```

- [ ] **Step 3: Run the test and record the result**

```bash
cd shipping-method && npx vitest run test/spike/commerce-auth-spike.test.js
```

Record the outcome in `docs/superpowers/plans/2026-07-07-shipping-method-app-management.md` under a
new "Spike result" note (append it — do not delete this checklist item):
- If it fails with an unmocked-host error: update the intercepted host(s) to match, re-run, and only
  proceed to Step 4 once it passes for the correct real hosts.
- If it fails for a structural reason (e.g. `getCommerceClient` throws given a `raw-http`-shaped
  `params` object, or `resolveImsAuthParams` requires fields raw-http actions can't supply): this is
  a **NO-GO**. Skip Step 4 (manual test) and go straight to Step 6.

- [ ] **Step 4 (only if Step 3 passed): manual test against a real Commerce instance**

Add a temporary diagnostic action with the exact same annotations as `shipping-methods`, so the
manual test exercises the real deploy conditions:

```js
// shipping-method/src/commerce-extensibility-1/actions/spike-commerce-auth-check/index.js
// TEMPORARY — delete after recording the spike result (Task 8, Step 6).
import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

export async function main(params) {
  try {
    const client = await getCommerceClient(resolveImsAuthParams(params));
    const carriers = await client.get("V1/oope_shipping_carrier/").json();
    return { statusCode: 200, body: { op: "success", carriers } };
  } catch (error) {
    return { statusCode: 200, body: { op: "exception", message: error.message } };
  }
}
```

```yaml
# shipping-method/src/commerce-extensibility-1/ext.config.yaml (append temporarily)
    shipping-method:
      actions:
        spike-commerce-auth-check:
          function: actions/spike-commerce-auth-check/index.js
          web: 'yes'
          runtime: nodejs:24
          inputs:
            AIO_COMMERCE_AUTH_IMS_CLIENT_ID: $AIO_COMMERCE_AUTH_IMS_CLIENT_ID
            AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: $AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS
            AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: $AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID
            AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: $AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL
            AIO_COMMERCE_AUTH_IMS_ORG_ID: $AIO_COMMERCE_AUTH_IMS_ORG_ID
            AIO_COMMERCE_AUTH_IMS_SCOPES: $AIO_COMMERCE_AUTH_IMS_SCOPES
          annotations:
            require-adobe-auth: false
            raw-http: true
            final: true
```

Deploy and associate the app against a real (sandbox) Commerce instance per the README's install flow
(Task 10), then:

```bash
curl -X POST "https://<your-namespace>.adobeioruntime.net/api/v1/web/shipping-method/spike-commerce-auth-check" \
  -H "Content-Type: application/json" -d '{}'
```

Expected on GO: `{"op":"success","carriers":[...]}`. Expected on NO-GO: `{"op":"exception","message":"..."}`
— capture the exact message.

- [ ] **Step 5: Delete the temporary diagnostic action regardless of outcome**

```bash
cd shipping-method
git rm -r src/commerce-extensibility-1/actions/spike-commerce-auth-check
```

Remove its block from `ext.config.yaml` as well, then verify the build still succeeds:

```bash
aio app build
```

- [ ] **Step 6: Record the GO/NO-GO finding**

Append a "Spike result" section to this plan file (`docs/superpowers/plans/2026-07-07-shipping-method-app-management.md`)
stating: the date, GO or NO-GO, the exact hosts the real auth flow contacted, and — on NO-GO — the
failure mode observed. This finding is consumed by Task 10 (README) and should be copied into the
payment/tax domain plans before they attempt the same swap.

- [ ] **Step 7: Commit**

```bash
git add shipping-method/test/spike/commerce-auth-spike.test.js shipping-method/package.json docs/superpowers/plans/2026-07-07-shipping-method-app-management.md
git commit -m "shipping-method: validate association-based Commerce auth for raw-http actions"
```

---

### Task 9: Rewrite `create-shipping-carriers.js` as a `defineCustomInstallationStep`

This uses `getCommerceClient(resolveImsAuthParams(context.params))` regardless of Task 8's outcome —
the design spec marks this specific use (inside a custom installation step, not a runtime webhook
action) as **not experimental**, since `InstallationContext.params` is typed to guarantee the IMS
fields `resolveImsAuthParams` needs
(`packages/aio-commerce-lib-app/source/management/installation/workflow/step.ts` in `aio-commerce-sdk`).

**Files:**
- Create: `shipping-method/scripts/create-shipping-carriers.js`
- Modify: `shipping-method/app.commerce.config.ts` (add `installation.customInstallationSteps`)
- Test: `shipping-method/test/scripts/create-shipping-carriers.test.js`

**Interfaces:**
- Produces: default export usable as a `defineCustomInstallationStep` handler,
  `(config, context) => Promise<string[]>` (array of created carrier codes).

- [ ] **Step 1: Write the failing test**

```js
// shipping-method/test/scripts/create-shipping-carriers.test.js
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));
vi.mock("@adobe/aio-commerce-lib-auth", () => ({
  resolveImsAuthParams: vi.fn((params) => params),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const createShippingCarriers = (
  await import("../../scripts/create-shipping-carriers.js")
).default;

function mockClient(response1, response2) {
  getCommerceClient.mockResolvedValue({
    post: vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve(response1) })
      .mockReturnValueOnce({ json: () => Promise.resolve(response2) }),
  });
}

const context = {
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  params: {
    AIO_COMMERCE_AUTH_IMS_CLIENT_ID: "id",
    AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: "[\"secret\"]",
    AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: "tech-id",
    AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: "tech@example.com",
    AIO_COMMERCE_AUTH_IMS_ORG_ID: "org-id",
    AIO_COMMERCE_AUTH_IMS_SCOPES: "[\"AdobeID\"]",
  },
};

describe("create-shipping-carriers install step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates every carrier defined in shipping-carriers.yaml", async () => {
    mockClient({}, {});

    const result = await createShippingCarriers({}, context);

    expect(result).toEqual(["DPS", "Fedex"]);
  });

  test("skips carriers whose creation call throws", async () => {
    getCommerceClient.mockResolvedValue({
      post: vi
        .fn()
        .mockReturnValueOnce({ json: () => Promise.resolve({}) })
        .mockReturnValueOnce({
          json: () => Promise.reject(new Error("already exists")),
        }),
    });

    const result = await createShippingCarriers({}, context);

    expect(result).toEqual(["DPS"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shipping-method && npx vitest run test/scripts/create-shipping-carriers.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the install step**

```js
// shipping-method/scripts/create-shipping-carriers.js
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { load } from "js-yaml";

const SHIPPING_CARRIERS_YAML = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../shipping-carriers.yaml",
);

/**
 * Creates every shipping carrier defined in shipping-carriers.yaml on the associated Commerce
 * instance. Runs inside the App Management installation workflow.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the carrier codes successfully created
 */
export default defineCustomInstallationStep(async (_config, context) => {
  const { logger } = context;
  const client = await getCommerceClient(resolveImsAuthParams(context.params));

  logger.info("Reading shipping-carriers.yaml...");
  const { shipping_carriers: carriers } = load(
    readFileSync(SHIPPING_CARRIERS_YAML, "utf8"),
  );

  const created = [];
  for (const shippingCarrier of carriers) {
    const carrierCode = shippingCarrier.carrier.code;
    try {
      await client.post("V1/oope_shipping_carrier", { json: shippingCarrier }).json();
      logger.info(`Shipping carrier ${carrierCode} created`);
      created.push(carrierCode);
    } catch (error) {
      logger.warn(`Failed to create shipping carrier ${carrierCode}: ${error.message}`);
    }
  }

  return created;
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shipping-method && npx vitest run test/scripts/create-shipping-carriers.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 5: Wire the step into `app.commerce.config.ts`**

```ts
// shipping-method/app.commerce.config.ts
import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  metadata: {
    id: "checkout-shipping-method",
    displayName: "Checkout Shipping Method",
    description:
      "Out-of-process shipping methods and carrier setup for the Adobe Commerce checkout starter kit.",
    version: "1.0.0",
  },
  installation: {
    customInstallationSteps: [
      {
        script: "./scripts/create-shipping-carriers.js",
        name: "Create Shipping Carriers",
        description:
          "Creates the out-of-process shipping carriers defined in shipping-carriers.yaml.",
      },
    ],
  },
});
```

- [ ] **Step 6: Verify the build still succeeds**

```bash
cd shipping-method && aio app build
```

Expected: build validates the updated config and regenerates the `app-management` package to include
the new step.

- [ ] **Step 7: Commit**

```bash
git add shipping-method/scripts/create-shipping-carriers.js shipping-method/app.commerce.config.ts shipping-method/test/scripts/create-shipping-carriers.test.js
git commit -m "shipping-method: rewrite create-shipping-carriers as a custom installation step"
```

---

### Task 10: Write `shipping-method/README.md`

**Files:**
- Create: `shipping-method/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Checkout Shipping Method

Out-of-process shipping carrier setup and the `shipping-methods` out-of-process shipping rates
webhook, extracted from the Adobe Commerce checkout starter kit as an independent App Management
app.

## Install, build, deploy, and association

This app follows the standard Adobe Commerce App Management flow. Follow
[the App Management documentation](https://developer.adobe.com/commerce/extensibility/app-development/)
for:

- Creating the Developer Console project/workspace and installing the Adobe I/O CLI
- `npm install`, `aio app use --merge`
- `aio app build` / `aio app deploy`
- Associating the app with a Commerce instance (this is what populates the
  `AIO_COMMERCE_AUTH_IMS_*` credentials the installation step and the webhook auth path rely on)

During `aio app deploy`, the **Create Shipping Carriers** installation step runs automatically and
creates every carrier defined in [`shipping-carriers.yaml`](./shipping-carriers.yaml) on the
associated Commerce instance. To inspect what's currently registered without re-running install:

```bash
npm run get-shipping-carriers
```

(This is a local dev-only helper — it needs `COMMERCE_BASE_URL` plus either `OAUTH_*` or
`COMMERCE_CONSUMER_*` credentials in your `.env`; see [`env.dist`](./env.dist).)

## Webhook signature setup

1. In Adobe Commerce, go to **Stores > Settings > Configuration > Adobe Services > Webhooks**.
1. Enable **Digital Signature Configuration** and click **Regenerate Key Pair**.
1. Add the generated **Public Key** to your `.env` as
   [documented here](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action):

   ```env
   COMMERCE_WEBHOOKS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   -----END PUBLIC KEY-----"
   ```

1. After deploying, [create the webhook](https://developer.adobe.com/commerce/extensibility/webhooks/create-webhooks/)
   pointing at `shipping-method/shipping-methods`:
   - For SaaS: register under **System > Webhooks > Webhooks Subscriptions**.
   - For PaaS: use `webhooks.xml`, replacing the URL with your deployed action's URL.

See the [shipping use-cases documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-use-cases/)
for how to customize the rates returned by `shipping-methods`.

## Validation

1. Deploy and associate the app.
1. Confirm `npm run get-shipping-carriers` lists the carriers from `shipping-carriers.yaml`.
1. Place an order in Commerce and confirm the custom shipping methods appear at checkout.

## Auth pattern note

<!-- Filled in from Task 8's recorded spike result. -->
This app validated whether Adobe Commerce App Management's association-based Commerce client
(`getCommerceClient`/`getCommerceInstance`) can be used from a `raw-http: true` /
`require-adobe-auth: false` webhook action. See the "Spike result" note in
`docs/superpowers/plans/2026-07-07-shipping-method-app-management.md` for the outcome. The
`shipping-methods` action itself does not call Commerce today, so this finding is informational for
the payment and tax domain apps rather than something this app's own behavior depends on.
```

- [ ] **Step 2: Fill in the "Auth pattern note" section with Task 8's actual recorded GO/NO-GO result**

- [ ] **Step 3: Commit**

```bash
git add shipping-method/README.md
git commit -m "shipping-method: add README"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd shipping-method && npm test
```

Expected: all tests from Tasks 2, 3, 5, 6, 7, 8, 9 pass.

- [ ] **Step 2: Run lint/format checks**

```bash
cd shipping-method && npm run code:check
```

Expected: no violations. Fix with `npm run code:fix` if needed, then re-run Step 1.

- [ ] **Step 3: Run a clean build**

```bash
cd shipping-method && rm -rf dist && aio app build
```

Expected: build completes without errors.

- [ ] **Step 4: Diff-check nothing outside `shipping-method/` changed except this plan and the spec update**

```bash
git status --short
```

Expected: only `shipping-method/`, `docs/superpowers/plans/2026-07-07-shipping-method-app-management.md`,
and (from the earlier spec correction) `docs/superpowers/specs/2026-07-07-app-management-domain-split-design.md`
are touched.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "shipping-method: fix lint/test issues from verification pass"
```

(Skip this commit if Steps 1-3 required no changes.)
