/**
 * Buy 2+ qty from pizza and 1+ qty from drinks categories (derived from SKU suffix)
 * → 50% off the cheapest participating line.
 * Stacks on existing line discounts like `total-collector`.
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
  discountOperation,
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  itemCategoryFromSku,
  parseJsonBody,
  resolveQuoteLineForShippingItem,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

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
    return { totalNewBase: 0, cheapestIndex: -1, ruleLabel: null };
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
    return { totalNewBase: 0, cheapestIndex: -1, ruleLabel: null };
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
    totalNewBase: discountAmount,
    cheapestIndex: cheapest.idx,
    ruleLabel: RULE_LABEL,
  };
}

function collectCategoryBasedDiscount(params) {
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

    const { totalNewBase, cheapestIndex, ruleLabel } =
      calculateMixCategoryCheapestHalfOff(items, quote);

    if (totalNewBase <= 0 || !ruleLabel || cheapestIndex < 0) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
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
      {
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedBase,
      },
      {
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_amount`,
        value: combinedStore,
      },
      {
        op: "replace",
        path: `shippingAssignment/items/${idx}/discount_percent`,
        value: discountPercent,
      },
    );

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
  return collectCategoryBasedDiscount(params);
}
