/**
 * Multi-condition discount (`sales3a.py`):
 * Buy at least 5 items AND spend $200+ (base subtotal) → 25% off.
 * Applies promo proportionally to each line and stacks with existing line discounts.
 *
 * With `raw-http: true`, body is base64 in `__ow_body`. Signature verification skipped.
 */
import { HTTP_OK } from "../../lib/http.js";

const MIN_QTY = 5;
const MIN_SUBTOTAL = 200;
const DISCOUNT_PERCENT = 25;
const RULE_LABEL = "Buy at least 5 items & spend $200 or more → 25% off";

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

function getShippingItems(webhookData) {
  const assignment =
    webhookData.shippingAssignment ?? webhookData.shipping_assignment ?? {};
  return Array.isArray(assignment.items) ? assignment.items : [];
}

function lineAmounts(item) {
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
  return {
    lineBase: round2(basePrice * qty),
    lineStore: round2(storePrice * qty),
  };
}

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

function getExistingItemBaseDiscount(item) {
  const raw =
    item.base_discount_amount ??
    item.baseDiscountAmount ??
    item.base_discount ??
    0;
  return round2(Number(raw) || 0);
}

function getExistingItemDiscountAmount(item) {
  return round2(Number(item.discount_amount ?? item.discountAmount ?? 0) || 0);
}

function isEligible(items) {
  if (!items.length) {
    return false;
  }
  const qty = totalCartQty(items);
  const baseSubtotal = round2(
    items.reduce((sum, item) => sum + lineAmounts(item).lineBase, 0),
  );
  return qty >= MIN_QTY && baseSubtotal >= MIN_SUBTOTAL;
}

/**
 * Promo-only per-line 25% discounts before stacking existing amounts.
 * Mirrors sales3a calculate_line_discounts_25.
 */
function calculatePromoPerLine(items) {
  let totalBase = 0;
  const perLine = [];
  for (let idx = 0; idx < items.length; idx++) {
    const { lineBase, lineStore } = lineAmounts(items[idx]);
    const promoBase = round2(lineBase * (DISCOUNT_PERCENT / 100));
    const promoStore = round2(lineStore * (DISCOUNT_PERCENT / 100));
    totalBase = round2(totalBase + promoBase);
    perLine.push({
      item_index: idx,
      line_base: lineBase,
      line_store: lineStore,
      base_discount: promoBase,
      store_discount: promoStore,
    });
  }
  return { totalBase, perLine };
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

function collectMultiConditionDiscount(params) {
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

  if (!isEligible(items)) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const { totalBase: totalPromoBase, perLine } = calculatePromoPerLine(items);
  if (totalPromoBase <= 0) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const operations = [];

  for (const row of perLine) {
    if (row.base_discount <= 0) {
      continue;
    }
    const idx = row.item_index;
    const item = items[idx];
    const combinedBase = round2(
      getExistingItemBaseDiscount(item) + row.base_discount,
    );
    const combinedStore = round2(
      getExistingItemDiscountAmount(item) + row.store_discount,
    );

    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/base_discount_amount`,
      value: combinedBase,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_amount`,
      value: combinedStore,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_percent`,
      value: DISCOUNT_PERCENT,
    });
  }

  operations.push({
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: Number(totalPromoBase),
      discount_description_array: { 1: RULE_LABEL },
    },
  });

  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operations),
  };
}

export function main(params) {
  return collectMultiConditionDiscount(params);
}
