/**
 * Category spend rule: spend ≥ $150 on category_id N → P% off those lines only (base subtotal).
 * Stacks new discount on existing `base_discount_amount` (same pattern as `total-collector`).
 *
 * With `raw-http: true`, body is base64 in `__ow_body`. Signature verification skipped.
 */
import { HTTP_OK } from "../../lib/http.js";

const TARGET_CATEGORY_ID = 3;
const CATEGORY_SPEND_THRESHOLD = 150;
const CATEGORY_DISCOUNT_PERCENT = 15;

function parseJsonBody(params) {
  if (!params.__ow_body) {
    return null;
  }
  try {
    return JSON.parse(atob(params.__ow_body));
  } catch {
    return null;
  }
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function getExistingItemBaseDiscount(item) {
  const raw =
    item.base_discount_amount ??
    item.baseDiscountAmount ??
    item.base_discount ??
    0;
  return round2(Number(raw) || 0);
}

function getShippingItems(webhookData) {
  const assignment =
    webhookData.shippingAssignment ?? webhookData.shipping_assignment ?? {};
  return Array.isArray(assignment.items) ? assignment.items : [];
}

function lineSubtotal(item) {
  const base = Number(item?.base_price ?? 0) || 0;
  const qty = Number(item?.qty ?? 0) || 0;
  return round2(base * qty);
}

function addParsedNumberToSet(ids, n) {
  if (!Number.isNaN(n)) {
    ids.add(n);
  }
}

function addCommaSeparatedNumbersToSet(ids, str) {
  for (const part of str.split(",")) {
    addParsedNumberToSet(ids, Number(part.trim()));
  }
}

/** @param {Set<number>} ids @param {unknown} v */
function collectCategoryValueIntoSet(ids, v) {
  if (v === undefined || v === null) {
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      collectCategoryValueIntoSet(ids, x);
    }
    return;
  }
  if (typeof v === "number") {
    addParsedNumberToSet(ids, v);
    return;
  }
  if (typeof v === "string") {
    addCommaSeparatedNumbersToSet(ids, v);
  }
}

/** Resolve category ids from common OOP / quote item payload shapes. */
function itemCategoryIds(item) {
  const ids = new Set();

  collectCategoryValueIntoSet(ids, item.category_ids);
  collectCategoryValueIntoSet(ids, item.categoryIds);
  collectCategoryValueIntoSet(ids, item.category_id);
  collectCategoryValueIntoSet(ids, item.categoryId);
  collectCategoryValueIntoSet(ids, item.product?.category_ids);
  collectCategoryValueIntoSet(ids, item.product?.categoryIds);
  collectCategoryValueIntoSet(ids, item.extension_attributes?.category_ids);
  collectCategoryValueIntoSet(ids, item.extension_attributes?.categoryIds);

  return [...ids];
}

function itemIsInCategory(item, categoryId) {
  const target = Number(categoryId);
  if (Number.isNaN(target)) {
    return false;
  }
  return itemCategoryIds(item).includes(target);
}

function categorySpendSubtotal(items, categoryId) {
  return round2(
    items.reduce(
      (sum, item) =>
        itemIsInCategory(item, categoryId) ? sum + lineSubtotal(item) : sum,
      0,
    ),
  );
}

function zeroDiscountOperation() {
  return {
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: 0,
      discount_description_array: {},
    },
  };
}

function discountOperation(totalDiscount, descriptionDict) {
  return {
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: Number(totalDiscount),
      discount_description_array: descriptionDict,
    },
  };
}

function createItemBaseDiscountReplaceOp(index, combinedAmount) {
  return {
    op: "replace",
    path: `shippingAssignment/items/${index}/base_discount_amount`,
    value: round2(combinedAmount),
  };
}

function collectCategorySpendDiscount(params) {
  const data = parseJsonBody(params);

  if (data === null) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { op: "exception", message: "Invalid webhook payload" },
      ]),
    };
  }

  const items = getShippingItems(data);
  if (!items.length) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const spendOnCategory = categorySpendSubtotal(items, TARGET_CATEGORY_ID);
  if (spendOnCategory < CATEGORY_SPEND_THRESHOLD) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const newLineDiscounts = items.map((item) => {
    if (!itemIsInCategory(item, TARGET_CATEGORY_ID)) {
      return 0;
    }
    const line = lineSubtotal(item);
    return round2(line * (CATEGORY_DISCOUNT_PERCENT / 100));
  });

  const totalNewDiscount = round2(newLineDiscounts.reduce((a, b) => a + b, 0));

  if (totalNewDiscount <= 0) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const discount_description_array = {
    1: `Spend $${CATEGORY_SPEND_THRESHOLD} on category ${TARGET_CATEGORY_ID} → ${CATEGORY_DISCOUNT_PERCENT}% off`,
  };

  const operations = [
    discountOperation(totalNewDiscount, discount_description_array),
  ];

  newLineDiscounts.forEach((newShare, index) => {
    if (newShare <= 0) {
      return;
    }
    const existing = getExistingItemBaseDiscount(items[index]);
    const combinedLine = round2(existing + newShare);
    operations.push(createItemBaseDiscountReplaceOp(index, combinedLine));
  });

  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operations),
  };
}

export function main(params) {
  return collectCategorySpendDiscount(params);
}
