/**
 * Category spend rule: spend ≥ $150 on **electronics** (SKU suffix after last `-`, e.g.
 * `Tv-electronics` or `Tv-Electronics` → `electronics`) → 15% off those lines only (base subtotal).
 * Stacks new discount on existing `base_discount_amount` (same pattern as `total-collector`).
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
  discountOperation,
  getExistingItemBaseDiscount,
  getShippingItems,
  itemCategoryFromSku,
  itemIdentifierForLookup,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

/** Last segment of SKU after `-`, lowercased (e.g. `Tv-electronics` → `electronics`). */
const TARGET_CATEGORY_NAME = "electronics";
const CATEGORY_SPEND_THRESHOLD = 150;
const CATEGORY_DISCOUNT_PERCENT = 15;

function lineSubtotal(item) {
  const base = Number(item?.base_price ?? 0) || 0;
  const qty = Number(item?.qty ?? 0) || 0;
  return round2(base * qty);
}

function buildQuoteItemIndex(quoteItems) {
  const byId = {};
  const bySku = {};
  for (const qi of quoteItems) {
    if (!qi || typeof qi !== "object") {
      continue;
    }
    if (qi.item_id != null) {
      const idNum = Number(qi.item_id);
      if (!Number.isNaN(idNum)) {
        byId[idNum] = qi;
      }
    }
    if (qi.sku) {
      bySku[qi.sku] = qi;
    }
  }
  return { byId, bySku };
}

function resolveQuoteLineForShippingItem(item, byId, bySku) {
  const iid = itemIdentifierForLookup(item);
  if (iid != null && byId[iid]) {
    return byId[iid];
  }
  if (item.sku && bySku[item.sku]) {
    return bySku[item.sku];
  }
  return null;
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
  return {
    op: "replace",
    path: `shippingAssignment/items/${index}/base_discount_amount`,
    value: round2(combinedAmount),
  };
}

function collectCategorySpendDiscount(params) {
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
    const { byId, bySku } = buildQuoteItemIndex(quote?.items ?? []);

    if (!items.length) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const spendOnCategory = categorySpendSubtotal(items, byId, bySku);
    if (spendOnCategory < CATEGORY_SPEND_THRESHOLD) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
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
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
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
  return collectCategorySpendDiscount(params);
}
