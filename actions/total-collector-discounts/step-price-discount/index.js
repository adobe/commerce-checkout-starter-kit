/**
 * Cart-wide **step % off** by total cart qty : 1 → 20%, 2 → 35%, 3+ → 45% of
 * **cart** base/store subtotals. Promo is split across lines by subtotal share, then stacked on
 * existing discounts like `total-collector`.
 *
 * With `raw-http: true`, body is base64 in `__ow_body`. Verifies
 * `x-adobe-commerce-webhook-signature` like `collect-taxes` (requires
 * `COMMERCE_WEBHOOKS_PUBLIC_KEY` on the action).
 */
// import {
//   webhookErrorResponse,
//   webhookVerify,
// } from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  discountResultOperation,
  getShippingAssignmentItemIds,
  getShippingItems,
  parseJsonBody,
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

function collectStepPriceDiscount(params) {
  // try {
  //   const { success, error } = webhookVerify(params);
  //   if (!success) {
  //     return webhookErrorResponse(
  //       `Failed to verify the webhook signature: ${error}`,
  //     );
  //   }

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
  const discountItemIds = getShippingAssignmentItemIds(items);

  if (!items.length) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const totalQty = totalCartQty(items);
  const { percent, tierNote } = tierPercentByTotalQty(totalQty);

  if (percent == null || percent <= 0) {
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
        percent,
        { 1: `${RULE_LABEL} (${tierNote})` },
        discountItemIds,
      ),
    ]),
  };
  // } catch (err) {
  //   return webhookErrorResponse(`Server error: ${err.message}`);
  // }
}

export function main(params) {
  return collectStepPriceDiscount(params);
}
