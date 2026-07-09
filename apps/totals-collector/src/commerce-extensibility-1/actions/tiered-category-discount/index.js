/**
 * Category spend rule: spend ≥ $150 on **electronics** (SKU suffix after last `-`, e.g.
 * `Tv-electronics` or `Tv-Electronics` → `electronics`) → 15% off those lines only (base subtotal).
 * Stacks new discount on existing `base_discount_amount` (same pattern as `total-collector`).
 *
 * Runs with `require-adobe-auth: true`; Commerce's webhook signature verification is handled by
 * the App Management platform via the declarative `webhooks[]` subscription in
 * `app.commerce.config.ts`, so `params` arrives as the already-parsed webhook payload
 * (`params.shippingAssignment`, `params.quote`, `params.total`).
 */
import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import {
  buildQuoteItemIndex,
  discountOperation,
  getExistingItemBaseDiscount,
  getShippingItems,
  itemCategoryFromSku,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
import { discountMetrics } from "../discount-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

/** Last segment of SKU after `-`, lowercased (e.g. `Tv-electronics` → `electronics`). */
const TARGET_CATEGORY_NAME = "electronics";
const CATEGORY_SPEND_THRESHOLD = 150;
const CATEGORY_DISCOUNT_PERCENT = 15;

function lineSubtotal(item) {
  const base = Number(item?.base_price ?? 0) || 0;
  const qty = Number(item?.qty ?? 0) || 0;
  return round2(base * qty);
}

function itemMatchesTargetCategory(item, byId, bySku) {
  const qline = resolveQuoteLineForShippingItem(item, byId, bySku);
  return itemCategoryFromSku(item, qline) === TARGET_CATEGORY_NAME;
}

function categorySpendSubtotal(items, byId, bySku) {
  return round2(
    items.reduce(
      (sum, item) =>
        itemMatchesTargetCategory(item, byId, bySku)
          ? sum + lineSubtotal(item)
          : sum,
      0,
    ),
  );
}

function createItemBaseDiscountReplaceOp(index, combinedAmount) {
  return replaceOperation(
    `shippingAssignment/items/${index}/base_discount_amount`,
    round2(combinedAmount),
  );
}

function collectCategorySpendDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    const quote = params.quote ?? {};
    const { byId, bySku } = buildQuoteItemIndex(quote?.items ?? []);

    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const spendOnCategory = categorySpendSubtotal(items, byId, bySku);
    if (spendOnCategory < CATEGORY_SPEND_THRESHOLD) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const newLineDiscounts = items.map((item) => {
      if (!itemMatchesTargetCategory(item, byId, bySku)) {
        return 0;
      }
      const line = lineSubtotal(item);
      return round2(line * (CATEGORY_DISCOUNT_PERCENT / 100));
    });

    const totalNewDiscount = round2(
      newLineDiscounts.reduce((a, b) => a + b, 0),
    );

    if (totalNewDiscount <= 0) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const discount_description_array = {
      1: `Spend $${CATEGORY_SPEND_THRESHOLD} on ${TARGET_CATEGORY_NAME} (SKU) → ${CATEGORY_DISCOUNT_PERCENT}% off`,
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

    discountMetrics.discountRequestsCounter.add(1, { status: "success" });
    return ok(operations);
  } catch (err) {
    logger.error("Error in tiered-category-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectCategorySpendDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
