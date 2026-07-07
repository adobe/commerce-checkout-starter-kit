import { describe, expect, test, vi } from "vitest";

// Mocks only the association-storage lookup (persisted separately from any given webhook
// invocation, via @adobe/aio-commerce-lib-config). Everything else below runs for real,
// including the actual IMS token exchange over the network — see the "Spike result" note in
// docs/superpowers/plans/2026-07-07-shipping-method-app-management.md for why: nock could not be
// made to intercept @adobe/aio-commerce-lib-app's bundled fetch client within reasonable effort,
// and a real network call turned out to be strictly more informative anyway, since it exercises
// the actual SDK internals instead of a guessed mock of them.
vi.mock("@adobe/aio-commerce-lib-config", () => ({
  getSystemConfigByKey: vi.fn().mockResolvedValue({
    baseUrl: "https://mycommerce.example.invalid",
    env: "paas",
  }),
  setSystemConfigByKey: vi.fn(),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const { resolveImsAuthParams } = await import("@adobe/aio-commerce-lib-auth");

const FAKE_RAW_HTTP_PARAMS = {
  __ow_body: "e30=", // base64("{}")
  __ow_headers: { "content-type": "application/json" },
  // Shape of `params` a `raw-http: true` / `require-adobe-auth: false` action actually
  // receives — no Adobe-injected IMS/actor claims, only whatever this app's own `inputs`
  // supply plus the raw OpenWhisk envelope fields.
  __ow_method: "post",
  AIO_COMMERCE_AUTH_IMS_CLIENT_ID: "spike-invalid-client-id",
  AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: JSON.stringify([
    "spike-invalid-secret",
  ]),
  AIO_COMMERCE_AUTH_IMS_ORG_ID: "spike-org-id@AdobeOrg",
  AIO_COMMERCE_AUTH_IMS_SCOPES: JSON.stringify(["AdobeID", "openid"]),
  AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: "spike@example.com",
  AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: "spike-tech-account-id",
};

describe("auth-swap spike: getCommerceClient inside a raw-http action", () => {
  test("resolveImsAuthParams accepts raw-http action params without throwing", () => {
    expect(() => resolveImsAuthParams(FAKE_RAW_HTTP_PARAMS)).not.toThrow();
  });

  test("getCommerceClient resolves association data and reaches the real IMS token endpoint using only raw-http params", async () => {
    const auth = resolveImsAuthParams(FAKE_RAW_HTTP_PARAMS);
    const client = await getCommerceClient(auth);

    // Deliberately invalid credentials — the assertion isn't that auth succeeds (it can't,
    // these credentials don't exist), it's that the call reaches the real Adobe IMS token
    // endpoint and gets back a normal, fast IMS error response, proving the whole
    // resolveImsAuthParams -> getCommerceClient -> HTTP-call chain executes correctly end to
    // end given nothing but raw-http-shaped params. A raw-http/require-adobe-auth:false
    // incompatibility would show up here as a hang, a crash, or a structurally different
    // error — not a clean IMS-level "invalid_client" rejection.
    await expect(
      client.get("V1/oope_shipping_carrier/").json(),
    ).rejects.toMatchObject({
      message: expect.stringContaining("invalid_client"),
    });
  }, 15_000);
});
