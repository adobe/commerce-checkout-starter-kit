import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));
vi.mock("@adobe/aio-commerce-sdk/auth", () => ({
  resolveImsAuthParams: vi.fn((params) => params),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const createShippingCarriers = (
  await import("../../scripts/create-shipping-carriers.js")
).default;

function mockPostClient(response1, response2) {
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
    mockPostClient({}, {});

    const result = await createShippingCarriers.install({}, context);

    expect(result).toEqual(["DPS", "Fedex"]);
  });

  test("throws when carrier creation fails", async () => {
    const error = new Error("Commerce unavailable");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValueOnce({ json: () => Promise.reject(error) }),
    });

    await expect(createShippingCarriers.install({}, context)).rejects.toThrow(
      "Commerce unavailable",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to create shipping carrier DPS: Commerce unavailable",
    );
  });

  test("deletes every carrier by code during uninstall", async () => {
    const deleteMock = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve(true) })
      .mockReturnValueOnce({ json: () => Promise.resolve(true) });
    getCommerceClient.mockResolvedValue({ delete: deleteMock });

    await createShippingCarriers.uninstall({}, context);

    expect(deleteMock).toHaveBeenCalledWith("V1/oope_shipping_carrier/DPS");
    expect(deleteMock).toHaveBeenCalledWith("V1/oope_shipping_carrier/Fedex");
  });

  test("skips carriers that are already absent during uninstall", async () => {
    const notFound = new Error(
      'Out of process shipping carrier with code "DPS" does not exist.',
    );
    notFound.response = { statusCode: 404 };
    const deleteMock = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.reject(notFound) })
      .mockReturnValueOnce({ json: () => Promise.resolve(true) });
    getCommerceClient.mockResolvedValue({ delete: deleteMock });

    await createShippingCarriers.uninstall({}, context);

    expect(context.logger.warn).toHaveBeenCalledWith(
      "Shipping carrier DPS does not exist",
    );
  });

  test("throws when carrier deletion fails for a non-idempotent reason", async () => {
    const error = new Error("Commerce unavailable");
    getCommerceClient.mockResolvedValue({
      delete: vi
        .fn()
        .mockReturnValueOnce({ json: () => Promise.reject(error) }),
    });

    await expect(createShippingCarriers.uninstall({}, context)).rejects.toThrow(
      "Commerce unavailable",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to delete shipping carrier DPS: Commerce unavailable",
    );
  });
});
