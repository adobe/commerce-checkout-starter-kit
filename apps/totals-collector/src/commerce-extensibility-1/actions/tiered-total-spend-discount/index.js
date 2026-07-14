/**
 * Tiered total-spend discount:
 * Spend $100+ → 10% off, Spend $200+ → 20% off.
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
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
import { discountMetrics } from "../discount-metrics.js";
import { telemetryConfig } from "../telemetry.js";

const TIERS = [
  { label: "Spend $200+ → 20% off", minSubtotal: 200, percent: 20 },
  { label: "Spend $100+ → 10% off", minSubtotal: 100, percent: 10 },
];

function lineAmounts(item) {
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  return {
    lineBase: round2(basePrice * qty),
  };
}

function cartBaseSubtotal(items) {
  return round2(
    items.reduce((sum, item) => sum + lineAmounts(item).lineBase, 0),
  );
}

/** @returns {{ percent: number; ruleLabel: string } | { percent: null; ruleLabel: null }} */
function tierPercentForSubtotal(baseSubtotal) {
  for (const tier of TIERS) {
    if (baseSubtotal >= tier.minSubtotal) {
      return { percent: tier.percent, ruleLabel: tier.label };
    }
  }
  return { percent: null, ruleLabel: null };
}

function collectTieredTotalSpendDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const baseSubtotal = cartBaseSubtotal(items);
    const { percent, ruleLabel } = tierPercentForSubtotal(baseSubtotal);

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
    logger.error("Error in tiered-total-spend-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectTieredTotalSpendDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
