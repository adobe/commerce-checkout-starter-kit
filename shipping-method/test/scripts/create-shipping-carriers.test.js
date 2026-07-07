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
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  params: {
    AIO_COMMERCE_AUTH_IMS_CLIENT_ID: "id",
    AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: '["secret"]',
    AIO_COMMERCE_AUTH_IMS_ORG_ID: "org-id",
    AIO_COMMERCE_AUTH_IMS_SCOPES: '["AdobeID"]',
    AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: "tech@example.com",
    AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: "tech-id",
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
