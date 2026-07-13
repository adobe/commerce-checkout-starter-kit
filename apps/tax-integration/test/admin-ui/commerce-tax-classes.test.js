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

    const rows = await fetchCommerceTaxClasses(
      "https://commerce.example.com/rest/all/",
      "test-ims-token",
    );

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

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("taxClasses/search");
    expect(options.headers.Authorization).toBe("Bearer test-ims-token");
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

    const rows = await fetchCommerceTaxClasses(
      "https://commerce.example.com/rest/all/",
      "tok",
    );

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

  test("throws when Commerce responds with a non-ok status", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      fetchCommerceTaxClasses("https://commerce.example.com/rest/all/", "tok"),
    ).rejects.toThrow("Commerce request failed with status 500");
  });
});

describe("createOrUpdateCommerceTaxClass", () => {
  test("POSTs the mapped payload to V1/taxClasses with the admin's IMS token", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });

    await createOrUpdateCommerceTaxClass(
      "https://commerce.example.com/rest/all/",
      "test-ims-token",
      {
        className: "Taxable Goods",
        classType: "PRODUCT",
        customTaxCode: "001",
        customTaxLabel: "Books",
        id: 2,
      },
    );

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://commerce.example.com/rest/all/V1/taxClasses");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-ims-token");
    expect(JSON.parse(options.body)).toEqual({
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

  test("throws when Commerce responds with a non-ok status", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(
      createOrUpdateCommerceTaxClass(
        "https://commerce.example.com/rest/all/",
        "tok",
        {
          className: "Taxable Goods",
          classType: "PRODUCT",
          customTaxCode: "001",
          customTaxLabel: "Books",
        },
      ),
    ).rejects.toThrow("Commerce request failed with status 400");
  });
});
