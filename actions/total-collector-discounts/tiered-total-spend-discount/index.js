/**
 * Tiered total-spend discount:
 * Spend $100+ → 10% off, Spend $200+ → 20% off.
 * When eligible, returns a single `result` replace with percent and all line ids.
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
  discountResultOperation,
  getShippingAssignmentItemIds,
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
  return {
    lineBase: round2(basePrice * qty),
  };
}

function cartBaseSubtotal(items) {
  return round2(
    items.reduce((sum, item) => sum + lineAmounts(item).lineBase, 0),
  );
}

/** @returns {{ percent: number; ruleLabel: string } | { percent: null; ruleLabel: null }} */
function tierPercentForSubtotal(baseSubtotal) {
  for (const tier of TIERS) {
    if (baseSubtotal >= tier.minSubtotal) {
      return { percent: tier.percent, ruleLabel: tier.label };
    }
  }
  return { percent: null, ruleLabel: null };
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

    const baseSubtotal = cartBaseSubtotal(items);
    const { percent, ruleLabel } = tierPercentForSubtotal(baseSubtotal);

    if (percent == null || percent <= 0 || !ruleLabel) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    const discountItemIds = getShippingAssignmentItemIds(items).filter(
      (id) => !Number.isNaN(id),
    );

    if (!discountItemIds.length) {
      return {
        statusCode: HTTP_OK,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([zeroDiscountOperation()]),
      };
    }

    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        discountResultOperation(percent, { 1: ruleLabel }, discountItemIds),
      ]),
    };
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

export function main(params) {
  return collectTieredTotalSpendDiscount(params);
}
