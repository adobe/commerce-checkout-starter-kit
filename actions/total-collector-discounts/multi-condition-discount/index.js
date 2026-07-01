/**
 * Multi-condition discount:
 * Buy at least 5 items AND spend $200+ (base subtotal) → 25% off.
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

const MIN_QTY = 5;
const MIN_SUBTOTAL = 200;
const DISCOUNT_PERCENT = 25;
const RULE_LABEL = "Buy at least 5 items & spend $200 or more → 25% off";

function lineAmounts(item) {
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  return {
    lineBase: round2(basePrice * qty),
  };
}

function totalCartQty(items) {
  return items.reduce((sum, item) => sum + (Number(item?.qty ?? 0) || 0), 0);
}

function isEligible(items) {
  if (!items.length) {
    return false;
  }
  const qty = totalCartQty(items);
  const baseSubtotal = round2(
    items.reduce((sum, item) => sum + lineAmounts(item).lineBase, 0),
  );
  return qty >= MIN_QTY && baseSubtotal >= MIN_SUBTOTAL;
}

function collectMultiConditionDiscount(params) {
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

    if (!isEligible(items)) {
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
        discountResultOperation(
          DISCOUNT_PERCENT,
          { 1: RULE_LABEL },
          discountItemIds,
        ),
      ]),
    };
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

export function main(params) {
  return collectMultiConditionDiscount(params);
}
