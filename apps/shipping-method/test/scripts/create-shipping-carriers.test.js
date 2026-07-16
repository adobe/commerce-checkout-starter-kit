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
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({}) })
      .mockReturnValueOnce({ json: () => Promise.resolve({}) });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createShippingCarriers.install({}, context);

    expect(result).toEqual(["DPS", "Fedex"]);
    expect(post).toHaveBeenCalledWith(
      "oope_shipping_carrier",
      expect.objectContaining({
        json: {
          carrier: expect.objectContaining({ active: true, code: "DPS" }),
        },
      }),
    );
  });

  test("throws when carrier creation fails", async () => {
    const error = new Error("Commerce unavailable");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValue({ json: () => Promise.reject(error) }),
    });

    await expect(createShippingCarriers.install({}, context)).rejects.toThrow(
      "Commerce unavailable",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to create shipping carrier DPS: Commerce unavailable",
    );
  });

  test("deactivates every carrier defined in shipping-carriers.yaml", async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({}) })
      .mockReturnValueOnce({ json: () => Promise.resolve({}) });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createShippingCarriers.uninstall({}, context);

    expect(result).toEqual(["DPS", "Fedex"]);
    expect(post).toHaveBeenCalledWith(
      "oope_shipping_carrier",
      expect.objectContaining({
        json: {
          carrier: expect.objectContaining({ active: false, code: "DPS" }),
        },
      }),
    );
  });

  test("throws when carrier deactivation fails", async () => {
    const error = new Error("Commerce unavailable");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValue({ json: () => Promise.reject(error) }),
    });

    await expect(createShippingCarriers.uninstall({}, context)).rejects.toThrow(
      "Commerce unavailable",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to deactivate shipping carrier DPS: Commerce unavailable",
    );
  });
});
