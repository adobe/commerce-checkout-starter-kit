import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  createOrUpdateCommerceTaxClass,
  fetchCommerceTaxClasses,
} from "../../src/commerce-backend-ui-2/web-src/src/lib/commerce-tax-classes.js";

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("fetchCommerceTaxClasses", () => {
  test("maps Commerce taxClasses/search items into the row shape the table expects", async () => {
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

    const rows = await fetchCommerceTaxClasses("test-ims-token", "test-org-id");

    expect(rows).toEqual([
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
    expect(options.method).toBe("POST");
    expect(options.headers.authorization).toBe("Bearer test-ims-token");
    expect(options.headers["x-gw-ims-org-id"]).toBe("test-org-id");

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

    const rows = await fetchCommerceTaxClasses("tok", "org-id");

    expect(rows).toEqual([
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

  test("throws with the action's error message when the request fails", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ message: "Commerce request failed: boom" }),
      ok: false,
      status: 500,
    });

    await expect(fetchCommerceTaxClasses("tok", "org-id")).rejects.toThrow(
      "Commerce request failed: boom",
    );
  });

  test("falls back to a generic message when the error response has no body", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.reject(new Error("no body")),
      ok: false,
      status: 500,
    });

    await expect(fetchCommerceTaxClasses("tok", "org-id")).rejects.toThrow(
      "Commerce request failed with status 500",
    );
  });
});

describe("createOrUpdateCommerceTaxClass", () => {
  test("POSTs the mapped payload to the commerce-tax-classes action with the admin's IMS token and org ID", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });

    await createOrUpdateCommerceTaxClass("test-ims-token", "test-org-id", {
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

    await expect(
      createOrUpdateCommerceTaxClass("tok", "org-id", {
        className: "Taxable Goods",
        classType: "PRODUCT",
        customTaxCode: "001",
        customTaxLabel: "Books",
      }),
    ).rejects.toThrow("Missing or malformed Authorization header");
  });
});
