/**
 * Buy 10+ units (cart total qty) → 50% off the 3 lowest base-subtotal lines.
 * When eligible, returns a single `result` replace with percent and those line ids.
 *
 * Runs with `require-adobe-auth: true`; Commerce's webhook signature verification is handled by
 * the App Management platform via the declarative `webhooks[]` subscription in
 * `app.commerce.config.ts`, so `params` arrives as the already-parsed webhook payload
 * (`params.shippingAssignment`, `params.quote`, `params.total`).
 */
import {
  exceptionOperation,
  ok,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import {
  discountResultOperation,
  getShippingAssignmentItemIds,
  getShippingItems,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
import { discountMetrics } from "../discount-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

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
    .map((item, idx) => ({ idx, item, subtotal: lineSubtotal(item) }))
    .sort((a, b) => a.subtotal - b.subtotal || a.idx - b.idx)
    .slice(0, NUM_CHEAPEST);
  return getShippingAssignmentItemIds(ranked.map((r) => r.item)).filter(
    (id) => !Number.isNaN(id),
  );
}

function collectCheapestQuantityDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    if (!isEligible(items)) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const discountItemIds = threeCheapestItemIdsOnly(items);

    if (!discountItemIds.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    discountMetrics.discountRequestsCounter.add(1, { status: "success" });
    return ok(
      discountResultOperation(
        DISCOUNT_PERCENT,
        { 1: RULE_LABEL },
        discountItemIds,
      ),
    );
  } catch (err) {
    logger.error("Error in cheapest-quantity-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectCheapestQuantityDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
