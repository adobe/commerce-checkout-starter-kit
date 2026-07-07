import nock from "nock";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getAdobeCommerceClient } from "../../lib/commerce-client.js";

vi.mock("@adobe/aio-lib-ims", async () => {
  const actual = await vi.importActual("@adobe/aio-lib-ims");
  const getToken = vi.fn();
  return {
    context: actual.context,
    default: { context: actual.context, getToken },
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
      OAUTH_IMS_ORG_ID: "test-org-id",
      OAUTH_SCOPES: JSON.stringify(["scope1", "scope2"]),
      OAUTH_TECHNICAL_ACCOUNT_EMAIL: "test-email@example.com",
      OAUTH_TECHNICAL_ACCOUNT_ID: "test-technical-account-id",
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
      COMMERCE_ACCESS_TOKEN: "test-access-token",
      COMMERCE_ACCESS_TOKEN_SECRET: "test-access-token-secret",
      COMMERCE_CONSUMER_KEY: "test-consumer-key",
      COMMERCE_CONSUMER_SECRET: "test-consumer-secret",
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
