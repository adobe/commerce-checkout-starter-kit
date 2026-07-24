// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-admin-ui/web", () => ({
  useIms: vi.fn(() => ({
    data: { imsOrgId: "test-org-id", imsToken: "test-ims-token" },
    error: null,
  })),
}));
vi.mock(
  "../../src/commerce-backend-ui-2/web-src/src/hooks/use-config.ts",
  () => {
    const config = {
      getActionUrl: () => "https://example.com/commerce-proxy-action",
    };
    return { useConfig: () => config };
  },
);

const { useUpsertCommerceTaxClass } = await import(
  "../../src/commerce-backend-ui-2/web-src/src/hooks/use-upsert-commerce-tax-class.ts"
);

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("useUpsertCommerceTaxClass", () => {
  test("POSTs the mapped payload to the commerce-proxy-action with the admin's IMS token and org ID", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });

    const { result } = renderHook(() => useUpsertCommerceTaxClass());

    await result.current({
      className: "Taxable Goods",
      classType: "PRODUCT",
      customTaxCode: "001",
      customTaxLabel: "Books",
      id: 2,
    });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers.authorization).toBe("Bearer test-ims-token");
    expect(options.headers["x-gw-ims-org-id"]).toBe("test-org-id");

    const body = JSON.parse(options.body);
    expect(body.operation).toBe("taxClasses");
    expect(body.method).toBe("POST");
    expect(body.payload).toEqual({
      taxClass: {
        class_id: 2,
        class_name: "Taxable Goods",
        class_type: "PRODUCT",
        custom_attributes: [
          { attribute_code: "tax_code", value: "001" },
          { attribute_code: "tax_label", value: "Books" },
        ],
      },
    });
  });

  test("throws with the action's error message when the request fails", async () => {
    global.fetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          message: "Missing or malformed Authorization header",
        }),
      ok: false,
      status: 400,
    });

    const { result } = renderHook(() => useUpsertCommerceTaxClass());

    await expect(
      result.current({
        className: "Taxable Goods",
        classType: "PRODUCT",
        customTaxCode: "001",
        customTaxLabel: "Books",
      }),
    ).rejects.toThrow("Missing or malformed Authorization header");
  });
});
