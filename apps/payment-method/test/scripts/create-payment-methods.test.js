import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));
vi.mock("@adobe/aio-commerce-sdk/auth", () => ({
  resolveImsAuthParams: vi.fn((params) => params),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const createPaymentMethods = (
  await import("../../scripts/create-payment-methods.js")
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

describe("create-payment-methods install step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates every payment method defined in PAYMENT_METHODS", async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({ success: true }) });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createPaymentMethods.install({}, context);

    expect(result.createdPaymentMethods).toEqual(["method-1"]);
    expect(post).toHaveBeenCalledWith(
      "oope_payment_method/",
      expect.objectContaining({
        json: {
          payment_method: expect.objectContaining({
            active: true,
            code: "method-1",
          }),
        },
      }),
    );
  });

  test("throws when a payment method fails to create", async () => {
    const error = new Error("Commerce API rejected the request");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValueOnce({ json: () => Promise.reject(error) }),
    });

    await expect(createPaymentMethods.install({}, context)).rejects.toThrow(
      "Commerce API rejected the request",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to create payment method method-1: Commerce API rejected the request",
    );
  });

  test("propagates the error when the Commerce client can't be built", async () => {
    getCommerceClient.mockRejectedValue(new Error("not associated"));

    await expect(createPaymentMethods.install({}, context)).rejects.toThrow(
      "not associated",
    );
  });

  test("deactivates every payment method defined in PAYMENT_METHODS", async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({ success: true }) });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createPaymentMethods.uninstall({}, context);

    expect(result.deactivatedPaymentMethods).toEqual(["method-1"]);
    expect(post).toHaveBeenCalledWith(
      "oope_payment_method/",
      expect.objectContaining({
        json: {
          payment_method: expect.objectContaining({
            active: false,
            code: "method-1",
          }),
        },
      }),
    );
  });

  test("throws when a payment method fails to deactivate", async () => {
    const error = new Error("Commerce API rejected the request");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValue({ json: () => Promise.reject(error) }),
    });

    await expect(createPaymentMethods.uninstall({}, context)).rejects.toThrow(
      "Commerce API rejected the request",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to deactivate payment method method-1: Commerce API rejected the request",
    );
  });
});
