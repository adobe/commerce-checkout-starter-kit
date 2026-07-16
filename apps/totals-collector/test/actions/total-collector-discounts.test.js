/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { describe, expect, test } from "vitest";

import { main as categoryBasedDiscount } from "../../src/commerce-extensibility-1/actions/category-based-discount/index.js";
import { main as cheapestItemDiscount } from "../../src/commerce-extensibility-1/actions/cheapest-item-discount/index.js";
import { main as cheapestQuantityDiscount } from "../../src/commerce-extensibility-1/actions/cheapest-quantity-discount/index.js";
import { main as expensiveItemDiscount } from "../../src/commerce-extensibility-1/actions/expensive-item-discount/index.js";
import { main as multiConditionDiscount } from "../../src/commerce-extensibility-1/actions/multi-condition-discount/index.js";
import { main as stepPriceDiscount } from "../../src/commerce-extensibility-1/actions/step-price-discount/index.js";
import { main as tieredCategoryDiscount } from "../../src/commerce-extensibility-1/actions/tiered-category-discount/index.js";
import { main as tieredQuantityDiscount } from "../../src/commerce-extensibility-1/actions/tiered-quantity-discount/index.js";
import { main as tieredTotalSpendDiscount } from "../../src/commerce-extensibility-1/actions/tiered-total-spend-discount/index.js";

const discountActions = [
  ["tiered-quantity-discount", tieredQuantityDiscount],
  ["tiered-category-discount", tieredCategoryDiscount],
  ["category-based-discount", categoryBasedDiscount],
  ["cheapest-item-discount", cheapestItemDiscount],
  ["expensive-item-discount", expensiveItemDiscount],
  ["cheapest-quantity-discount", cheapestQuantityDiscount],
  ["step-price-discount", stepPriceDiscount],
  ["multi-condition-discount", multiConditionDiscount],
  ["tiered-total-spend-discount", tieredTotalSpendDiscount],
];

// @adobe/aio-lib-telemetry's getInstrumentationHelpers() requires ENABLE_TELEMETRY on the params
// passed to the instrumented entrypoint — mirroring the ENABLE_TELEMETRY action input configured
// in ext.config.yaml, which Adobe I/O Runtime merges into `params` at invocation time. With
// require-adobe-auth: true, Commerce's webhook fields (total, quote, shippingAssignment) arrive
// directly as top-level params, already parsed — no raw-http/signature verification here.
function buildParams({ shippingAssignment, quote, total } = {}) {
  return {
    ENABLE_TELEMETRY: true,
    quote,
    shippingAssignment,
    total,
  };
}

describe("relocated total-collector discount actions", () => {
  test.each(discountActions)("%s exports a main function", (_name, main) => {
    expect(typeof main).toBe("function");
  });

  test.each(discountActions)(
    "%s returns the zero-discount result operation for an empty cart",
    async (_name, main) => {
      const result = await main(
        buildParams({ quote: {}, shippingAssignment: { items: [] } }),
      );

      expect(result.type).toBe("success");
      expect(result.statusCode).toBe(200);
      expect(result.body).toEqual(
        expect.objectContaining({
          op: "replace",
          path: "result",
          value: expect.objectContaining({
            base_discount: 0,
            code: "discount",
          }),
        }),
      );
    },
  );

  function resultOp(body) {
    return Array.isArray(body) ? body.find((op) => op.path === "result") : body;
  }

  test("tiered-quantity-discount grants the 6+ tier's 15% off when qualifying", async () => {
    const result = await tieredQuantityDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 10, item_id: 1, qty: 6, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value).toMatchObject({
      base_discount: 15,
      discount_type: "percentage",
    });
  });

  test("tiered-category-discount grants 15% off electronics once spend threshold is met", async () => {
    const result = await tieredCategoryDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 200, item_id: 1, qty: 1, sku: "tv-electronics" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeGreaterThan(0);
  });

  test("category-based-discount grants 50% off the cheapest line once the pizza+drinks mix is met", async () => {
    const result = await categoryBasedDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            {
              base_price: 10,
              item_id: 1,
              price: 10,
              qty: 2,
              sku: "x-pizza",
            },
            {
              base_price: 5,
              item_id: 2,
              price: 5,
              qty: 1,
              sku: "y-drinks",
            },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeGreaterThan(0);
  });

  test("cheapest-item-discount grants a free unit once 3+ shirts are in the cart", async () => {
    const result = await cheapestItemDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            {
              base_price: 10,
              item_id: 1,
              price: 10,
              qty: 3,
              sku: "a-shirts",
            },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeGreaterThan(0);
  });

  test("expensive-item-discount grants 30% off the most expensive wine line once 3+ units are in the cart", async () => {
    const result = await expensiveItemDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            {
              base_price: 20,
              item_id: 1,
              price: 20,
              qty: 3,
              sku: "a-wine",
            },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeGreaterThan(0);
  });

  test("cheapest-quantity-discount grants 50% off the cheapest lines once cart qty reaches 10", async () => {
    const result = await cheapestQuantityDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 5, item_id: 1, qty: 10, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value).toMatchObject({
      base_discount: 50,
      discount_type: "percentage",
    });
  });

  test("step-price-discount grants the 1-unit tier's 20% off", async () => {
    const result = await stepPriceDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 5, item_id: 1, qty: 1, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value).toMatchObject({
      base_discount: 20,
      discount_type: "percentage",
    });
  });

  test("multi-condition-discount grants 25% off once qty and spend thresholds are both met", async () => {
    const result = await multiConditionDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 40, item_id: 1, qty: 5, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value).toMatchObject({
      base_discount: 25,
      discount_type: "percentage",
    });
  });

  test("tiered-total-spend-discount grants the $200+ tier's 20% off", async () => {
    const result = await tieredTotalSpendDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 250, item_id: 1, qty: 1, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value).toMatchObject({
      base_discount: 20,
      discount_type: "percentage",
    });
  });

  test("tiered-quantity-discount grants the 3-5 tier's 10% off", async () => {
    const result = await tieredQuantityDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 10, item_id: 1, qty: 3, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(10);
  });

  test("tiered-category-discount stays at zero below the electronics spend threshold", async () => {
    const result = await tieredCategoryDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 50, item_id: 1, qty: 1, sku: "tv-electronics" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });

  test("category-based-discount stays at zero when only one of pizza/drinks is present", async () => {
    const result = await categoryBasedDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 10, item_id: 1, price: 10, qty: 2, sku: "x-pizza" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });

  test("cheapest-item-discount stays at zero below the 3-shirt threshold", async () => {
    const result = await cheapestItemDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 10, item_id: 1, price: 10, qty: 2, sku: "a-shirts" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });

  test("expensive-item-discount stays at zero below the 3-unit wine threshold", async () => {
    const result = await expensiveItemDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 20, item_id: 1, price: 20, qty: 2, sku: "a-wine" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });

  test("expensive-item-discount enriches shipping lines from quote.items when prices are missing", async () => {
    const result = await expensiveItemDiscount(
      buildParams({
        quote: {
          items: [
            { base_price: 20, item_id: 1, price: 20, qty: 3, sku: "a-wine" },
          ],
        },
        shippingAssignment: {
          items: [{ item_id: 1, qty: 3, sku: "a-wine" }],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeGreaterThan(0);
  });

  test("cheapest-quantity-discount stays at zero below the 10-unit threshold", async () => {
    const result = await cheapestQuantityDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 5, item_id: 1, qty: 5, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });

  test.each([
    [2, 35],
    [3, 45],
  ])(
    "step-price-discount grants the %i-unit tier's %i%% off",
    async (qty, percent) => {
      const result = await stepPriceDiscount(
        buildParams({
          quote: {},
          shippingAssignment: {
            items: [{ base_price: 5, item_id: 1, qty, sku: "a" }],
          },
        }),
      );

      expect(resultOp(result.body).value.base_discount).toBe(percent);
    },
  );

  test("multi-condition-discount stays at zero when qty qualifies but spend does not", async () => {
    const result = await multiConditionDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 1, item_id: 1, qty: 5, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });

  test("tiered-total-spend-discount grants the $100-199 tier's 10% off", async () => {
    const result = await tieredTotalSpendDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 150, item_id: 1, qty: 1, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(10);
  });

  // `quote.items` non-iterable forces buildQuoteItemIndex's `for...of` to throw, exercising the
  // catch block's `ok(exceptionOperation(...))` path for the 4 actions that read quote.items.
  test.each([
    ["tiered-category-discount", tieredCategoryDiscount, "tv-electronics"],
    ["category-based-discount", categoryBasedDiscount, "x-pizza"],
    ["cheapest-item-discount", cheapestItemDiscount, "a-shirts"],
    ["expensive-item-discount", expensiveItemDiscount, "a-wine"],
  ])(
    "%s returns an exception operation when quote.items is not iterable",
    async (_name, main, sku) => {
      const result = await main(
        buildParams({
          quote: { items: 123 },
          shippingAssignment: {
            items: [{ base_price: 10, item_id: 1, qty: 3, sku }],
          },
        }),
      );

      expect(result.type).toBe("success");
      expect(result.body).toEqual(expect.objectContaining({ op: "exception" }));
    },
  );

  test("cheapest-item-discount picks the cheapest of multiple eligible lines", async () => {
    const result = await cheapestItemDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 20, item_id: 1, price: 20, qty: 1, sku: "a-shirts" },
            { base_price: 5, item_id: 2, price: 5, qty: 2, sku: "b-shirts" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(5);
  });

  test("category-based-discount picks the cheapest of multiple eligible lines", async () => {
    const result = await categoryBasedDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 20, item_id: 1, price: 20, qty: 2, sku: "a-pizza" },
            { base_price: 5, item_id: 2, price: 5, qty: 1, sku: "b-drinks" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeCloseTo(2.5);
  });

  test("expensive-item-discount picks the most expensive of multiple eligible lines", async () => {
    const result = await expensiveItemDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 5, item_id: 1, price: 5, qty: 3, sku: "a-wine" },
            { base_price: 20, item_id: 2, price: 20, qty: 3, sku: "b-wine" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBeCloseTo(18);
  });

  test("cheapest-quantity-discount ranks multiple lines and discounts only the 3 cheapest", async () => {
    const result = await cheapestQuantityDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [
            { base_price: 1, item_id: 1, qty: 3, sku: "a" },
            { base_price: 2, item_id: 2, qty: 3, sku: "b" },
            { base_price: 3, item_id: 3, qty: 3, sku: "c" },
            { base_price: 4, item_id: 4, qty: 3, sku: "d" },
          ],
        },
      }),
    );

    expect(resultOp(result.body).value.discount_item_id_array).toEqual([
      1, 2, 3,
    ]);
  });

  // Lines lacking `item_id`/`id` produce a NaN that getShippingAssignmentItemIds' caller filters
  // out — exercising the "otherwise-qualifying cart has no usable line ids" zero-discount branch.
  test.each([
    [
      "tiered-quantity-discount",
      tieredQuantityDiscount,
      { base_price: 10, qty: 3 },
    ],
    [
      "cheapest-quantity-discount",
      cheapestQuantityDiscount,
      { base_price: 5, qty: 10 },
    ],
    [
      "multi-condition-discount",
      multiConditionDiscount,
      { base_price: 40, qty: 5 },
    ],
    [
      "tiered-total-spend-discount",
      tieredTotalSpendDiscount,
      { base_price: 150, qty: 1 },
    ],
  ])(
    "%s stays at zero when an otherwise-qualifying line has no usable item id",
    async (_name, main, item) => {
      const result = await main(
        buildParams({
          quote: {},
          shippingAssignment: { items: [{ sku: "a", ...item }] },
        }),
      );

      expect(resultOp(result.body).value.base_discount).toBe(0);
    },
  );

  test("step-price-discount stays at zero when the cart has lines but zero total quantity", async () => {
    const result = await stepPriceDiscount(
      buildParams({
        quote: {},
        shippingAssignment: {
          items: [{ base_price: 10, item_id: 1, qty: 0, sku: "a" }],
        },
      }),
    );

    expect(resultOp(result.body).value.base_discount).toBe(0);
  });
});
