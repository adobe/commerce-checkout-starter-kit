/**
 * Quantity-tiered discount webhook.
 * Buy 3+ → 10% off; Buy 6+ → 15% off.
 * When eligible, returns a single `result` replace with percent and all line ids.
 *
 * Runs with `require-adobe-auth: true`; Commerce's webhook signature verification is handled by
 * the App Management platform via the declarative `webhooks[]` subscription in
 * `app.commerce.config.ts`, so `params` arrives as the already-parsed webhook payload
 * (`params.shippingAssignment`, `params.quote`, `params.total`).
 */
import {
  exceptionOperation,
  isWebhookSuccessful,
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
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
import { discountMetrics } from "../discount-metrics.js";
import { telemetryConfig } from "../telemetry.js";

const QTY_TIER_1 = 3;
const QTY_TIER_2 = 6;
const PERCENT_TIER_1 = 10;
const PERCENT_TIER_2 = 15;

const RULE_LABEL_TIER_1 = "Buy 3+ → 10% off";
const RULE_LABEL_TIER_2 = "Buy 6+ → 15% off";

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

/** @returns {{ percent: number; ruleLabel: string } | { percent: null; ruleLabel: null }} */
function tierPercentForQty(totalQty) {
  if (totalQty >= QTY_TIER_2) {
    return { percent: PERCENT_TIER_2, ruleLabel: RULE_LABEL_TIER_2 };
  }
  if (totalQty >= QTY_TIER_1) {
    return { percent: PERCENT_TIER_1, ruleLabel: RULE_LABEL_TIER_1 };
  }
  return { percent: null, ruleLabel: null };
}

function collectTieredQuantityDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const totalQty = totalCartQty(items);
    const { percent, ruleLabel } = tierPercentForQty(totalQty);

    if (percent === null || percent <= 0 || !ruleLabel) {
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
      discountResultOperation(percent, { 1: ruleLabel }, discountItemIds),
    );
  } catch (err) {
    logger.error("Error in tiered-quantity-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectTieredQuantityDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
