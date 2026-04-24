/**
 * Tiered total-spend discount:
 * Spend $100+ → 10% off, Spend $200+ → 20% off.
 * Applies promo proportionally to each line and stacks with existing line discounts.
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
  getShippingItems,
  parseJsonBody,
  round2,
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

const TIERS = [
  { minSubtotal: 200, percent: 20, label: "Spend $200+ → 20% off" },
  { minSubtotal: 100, percent: 10, label: "Spend $100+ → 10% off" },
];

function lineAmounts(item) {
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
  return {
    lineBase: round2(basePrice * qty),
    lineStore: round2(storePrice * qty),
  };
}

function getTierForSubtotal(baseSubtotal) {
  for (const tier of TIERS) {
    if (baseSubtotal >= tier.minSubtotal) {
      return tier;
    }
  }
  return null;
}

function calculatePromoPerLine(items, percent) {
  let totalBase = 0;
  const perLine = [];
  for (let idx = 0; idx < items.length; idx++) {
    const { lineBase, lineStore } = lineAmounts(items[idx]);
    const promoBase = round2(lineBase * (percent / 100));
    const promoStore = round2(lineStore * (percent / 100));
    totalBase = round2(totalBase + promoBase);
    perLine.push({
      item_index: idx,
      line_base: lineBase,
      line_store: lineStore,
      base_discount: promoBase,
      store_discount: promoStore,
    });
  }
  return { totalBase, perLine };
}

function collectTieredTotalSpendDiscount(params) {
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

    const baseSubtotal = round2(
      items.reduce((sum, item) => sum + lineAmounts(item).lineBase, 0),
    );

    const tier = getTierForSubtotal(baseSubtotal);
    if (!tier) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const { totalBase: totalPromoBase, perLine } = calculatePromoPerLine(
      items,
      tier.percent,
    );
    if (totalPromoBase <= 0) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const operations = [];

    for (const row of perLine) {
      if (row.base_discount <= 0) {
        continue;
      }
      const idx = row.item_index;
      const existing = getExistingItemBaseDiscount(items[idx]);
      const combinedLine = round2(existing + row.base_discount);

      operations.push({
        op: "replace",
        path: `shippingAssignment/items/${idx}/base_discount_amount`,
        value: combinedLine,
      });
    }

    operations.push({
      op: "replace",
      path: "result",
      value: {
        code: "discount",
        // Cart result sends promo-only discount for this rule execution.
        base_discount: Number(totalPromoBase),
        discount_description_array: { 1: tier.label },
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
  return collectTieredTotalSpendDiscount(params);
}
