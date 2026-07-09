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

import { replaceOperation } from "@adobe/aio-commerce-sdk/webhooks/responses";
import { describe, expect, test } from "vitest";

import * as totalCollectorDiscounts from "../../src/commerce-extensibility-1/lib/total-collector-discounts.js";

describe("total-collector-discounts module", () => {
  test("exports every helper the discount actions rely on (categoryFromSku is module-private, not exported)", () => {
    const expectedExports = [
      "round2",
      "getShippingItems",
      "getShippingAssignmentItemIds",
      "itemIdentifierForLookup",
      "buildQuoteItemIndex",
      "resolveQuoteLineForShippingItem",
      "getExistingItemBaseDiscount",
      "getExistingItemDiscountAmount",
      "zeroDiscountOperation",
      "discountOperation",
      "discountResultOperation",
      "itemCategoryFromSku",
    ];

    for (const exportName of expectedExports) {
      // biome-ignore lint/performance/noDynamicNamespaceImportAccess: verifying the module's full export surface by name
      expect(typeof totalCollectorDiscounts[exportName]).toBe("function");
    }
    expect(totalCollectorDiscounts.categoryFromSku).toBeUndefined();
  });

  test("zeroDiscountOperation matches the SDK's replaceOperation('result', ...) shape exactly", () => {
    expect(totalCollectorDiscounts.zeroDiscountOperation()).toEqual(
      replaceOperation("result", {
        base_discount: 0,
        code: "discount",
        discount_description_array: {},
      }),
    );
  });

  test("zeroDiscountOperation preserves the exact hand-rolled JSON shape it replaces", () => {
    expect(totalCollectorDiscounts.zeroDiscountOperation()).toEqual({
      op: "replace",
      path: "result",
      value: {
        base_discount: 0,
        code: "discount",
        discount_description_array: {},
      },
    });
  });

  test("discountOperation matches the SDK's replaceOperation('result', ...) shape exactly", () => {
    const result = totalCollectorDiscounts.discountOperation(12.5, {
      1: "test rule",
    });
    expect(result).toEqual(
      replaceOperation("result", {
        base_discount: 12.5,
        code: "discount",
        discount_description_array: { 1: "test rule" },
      }),
    );
  });

  test("discountOperation preserves the exact hand-rolled JSON shape it replaces", () => {
    const result = totalCollectorDiscounts.discountOperation("7.5", {
      1: "test rule",
    });
    expect(result).toEqual({
      op: "replace",
      path: "result",
      value: {
        base_discount: 7.5,
        code: "discount",
        discount_description_array: { 1: "test rule" },
      },
    });
  });

  test("discountResultOperation matches the SDK's replaceOperation('result', ...) shape exactly", () => {
    const result = totalCollectorDiscounts.discountResultOperation(
      50,
      { 1: "test rule" },
      [1, 2, 3],
    );
    expect(result).toEqual(
      replaceOperation("result", {
        base_discount: 50,
        code: "discount",
        discount_description_array: { 1: "test rule" },
        discount_item_id_array: [1, 2, 3],
        discount_type: "percentage",
      }),
    );
  });

  test("discountResultOperation preserves the exact hand-rolled JSON shape it replaces", () => {
    const result = totalCollectorDiscounts.discountResultOperation(
      "45",
      { 1: "test rule" },
      [4, 5],
    );
    expect(result).toEqual({
      op: "replace",
      path: "result",
      value: {
        base_discount: 45,
        code: "discount",
        discount_description_array: { 1: "test rule" },
        discount_item_id_array: [4, 5],
        discount_type: "percentage",
      },
    });
  });
});
