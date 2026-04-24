/**
 * Cart-wide **step % off** by total cart qty : 1 → 20%, 2 → 35%, 3+ → 45% of
 * **cart** base/store subtotals. Promo is split across lines by subtotal share, then stacked on
 * existing discounts like `total-collector`.
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
  getExistingItemBaseDiscount,
  getExistingItemDiscountAmount,
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

const STEP_MIN_QTY_3 = 3;
const STEP_PCT_3PLUS = 45;
const STEP_MIN_QTY_2 = 2;
const STEP_PCT_2 = 35;
const STEP_MIN_QTY_1 = 1;
const STEP_PCT_1 = 20;

const RULE_LABEL =
  "Step % by cart qty: 1 → 20%, 2 → 35%, 3+ → 45% off subtotal";

function lineAmounts(item) {
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
  return {
    lineBase: round2(basePrice * qty),
    lineStore: round2(storePrice * qty),
  };
}

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

/**
 * Split **new** step discount across lines by subtotal share; last line absorbs rounding.
 * Returns promo-only base_discount / store_discount per line (before stacking).
 */
function proportionalLineNewDiscounts(
  items,
  totalBaseDiscount,
  totalStoreDiscount,
) {
  const lines = items.map((item, idx) => {
    const { lineBase, lineStore } = lineAmounts(item);
    return { item_index: idx, line_base: lineBase, line_store: lineStore };
  });

  const baseSub = round2(lines.reduce((s, r) => s + r.line_base, 0));
  const storeSub = round2(lines.reduce((s, r) => s + r.line_store, 0));

  if (baseSub <= 0 || totalBaseDiscount <= 0) {
    return lines.map((row) => ({
      ...row,
      base_discount: 0,
      store_discount: 0,
    }));
  }

  let remainB = totalBaseDiscount;
  let remainS = totalStoreDiscount;
  const n = lines.length;
  const out = [];

  for (let i = 0; i < n; i++) {
    const row = lines[i];
    let bd;
    let sd;
    if (i < n - 1) {
      const share = row.line_base / baseSub;
      bd = round2(totalBaseDiscount * share);
      sd =
        storeSub > 0
          ? round2(totalStoreDiscount * (row.line_store / storeSub))
          : 0;
      remainB = round2(remainB - bd);
      remainS = round2(remainS - sd);
    } else {
      bd = round2(remainB);
      sd = round2(remainS);
    }
    out.push({ ...row, base_discount: bd, store_discount: sd });
  }
  return out;
}

function collectStepPriceDiscount(params) {
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
    if (!items.length) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const totalQty = totalCartQty(items);
    const baseSubtotal = round2(
      items.reduce((s, it) => s + lineAmounts(it).lineBase, 0),
    );
    const storeSubtotal = round2(
      items.reduce((s, it) => s + lineAmounts(it).lineStore, 0),
    );

    const { percent, tierNote } = tierPercentByTotalQty(totalQty);

    if (percent == null) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const totalPromoBase = round2((baseSubtotal * percent) / 100);
    const totalPromoStore = round2((storeSubtotal * percent) / 100);

    if (totalPromoBase <= 0) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const perLine = proportionalLineNewDiscounts(
      items,
      totalPromoBase,
      totalPromoStore,
    );

    const operations = [];

    for (const row of perLine) {
      if (row.base_discount <= 0) {
        continue;
      }
      const idx = row.item_index;
      const item = items[idx];
      const existingBase = getExistingItemBaseDiscount(item);
      const existingStore = getExistingItemDiscountAmount(item);
      const combinedBase = round2(existingBase + row.base_discount);
      const combinedStore = round2(existingStore + row.store_discount);

      const discountPercent =
        row.line_base > 0
          ? Math.round((100 * 10_000 * combinedBase) / row.line_base) / 10_000
          : 0;

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
    }

    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        base_discount: Number(totalPromoBase),
        discount_description_array: {
          1: `${RULE_LABEL} (${tierNote})`,
        },
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
  return collectStepPriceDiscount(params);
}
