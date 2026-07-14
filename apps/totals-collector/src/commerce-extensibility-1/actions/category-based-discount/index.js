/**
 * Buy 2+ qty from pizza and 1+ qty from drinks categories (derived from SKU suffix)
 * → 50% off the cheapest participating line.
 * Stacks on existing line discounts like `total-collector`.
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
  discountOperation,
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

const CAT_MIX_A = "pizza";
const CAT_MIX_B = "drinks";
const MIN_QTY_CAT_A = 2;
const MIN_QTY_CAT_B = 1;
const DISCOUNT_PERCENT = 50;

const RULE_LABEL = `Buy ${MIN_QTY_CAT_A} from ${CAT_MIX_A} + ${MIN_QTY_CAT_B} from ${CAT_MIX_B} → cheapest line ${DISCOUNT_PERCENT}% off`;

function lineSubtotal(item) {
  const base = Number(item?.base_price ?? 0) || 0;
  const qty = Number(item?.qty ?? 0) || 0;
  return round2(base * qty);
}

/**
 * @returns {{ totalNewBase: number, cheapestIndex: number, ruleLabel: string | null }}
 */
function calculateMixCategoryCheapestHalfOff(items, quote) {
  const { byId, bySku } = buildQuoteItemIndex(quote?.items ?? []);
  let qtyCatA = 0;
  let qtyCatB = 0;
  for (const lineItem of items) {
    const qline = resolveQuoteLineForShippingItem(lineItem, byId, bySku);
    const category = itemCategoryFromSku(lineItem, qline);
    const q = Number(lineItem?.qty ?? 0) || 0;
    if (category === CAT_MIX_A) {
      qtyCatA += q;
    }
    if (category === CAT_MIX_B) {
      qtyCatB += q;
    }
  }

  if (qtyCatA < MIN_QTY_CAT_A || qtyCatB < MIN_QTY_CAT_B) {
    return { cheapestIndex: -1, ruleLabel: null, totalNewBase: 0 };
  }

  const candidateIndices = [];
  for (const [idx, lineItem] of items.entries()) {
    const qline = resolveQuoteLineForShippingItem(lineItem, byId, bySku);
    const category = itemCategoryFromSku(lineItem, qline);
    if (category === CAT_MIX_A || category === CAT_MIX_B) {
      candidateIndices.push(idx);
    }
  }
  if (!candidateIndices.length) {
    return { cheapestIndex: -1, ruleLabel: null, totalNewBase: 0 };
  }

  const lines = candidateIndices.map((idx) => ({
    idx,
    subtotal: lineSubtotal(items[idx]),
  }));
  const cheapest = lines.reduce((best, cur) => {
    if (cur.subtotal < best.subtotal) {
      return cur;
    }
    if (cur.subtotal === best.subtotal && cur.idx < best.idx) {
      return cur;
    }
    return best;
  });

  const lineBase = lineSubtotal(items[cheapest.idx]);
  const discountAmount = round2(lineBase * (DISCOUNT_PERCENT / 100));

  return {
    cheapestIndex: cheapest.idx,
    ruleLabel: RULE_LABEL,
    totalNewBase: discountAmount,
  };
}

function collectCategoryBasedDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    const quote = params.quote ?? {};

    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const { totalNewBase, cheapestIndex, ruleLabel } =
      calculateMixCategoryCheapestHalfOff(items, quote);

    if (totalNewBase <= 0 || !ruleLabel || cheapestIndex < 0) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const item = items[cheapestIndex];
    const qty = Number(item?.qty ?? 0) || 0;
    const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
    const lineStoreSubtotal = round2(storePrice * qty);
    const newStoreDiscount = round2(
      lineStoreSubtotal * (DISCOUNT_PERCENT / 100),
    );

    const existingBase = getExistingItemBaseDiscount(item);
    const existingStore = getExistingItemDiscountAmount(item);
    const combinedBase = round2(existingBase + totalNewBase);
    const combinedStore = round2(existingStore + newStoreDiscount);

    const lineBaseSubtotal = lineSubtotal(item);
    const discountPercent =
      lineBaseSubtotal > 0
        ? Math.round((100 * 10_000 * combinedBase) / lineBaseSubtotal) / 10_000
        : 0;

    const operations = [discountOperation(totalNewBase, { 1: ruleLabel })];

    const idx = cheapestIndex;
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
    );

    discountMetrics.discountRequestsCounter.add(1, { status: "success" });
    return ok(operations);
  } catch (err) {
    logger.error("Error in category-based-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectCategoryBasedDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
