/**
 * Buy 10+ units (cart total qty) → 50% off the 3 lowest base-subtotal lines.
 * When eligible, returns a single `result` replace with percent and those line ids.
 *
 * With `raw-http: true`, body is base64 in `__ow_body`. Verifies
 * `x-adobe-commerce-webhook-signature` like `collect-taxes` (requires
 * `COMMERCE_WEBHOOKS_PUBLIC_KEY` on the action).
 */

import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  discountResultOperation,
  getShippingAssignmentItemIds,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

const MIN_TOTAL_QTY = 10;
const NUM_CHEAPEST = 3;
const DISCOUNT_PERCENT = 50;

const RULE_LABEL = `Buy ${MIN_TOTAL_QTY} items → ${NUM_CHEAPEST} cheapest ${DISCOUNT_PERCENT}% off`;

function lineSubtotal(item) {
  const base = Number(item?.base_price ?? 0) || 0;
  const qty = Number(item?.qty ?? 0) || 0;
  return round2(base * qty);
}

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

function isEligible(items) {
  return items.length > 0 && totalCartQty(items) >= MIN_TOTAL_QTY;
}

/** @returns {number[]} Up to 3 line `item_id` values with the lowest base subtotals. */
function threeCheapestItemIdsOnly(items) {
  const ranked = items
    .map((item, idx) => ({ item, idx, subtotal: lineSubtotal(item) }))
    .sort((a, b) => a.subtotal - b.subtotal || a.idx - b.idx)
    .slice(0, NUM_CHEAPEST);
  return getShippingAssignmentItemIds(ranked.map((r) => r.item)).filter(
    (id) => !Number.isNaN(id),
  );
}

function collectCheapestQuantityDiscount(params) {
  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(
        `Failed to verify the webhook signature: ${error}`,
      );
    }

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

    const discountItemIds = threeCheapestItemIdsOnly(items);

    if (!discountItemIds.length) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        discountResultOperation(
          DISCOUNT_PERCENT,
          { 1: RULE_LABEL },
          discountItemIds,
        ),
      ]),
    };
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

export function main(params) {
  return collectCheapestQuantityDiscount(params);
}
