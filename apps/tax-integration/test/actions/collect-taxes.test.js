import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/collect-taxes/index.js";

// @adobe/aio-lib-telemetry's getInstrumentationHelpers() requires ENABLE_TELEMETRY on the params
// passed to the instrumented entrypoint — mirroring the ENABLE_TELEMETRY action input configured
// in ext.config.yaml. With require-adobe-auth: true (no raw-http), Runtime parses the JSON body
// directly into `params`, so `oopQuote` arrives as a top-level key, not a base64 __ow_body.
function buildParams(oopQuote) {
  return {
    ENABLE_TELEMETRY: true,
    oopQuote,
  };
}

describe("collect-taxes", () => {
  test("calculates excluding-tax breakdown and summary operations", async () => {
    const result = await main(
      buildParams({
        items: [
          {
            discount_amount: 0,
            is_tax_included: false,
            quantity: 1,
            unit_price: 100,
          },
        ],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "oopQuote/items/0/tax_breakdown",
        value: expect.objectContaining({
          data: expect.objectContaining({ amount: 4.5, code: "state_tax" }),
        }),
      }),
    );
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "oopQuote/items/0/tax_breakdown",
        value: expect.objectContaining({
          data: expect.objectContaining({ amount: 3.6, code: "county_tax" }),
        }),
      }),
    );
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "replace",
        path: "oopQuote/items/0/tax",
        value: expect.objectContaining({
          data: expect.objectContaining({ amount: 8.1 }),
        }),
      }),
    );
  });

  test("calculates including-tax (VAT) breakdown for tax-included items", async () => {
    const result = await main(
      buildParams({
        items: [
          {
            discount_amount: 0,
            is_tax_included: true,
            quantity: 1,
            unit_price: 100,
          },
        ],
      }),
    );

    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "oopQuote/items/0/tax_breakdown",
        value: expect.objectContaining({
          data: expect.objectContaining({ code: "vat" }),
        }),
      }),
    );
  });

  test("returns an exception operation on unexpected error", async () => {
    const result = await main(buildParams(undefined));

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({ op: "exception" }));
  });

  test("taxes the children of a dynamic bundle on their whole row and skips the bundle line", async () => {
    const result = await main(buildParams({ items: bundleCartItems() }));

    expect(result.statusCode).toBe(200);
    expect(
      result.body.filter((op) => op.path.startsWith("oopQuote/items/0/")),
    ).toEqual([]);
    // child A: 195.00 x 1 per bundle x 2 bundles - 39.00 discount, child B: 120.70 x 2 per bundle x 2 bundles
    expect(taxAmounts(result.body)).toEqual({
      "oopQuote/items/1/tax": 28.44,
      "oopQuote/items/2/tax": 39.11,
      "oopQuote/items/3/tax": 9.78,
      "oopQuote/items/4/tax": 0.81,
    });
  });

  test("taxes every line on its own quantity when the payload has no parent_code", async () => {
    const items = bundleCartItems().map(({ parent_code, ...item }) => item);

    const result = await main(buildParams({ items }));

    expect(taxAmounts(result.body)).toEqual({
      "oopQuote/items/0/tax": 70.7,
      "oopQuote/items/1/tax": 12.64,
      "oopQuote/items/2/tax": 19.55,
      "oopQuote/items/3/tax": 9.78,
      "oopQuote/items/4/tax": 0.81,
    });
  });
});

/**
 * A cart with a dynamic bundle at qty 2, the bundle's child B on its own, and shipping.
 * @returns {object[]} the `oopQuote` items
 */
function bundleCartItems() {
  return [
    buildItem("sequence-1", "bundle", 2, 436.4, 0, null),
    buildItem("sequence-2", "child-a", 1, 195, 39, "sequence-1"),
    buildItem("sequence-3", "child-b", 2, 120.7, 0, "sequence-1"),
    buildItem("sequence-4", "child-b", 1, 120.7, 0, null),
    { ...buildItem("shipping", null, 1, 10, 0, null), type: "shipping" },
  ];
}

/**
 * @param {string} code the line code
 * @param {string|null} sku the SKU
 * @param {number} quantity the quantity, per unit of the parent line on a child
 * @param {number} unitPrice the unit price
 * @param {number} discountAmount the discount of the whole row
 * @param {string|null} parentCode the code of the parent line
 * @returns {object} an `oopQuote` item
 */
function buildItem(code, sku, quantity, unitPrice, discountAmount, parentCode) {
  return {
    code,
    custom_attributes: [],
    discount_amount: discountAmount,
    is_tax_included: false,
    name: sku,
    parent_code: parentCode,
    quantity,
    sku,
    tax: null,
    tax_breakdown: [],
    tax_class: "Taxable Goods",
    type: "product",
    unit_price: unitPrice,
  };
}

/**
 * @param {object[]} operations the response operations
 * @returns {Record<string, number>} the tax amount of each line, keyed by the path of its tax
 */
function taxAmounts(operations) {
  return Object.fromEntries(
    operations
      .filter((op) => op.path.endsWith("/tax"))
      .map((op) => [op.path, op.value.data.amount]),
  );
}
