/**
 * Buy 10+ units (cart total qty) → 50% off each of the 3 lowest base-subtotal lines (`sales2cd`).
 * Stacks new promo on existing `base_discount_amount` only (same pattern as `total-collector`).
 * No signature verification.
 *
 * With `raw-http: true`, body is base64 in `__ow_body`.
 */
import { HTTP_OK } from "../../lib/http.js";

const MIN_TOTAL_QTY = 10;
const NUM_CHEAPEST = 3;
const DISCOUNT_PERCENT = 50;

const RULE_LABEL = `Buy ${MIN_TOTAL_QTY} items → ${NUM_CHEAPEST} cheapest ${DISCOUNT_PERCENT}% off`;

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

function getExistingItemBaseDiscount(item) {
  const raw =
    item.base_discount_amount ??
    item.baseDiscountAmount ??
    item.base_discount ??
    0;
  return round2(Number(raw) || 0);
}

function lineSubtotal(item) {
  const base = Number(item?.base_price ?? 0) || 0;
  const qty = Number(item?.qty ?? 0) || 0;
  return round2(base * qty);
}

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

/**
 * @returns {{ totalNewBase: number, discountByIndex: Record<number, number>, ruleLabel: string | null }}
 */
function calculateThreeCheapestHalfOff(items) {
  const totalQty = totalCartQty(items);
  if (totalQty < MIN_TOTAL_QTY) {
    return { totalNewBase: 0, discountByIndex: {}, ruleLabel: null };
  }

  const lines = items.map((item, idx) => ({
    idx,
    subtotal: lineSubtotal(item),
  }));
  lines.sort((a, b) => a.subtotal - b.subtotal || a.idx - b.idx);

  /** @type {Record<number, number>} */
  const discountByIndex = {};
  let totalNewBase = 0;
  for (const { idx, subtotal } of lines.slice(0, NUM_CHEAPEST)) {
    const d = round2(subtotal * (DISCOUNT_PERCENT / 100));
    discountByIndex[idx] = d;
    totalNewBase = round2(totalNewBase + d);
  }

  return {
    totalNewBase,
    discountByIndex,
    ruleLabel: RULE_LABEL,
  };
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

function collectCheapestQuantityDiscount(params) {
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

  const { totalNewBase, discountByIndex, ruleLabel } =
    calculateThreeCheapestHalfOff(items);

  if (totalNewBase <= 0 || !ruleLabel) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const discount_description_array = { 1: ruleLabel };

  const operations = [
    discountOperation(totalNewBase, discount_description_array),
  ];

  for (const [indexStr, newShare] of Object.entries(discountByIndex)) {
    const index = Number(indexStr);
    if (Number.isNaN(index) || newShare <= 0) {
      continue;
    }
    const item = items[index];
    if (!item) {
      continue;
    }
    const existing = getExistingItemBaseDiscount(item);
    const combinedLine = round2(existing + newShare);
    operations.push(createItemBaseDiscountReplaceOp(index, combinedLine));
  }

  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operations),
  };
}

export function main(params) {
  return collectCheapestQuantityDiscount(params);
}
