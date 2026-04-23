/**
 * Buy 3 shirts → one unit of the cheapest eligible line free.
 * Eligibility uses category name from SKU suffix (see `itemCategoryFromSku` in lib).
 * Stacks promo on existing line discounts like `total-collector`.
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
  buildQuoteItemIndex,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

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
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qline = resolveQuoteLineForShippingItem(item, byId, bySku);
    const category = itemCategoryFromSku(item, qline);
    if (category === SHIRT_CATEGORY_NAME) {
      eligibleIndices.push(idx);
      totalEligibleQty += Number(item?.qty ?? 0) || 0;
    }
  }

  if (totalEligibleQty < MIN_QTY) {
    return { totalNewBase: 0, cheapestIndex: -1, ruleLabel: null };
  }

  /** @type {Array<{ idx: number; baseUnit: number; qty: number }>} */
  const lines = [];
  for (const idx of eligibleIndices) {
    const item = items[idx];
    const baseUnit = Number(item?.base_price ?? 0) || 0;
    const qty = Number(item?.qty ?? 0) || 0;
    lines.push({ idx, baseUnit, qty });
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
    totalNewBase: unitDiscountBase,
    cheapestIndex: cheapest.idx,
    ruleLabel: RULE_LABEL,
  };
}

function collectCheapestItemDiscount(params) {
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
    const quote = data.quote ?? {};

    if (!items.length) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const { totalNewBase, cheapestIndex, ruleLabel } = calculateCheapestFree(
      items,
      quote,
    );

    if (totalNewBase <= 0 || !ruleLabel || cheapestIndex < 0) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
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

    const operations = [];

    const idx = cheapestIndex;
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/base_discount_amount`,
      value: combinedBase,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_amount`,
      value: combinedStore,
    });
    operations.push({
      op: "replace",
      path: `shippingAssignment/items/${idx}/discount_percent`,
      value: discountPercent,
    });
    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalNewBase),
        discount_description_array: { 1: ruleLabel },
      },
    });

    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operations),
    };
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

export function main(params) {
  return collectCheapestItemDiscount(params);
}
