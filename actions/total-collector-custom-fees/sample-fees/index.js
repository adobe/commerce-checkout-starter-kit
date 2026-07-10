/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * Sample App Builder action for the OOPE custom-fees webhook.
 *
 *   Webhook method: plugin.magento.out_of_process_totals_collector.api.get_total_modifications.custom_fees
 *
 * Returns a static set of custom fees only when the cart has fewer than 2
 * items. When the cart has 2 or more items, it returns an empty fees list so
 * previously-applied fees are cleared (used to verify fees clear properly
 * after apply). Each fee is applied by `oope_custom_fee` collector
 * (sort_order 510) and added to `grand_total`. Amounts are in BASE currency;
 * the FeeHandler converts to store currency via PriceCurrencyInterface.
 *
 * Fees with `base_fee <= 0` or empty `code` are silently ignored by FeeHandler.
 */
import {
  webhookErrorResponse,
  webhookVerify,
} from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  getShippingItems,
  parseJsonBody,
} from "../../../lib/total-collector-discounts.js";

/**
 * Edit this list to change which fees the action returns. The webhook accepts
 * any number of entries; each one becomes a separate line on the cart, order,
 * invoice, and credit memo.
 */
const FEES = [
  { code: "processing_fee", label: "Processing Fee", base_fee: 9.99 },
  { code: "handling_fee", label: "Handling & Insurance Fee", base_fee: 4.5 },
  { code: "just_a_fee", label: "Just a Fee", base_fee: 3.33 },
  { code: "just_another_fee", label: "Just another Fee", base_fee: 13.99 },
];

function applySampleFees(params) {
  console.info("sample-fees: received event");
  try {
    // TODO: Temporarily skip webhook verify and signature as local testing doesn't support it
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(`Failed to verify webhook: ${error}`);
    }
    const data = parseJsonBody(params);
    // const data = params;
    console.info("sample-fees: data", JSON.stringify(data));

    // Count actual cart item quantity (units), not shipping-assignment lines.
    // Configurable products expose only the parent line in shippingAssignment,
    // so line count under-reports; `quote.items_qty` reflects the real count.
    const itemCount = getCartItemQty(data);

    if (!itemCount) {
      console.info("sample-fees: empty cart, returning success no-op");
      return successResponse();
    }

    // Only apply fees when the cart has fewer than 2 items. With 2 or more
    // items, return an empty fees list so previously-applied fees are cleared.
    // This exercises the "fees clear properly after apply" path.
    if (itemCount >= 2) {
      console.info(
        `sample-fees: ${itemCount} item(s) >= 2, returning empty fees to clear`,
      );
      return emptyFeesResponse();
    }

    if (!FEES.length) {
      return emptyFeesResponse();
    }

    console.info(
      `sample-fees: returning ${FEES.length} fee(s) for ${itemCount} item(s)`,
    );

    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          op: "replace",
          path: "result/fees",
          value: FEES,
        },
      ]),
    };
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

/**
 * Total number of item units in the cart. Prefers `quote.items_qty` (which
 * excludes configurable child lines); falls back to summing `qty` over the
 * shipping-assignment items when the quote is unavailable.
 */
function getCartItemQty(data) {
  const quote = data?.quote ?? {};
  const quoteQty = Number(quote.items_qty);
  if (quote.items_qty != null && !Number.isNaN(quoteQty)) {
    return quoteQty;
  }
  const items = getShippingItems(data);
  return items.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0);
}

function successResponse() {
  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ op: "success" }]),
  };
}

function emptyFeesResponse() {
  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        op: "replace",
        path: "result/fees",
        value: [],
      },
    ]),
  };
}

export function main(params) {
  const response = applySampleFees(params);
  console.info(`sample-fees: response ${JSON.stringify(response)}`);
  return response;
}
