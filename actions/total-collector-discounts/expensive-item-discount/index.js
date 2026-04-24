/**
 * Buy 3+ units in **wine** (SKU suffix after last `-`, e.g. `red-wine` → `wine`) → 30% off
 * the full line (qty × base price) on the most expensive eligible line.
 * Enriches shipping lines from `quote.items` (by item_id / sku) when prices are missing.
 * Stacks promo on existing discounts like `total-collector` / `cheapest-item-discount`.
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
/** Last segment of SKU after `-`, lowercased (e.g. `red-wine` → `wine`). */
const TARGET_CATEGORY_NAME = "wine";
const DISCOUNT_PERCENT = 30;

const RULE_LABEL = `Buy 3+ from ${TARGET_CATEGORY_NAME} (SKU) → ${DISCOUNT_PERCENT}% off full qty on most expensive line`;

function mergeQuoteProductOntoLine(item, qline) {
  const prod = item.product;
  const emptyProd =
    prod == null ||
    (typeof prod === "object" && Object.keys(prod).length === 0);
  if (emptyProd) {
    const qp = qline.product;
    if (qp && typeof qp === "object") {
      item.product = qp;
    }
  }
  for (const key of ["base_price", "price", "qty"]) {
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
    return { totalNewBase: 0, expensiveIndex: -1, ruleLabel: null };
  }

  /** @type {Array<{ idx: number; subtotal: number; item: object }>} */
  const lines = [];
  for (const idx of eligibleIndices) {
    const item = items[idx];
    const basePrice = Number(item?.base_price ?? 0) || 0;
    const qty = Number(item?.qty ?? 0) || 0;
    lines.push({
      idx,
      subtotal: round2(basePrice * qty),
      item,
    });
  }

  if (!lines.length) {
    return { totalNewBase: 0, expensiveIndex: -1, ruleLabel: null };
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
    totalNewBase: discountAmount,
    expensiveIndex: expensive.idx,
    ruleLabel: RULE_LABEL,
  };
}

function collectExpensiveItemDiscount(params) {
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

    enrichShippingItemsFromQuoteItems(items, quote);

    const { totalNewBase, expensiveIndex, ruleLabel } =
      calculateMostExpensiveDiscount(items, quote);

    if (totalNewBase <= 0 || !ruleLabel || expensiveIndex < 0) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
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

    const operations = [];
    const idx = expensiveIndex;

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
  return collectExpensiveItemDiscount(params);
}
