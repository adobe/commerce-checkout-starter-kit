/**
 * Multi-condition discount:
 * Buy at least 5 items AND spend $200+ (base subtotal) → 25% off.
 * When eligible, returns a single `result` replace with percent and all line ids.
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

const MIN_QTY = 5;
const MIN_SUBTOTAL = 200;
const DISCOUNT_PERCENT = 25;
const RULE_LABEL = "Buy at least 5 items & spend $200 or more → 25% off";

function lineAmounts(item) {
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  return {
    lineBase: round2(basePrice * qty),
  };
}

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
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

function collectMultiConditionDiscount(params) {
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

    const discountItemIds = getShippingAssignmentItemIds(items).filter(
      (id) => !Number.isNaN(id),
    );

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
    logger.error("Error in multi-condition-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectMultiConditionDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
