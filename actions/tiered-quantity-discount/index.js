/**
 * Quantity-tiered discount webhook (from `sales1b.py`).
 * Buy 3+ → 10% off; Buy 6+ → 15% off (on each line's price × qty).
 * Stacks new tier discount on top of existing line discounts (same idea as `total-collector`).
 *
 * With `raw-http: true`, body is base64 in `__ow_body`. Signature verification skipped.
 */
import { HTTP_OK } from "../../lib/http.js";

const QTY_TIER_1 = 3;
const QTY_TIER_2 = 6;
const PERCENT_TIER_1 = 10;
const PERCENT_TIER_2 = 15;

const RULE_LABEL_TIER_1 = "Buy 3+ → 10% off";
const RULE_LABEL_TIER_2 = "Buy 6+ → 15% off";

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

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
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

function tierPercentForQty(totalQty) {
  if (totalQty >= QTY_TIER_2) {
    return { percentage: PERCENT_TIER_2, ruleLabel: RULE_LABEL_TIER_2 };
  }
  if (totalQty >= QTY_TIER_1) {
    return { percentage: PERCENT_TIER_1, ruleLabel: RULE_LABEL_TIER_1 };
  }
  return { percentage: 0, ruleLabel: null };
}

function calculateTieredLineDiscounts(items, percentage) {
  let totalBase = 0;
  const perLine = [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const { lineBase, lineStore } = lineAmounts(item);
    const baseDisc = round2(lineBase * (percentage / 100));
    const storeDisc = round2(lineStore * (percentage / 100));
    totalBase = round2(totalBase + baseDisc);
    perLine.push({
      item_index: idx,
      line_base: lineBase,
      line_store: lineStore,
      base_discount: baseDisc,
      store_discount: storeDisc,
    });
  }
  return { totalBase: round2(totalBase), perLine };
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

function collectTieredQuantityDiscount(params) {
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

  const totalQty = totalCartQty(items);
  const { percentage, ruleLabel } = tierPercentForQty(totalQty);

  if (percentage <= 0 || !ruleLabel) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const { totalBase: totalTierBaseDiscount, perLine } =
    calculateTieredLineDiscounts(items, percentage);

  if (totalTierBaseDiscount <= 0) {
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

    const item = items[row.item_index];
    const existingBase = getExistingItemBaseDiscount(item);
    const existingStore = getExistingItemDiscountAmount(item);

    const combinedBase = round2(existingBase + row.base_discount);
    const combinedStore = round2(existingStore + row.store_discount);

    const idx = row.item_index;

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
      value: Number(percentage),
    });
  }

  operations.push({
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: Number(totalTierBaseDiscount),
      discount_description_array: { 1: ruleLabel },
    },
  });

  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operations),
  };
}

export function main(params) {
  return collectTieredQuantityDiscount(params);
}
