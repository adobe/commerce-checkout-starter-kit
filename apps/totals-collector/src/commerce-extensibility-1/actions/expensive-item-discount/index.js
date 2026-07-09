/**
 * Buy 3+ units in **wine** (SKU suffix after last `-`, e.g. `red-wine` → `wine`) → 30% off
 * the full line (qty × base price) on the most expensive eligible line.
 * Enriches shipping lines from `quote.items` (by item_id / sku) when prices are missing.
 * Stacks promo on existing discounts like `total-collector` / `cheapest-item-discount`.
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
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../lib/total-collector-discounts.js";
import { discountMetrics } from "../discount-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

const MIN_QTY = 3;
/** Last segment of SKU after `-`, lowercased (e.g. `red-wine` → `wine`). */
const TARGET_CATEGORY_NAME = "wine";
const DISCOUNT_PERCENT = 30;

const RULE_LABEL = `Buy 3+ from ${TARGET_CATEGORY_NAME} (SKU) → ${DISCOUNT_PERCENT}% off full qty on most expensive line`;

function mergeQuoteProductOntoLine(item, qline) {
  const prod = item.product;
  const emptyProd =
    // biome-ignore lint/suspicious/noEqualsToNull: prod may be undefined (missing property), not just null
    prod == null ||
    (typeof prod === "object" && Object.keys(prod).length === 0);
  if (emptyProd) {
    const qp = qline.product;
    if (qp && typeof qp === "object") {
      item.product = qp;
    }
  }
  for (const key of ["base_price", "price", "qty"]) {
    // biome-ignore lint/suspicious/noEqualsToNull: item[key]/qline[key] may be undefined (missing property), not just null
    if (item[key] == null && qline[key] != null) {
      item[key] = qline[key];
    }
  }
}

/** Merge `quote.items` product/prices onto shipping lines when needed (sales2c). */
function enrichShippingItemsFromQuoteItems(items, quote) {
  if (!(Array.isArray(items) && items.length)) {
    return;
  }
  const quoteItems = quote?.items;
  if (!(Array.isArray(quoteItems) && quoteItems.length)) {
    return;
  }

  const { byId, bySku } = buildQuoteItemIndex(quoteItems);

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const qline = resolveQuoteLineForShippingItem(item, byId, bySku);
    if (!qline) {
      continue;
    }
    mergeQuoteProductOntoLine(item, qline);
  }
}

/**
 * @returns {{ totalNewBase: number, expensiveIndex: number, ruleLabel: string | null }}
 */
function calculateMostExpensiveDiscount(items, quote) {
  const { byId, bySku } = buildQuoteItemIndex(quote?.items ?? []);

  const eligibleIndices = [];
  let totalEligibleQty = 0;
  for (const [idx, lineItem] of items.entries()) {
    const qline = resolveQuoteLineForShippingItem(lineItem, byId, bySku);
    const category = itemCategoryFromSku(lineItem, qline);
    if (category === TARGET_CATEGORY_NAME) {
      eligibleIndices.push(idx);
      totalEligibleQty += Number(lineItem?.qty ?? 0) || 0;
    }
  }

  if (totalEligibleQty < MIN_QTY) {
    return { expensiveIndex: -1, ruleLabel: null, totalNewBase: 0 };
  }

  /** @type {Array<{ idx: number; subtotal: number; item: object }>} */
  const lines = [];
  for (const idx of eligibleIndices) {
    const item = items[idx];
    const basePrice = Number(item?.base_price ?? 0) || 0;
    const qty = Number(item?.qty ?? 0) || 0;
    lines.push({
      idx,
      item,
      subtotal: round2(basePrice * qty),
    });
  }

  if (!lines.length) {
    return { expensiveIndex: -1, ruleLabel: null, totalNewBase: 0 };
  }

  const expensive = lines.reduce((best, cur) => {
    if (cur.subtotal > best.subtotal) {
      return cur;
    }
    if (cur.subtotal === best.subtotal && cur.idx > best.idx) {
      return cur;
    }
    return best;
  });

  const discountAmount = round2(expensive.subtotal * (DISCOUNT_PERCENT / 100));

  return {
    expensiveIndex: expensive.idx,
    ruleLabel: RULE_LABEL,
    totalNewBase: discountAmount,
  };
}

function collectExpensiveItemDiscount(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    const items = getShippingItems(params);
    const quote = params.quote ?? {};

    if (!items.length) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    enrichShippingItemsFromQuoteItems(items, quote);

    const { totalNewBase, expensiveIndex, ruleLabel } =
      calculateMostExpensiveDiscount(items, quote);

    if (totalNewBase <= 0 || !ruleLabel || expensiveIndex < 0) {
      discountMetrics.discountRequestsCounter.add(1, { status: "zero" });
      return ok(zeroDiscountOperation());
    }

    const item = items[expensiveIndex];
    const qty = Number(item?.qty ?? 0) || 0;
    const basePrice = Number(item?.base_price ?? 0) || 0;
    const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
    const lineBaseSubtotal = round2(basePrice * qty);
    const lineStoreSubtotal = round2(storePrice * qty);
    const newStoreDiscount = round2(
      lineStoreSubtotal * (DISCOUNT_PERCENT / 100),
    );

    const existingBase = getExistingItemBaseDiscount(item);
    const existingStore = getExistingItemDiscountAmount(item);
    const combinedBase = round2(existingBase + totalNewBase);
    const combinedStore = round2(existingStore + newStoreDiscount);
    const discountPercent =
      lineBaseSubtotal > 0
        ? Math.round((100 * 10_000 * combinedBase) / lineBaseSubtotal) / 10_000
        : 0;

    const idx = expensiveIndex;
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
    logger.error("Error in expensive-item-discount:", err);
    discountMetrics.discountRequestsCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectExpensiveItemDiscount, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
