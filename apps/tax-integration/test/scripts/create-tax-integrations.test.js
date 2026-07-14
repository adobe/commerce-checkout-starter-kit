import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));
vi.mock("@adobe/aio-commerce-sdk/auth", () => ({
  resolveImsAuthParams: vi.fn((params) => params),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const createTaxIntegrations = (
  await import("../../scripts/create-tax-integrations.js")
).default;

function mockPostClient(response) {
  getCommerceClient.mockResolvedValue({
    post: vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve(response) }),
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

describe("create-tax-integrations install step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates every tax integration defined in TAX_INTEGRATIONS", async () => {
    mockPostClient({});

    const result = await createTaxIntegrations.install({}, context);

    expect(result).toEqual(["oop-tax-integration"]);
  });

  test("throws when tax integration creation fails", async () => {
    const error = new Error("Commerce unavailable");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValueOnce({ json: () => Promise.reject(error) }),
    });

    await expect(createTaxIntegrations.install({}, context)).rejects.toThrow(
      "Commerce unavailable",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to create tax integration oop-tax-integration: Commerce unavailable",
    );
  });

  test("deactivates every tax integration defined in TAX_INTEGRATIONS", async () => {
    const post = vi
      .fn()
      .mockReturnValueOnce({ json: () => Promise.resolve({}) });
    getCommerceClient.mockResolvedValue({ post });

    const result = await createTaxIntegrations.uninstall({}, context);

    expect(result).toEqual(["oop-tax-integration"]);
    expect(post).toHaveBeenCalledWith(
      "oope_tax_management/tax_integration",
      expect.objectContaining({
        json: {
          tax_integration: expect.objectContaining({
            active: false,
            code: "oop-tax-integration",
          }),
        },
      }),
    );
  });

  test("throws when tax integration deactivation fails", async () => {
    const error = new Error("Commerce unavailable");
    getCommerceClient.mockResolvedValue({
      post: vi.fn().mockReturnValue({ json: () => Promise.reject(error) }),
    });

    await expect(createTaxIntegrations.uninstall({}, context)).rejects.toThrow(
      "Commerce unavailable",
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      "Failed to deactivate tax integration oop-tax-integration: Commerce unavailable",
    );
  });
});
