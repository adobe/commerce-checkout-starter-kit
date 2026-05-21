/**
 * Quantity-tiered discount webhook.
 * Buy 3+ → 10% off; Buy 6+ → 15% off.
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
  zeroDiscountOperation,
} from "../../../lib/total-collector-discounts.js";

const QTY_TIER_1 = 3;
const QTY_TIER_2 = 6;
const PERCENT_TIER_1 = 10;
const PERCENT_TIER_2 = 15;

const RULE_LABEL_TIER_1 = "Buy 3+ → 10% off";
const RULE_LABEL_TIER_2 = "Buy 6+ → 15% off";

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

/** @returns {{ percent: number; ruleLabel: string } | { percent: null; ruleLabel: null }} */
function tierPercentForQty(totalQty) {
  if (totalQty >= QTY_TIER_2) {
    return { percent: PERCENT_TIER_2, ruleLabel: RULE_LABEL_TIER_2 };
  }
  if (totalQty >= QTY_TIER_1) {
    return { percent: PERCENT_TIER_1, ruleLabel: RULE_LABEL_TIER_1 };
  }
  return { percent: null, ruleLabel: null };
}

function collectTieredQuantityDiscount(params) {
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
    const { percent, ruleLabel } = tierPercentForQty(totalQty);

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
  return collectTieredQuantityDiscount(params);
}
