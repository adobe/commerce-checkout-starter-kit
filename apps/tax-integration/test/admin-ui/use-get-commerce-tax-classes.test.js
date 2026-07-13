// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-admin-ui/web", () => ({
  useIms: vi.fn(() => ({
    imsOrgId: "test-org-id",
    imsToken: "test-ims-token",
  })),
}));
vi.mock("../../src/commerce-backend-ui-2/web-src/src/config.json", () => ({
  default: {
    "tax-integration-admin-ui/commerce-proxy-action":
      "https://example.com/commerce-proxy-action",
  },
}));

const { useGetCommerceTaxClasses } = await import(
  "../../src/commerce-backend-ui-2/web-src/src/hooks/use-get-commerce-tax-classes.ts"
);

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("useGetCommerceTaxClasses", () => {
  test("fetches on mount and maps Commerce taxClasses/search items into the row shape the table expects", async () => {
    global.fetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          items: [
            {
              class_id: 2,
              class_name: "Taxable Goods",
              class_type: "PRODUCT",
              custom_attributes: [
                { attribute_code: "tax_code", value: "001" },
                { attribute_code: "tax_label", value: "Books" },
              ],
            },
          ],
        }),
      ok: true,
    });

    const { result } = renderHook(() => useGetCommerceTaxClasses());

    expect(result.current.isLoadingCommerceTaxClasses).toBe(true);

    await waitFor(() =>
      expect(result.current.isLoadingCommerceTaxClasses).toBe(false),
    );

    expect(result.current.commerceTaxClasses).toEqual([
      {
        className: "Taxable Goods",
        classType: "PRODUCT",
        customTaxCode: "001",
        customTaxLabel: "Books",
        id: 2,
        rowNumber: 1,
      },
    ]);

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.method).toBe("GET");
    expect(body.operation).toContain("taxClasses/search");
  });

  test("defaults missing custom_attributes to empty strings", async () => {
    global.fetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          items: [
            { class_id: 3, class_name: "Freight", class_type: "SHIPPING" },
          ],
        }),
      ok: true,
    });

    const { result } = renderHook(() => useGetCommerceTaxClasses());

    await waitFor(() =>
      expect(result.current.isLoadingCommerceTaxClasses).toBe(false),
    );

    expect(result.current.commerceTaxClasses).toEqual([
      {
        className: "Freight",
        classType: "SHIPPING",
        customTaxCode: "",
        customTaxLabel: "",
        id: 3,
        rowNumber: 1,
      },
    ]);
  });

  test("clears the rows and logs when the request fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {
        // silence expected error log
      });
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ message: "boom" }),
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useGetCommerceTaxClasses());

    await waitFor(() =>
      expect(result.current.isLoadingCommerceTaxClasses).toBe(false),
    );

    expect(result.current.commerceTaxClasses).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test("refetchCommerceTaxClasses re-triggers the fetch", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ items: [] }),
      ok: true,
    });

    const { result } = renderHook(() => useGetCommerceTaxClasses());

    await waitFor(() =>
      expect(result.current.isLoadingCommerceTaxClasses).toBe(false),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetchCommerceTaxClasses();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
