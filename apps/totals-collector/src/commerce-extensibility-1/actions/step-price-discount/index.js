/**
 * Cart-wide **step % off** by total cart qty : 1 → 20%, 2 → 35%, 3+ → 45% of
 * **cart** base/store subtotals. Promo is split across lines by subtotal share, then stacked on
 * existing discounts like `total-collector`.
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

const STEP_MIN_QTY_3 = 3;
const STEP_PCT_3PLUS = 45;
const STEP_MIN_QTY_2 = 2;
const STEP_PCT_2 = 35;
const STEP_MIN_QTY_1 = 1;
const STEP_PCT_1 = 20;

const RULE_LABEL =
  "Step % by cart qty: 1 → 20%, 2 → 35%, 3+ → 45% off subtotal";

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

/** @returns {{ percent: number; tierNote: string } | { percent: null; tierNote: null }} */
function tierPercentByTotalQty(totalQty) {
  if (totalQty >= STEP_MIN_QTY_3) {
    return { percent: STEP_PCT_3PLUS, tierNote: "3+ qty → 45% off" };
  }
  if (totalQty >= STEP_MIN_QTY_2) {
    return { percent: STEP_PCT_2, tierNote: "2 qty → 35% off" };
  }
  if (totalQty >= STEP_MIN_QTY_1) {
    return { percent: STEP_PCT_1, tierNote: "1 qty → 20% off" };
  }
  return { percent: null, tierNote: null };
}

function collectStepPriceDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    const discountItemIds = getShippingAssignmentItemIds(items);

    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const totalQty = totalCartQty(items);
    const { percent, tierNote } = tierPercentByTotalQty(totalQty);

    if (percent === null || percent <= 0) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    discountMetrics.discountRequestsCounter.add(1, { status: "success" });
    return ok(
      discountResultOperation(
        percent,
        { 1: `${RULE_LABEL} (${tierNote})` },
        discountItemIds,
      ),
    );
  } catch (err) {
    logger.error("Error in step-price-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectStepPriceDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
