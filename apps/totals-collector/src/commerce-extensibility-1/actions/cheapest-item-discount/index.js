/**
 * Buy 3 shirts → one unit of the cheapest eligible line free.
 * Eligibility uses category name from SKU suffix (see `itemCategoryFromSku` in lib).
 * Stacks promo on existing line discounts like `total-collector`.
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
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import {
  buildQuoteItemIndex,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
import { discountMetrics } from "../discount-metrics.js";
import { telemetryConfig } from "../telemetry.js";

const MIN_QTY = 3;

const SHIRT_CATEGORY_NAME = "shirts";

const RULE_LABEL = "Buy 3 shirts → cheapest free";

/**
 * @returns {{ totalNewBase: number, cheapestIndex: number, ruleLabel: string | null }}
 */
function calculateCheapestFree(items, quote) {
  const { byId, bySku } = buildQuoteItemIndex(quote?.items ?? []);

  const eligibleIndices = [];
  let totalEligibleQty = 0;
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const qline = resolveQuoteLineForShippingItem(item, byId, bySku);
    const category = itemCategoryFromSku(item, qline);
    if (category === SHIRT_CATEGORY_NAME) {
      eligibleIndices.push(idx);
      totalEligibleQty += Number(item?.qty ?? 0) || 0;
    }
  }

  if (totalEligibleQty < MIN_QTY) {
    return { cheapestIndex: -1, ruleLabel: null, totalNewBase: 0 };
  }

  /** @type {Array<{ idx: number; baseUnit: number; qty: number }>} */
  const lines = [];
  for (const idx of eligibleIndices) {
    const item = items[idx];
    const baseUnit = Number(item?.base_price ?? 0) || 0;
    const qty = Number(item?.qty ?? 0) || 0;
    lines.push({ baseUnit, idx, qty });
  }

  const cheapest = lines.reduce((best, cur) => {
    if (cur.baseUnit < best.baseUnit) {
      return cur;
    }
    if (cur.baseUnit === best.baseUnit && cur.idx < best.idx) {
      return cur;
    }
    return best;
  });

  const lineQty = cheapest.qty;
  const freeUnits = lineQty > 0 ? Math.min(1, lineQty) : 0;
  const unitDiscountBase = round2(cheapest.baseUnit * freeUnits);

  return {
    cheapestIndex: cheapest.idx,
    ruleLabel: RULE_LABEL,
    totalNewBase: unitDiscountBase,
  };
}

function collectCheapestItemDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    const quote = params.quote ?? {};

    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const { totalNewBase, cheapestIndex, ruleLabel } = calculateCheapestFree(
      items,
      quote,
    );

    if (totalNewBase <= 0 || !ruleLabel || cheapestIndex < 0) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const item = items[cheapestIndex];
    const qty = Number(item?.qty ?? 0) || 0;
    const basePrice = Number(item?.base_price ?? 0) || 0;
    const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
    const freeUnits = qty > 0 ? Math.min(1, qty) : 0;
    const newStoreDiscount = round2(storePrice * freeUnits);

    const existingBase = getExistingItemBaseDiscount(item);
    const existingStore = getExistingItemDiscountAmount(item);
    const combinedBase = round2(existingBase + totalNewBase);
    const combinedStore = round2(existingStore + newStoreDiscount);

    const lineBaseSubtotal = round2(basePrice * qty);
    const discountPercent =
      lineBaseSubtotal > 0
        ? Math.round((100 * 10_000 * combinedBase) / lineBaseSubtotal) / 10_000
        : 0;

    const idx = cheapestIndex;
    const operations = [];
    operations.push(
      replaceOperation(
        `shippingAssignment/items/${idx}/base_discount_amount`,
        combinedBase,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_amount`,
        combinedStore,
      ),
      replaceOperation(
        `shippingAssignment/items/${idx}/discount_percent`,
        discountPercent,
      ),
      replaceOperation("result", {
        base_discount: Number(totalNewBase),
        code: "discount",
        discount_description_array: { 1: ruleLabel },
      }),
    );

    discountMetrics.discountRequestsCounter.add(1, { status: "success" });
    return ok(operations);
  } catch (err) {
    logger.error("Error in cheapest-item-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      errorCode: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectCheapestItemDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
