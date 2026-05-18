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
import { webhookErrorResponse } from "../../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../../lib/http.js";
import {
  getShippingItems,
  round2,
} from "../../../lib/total-collector-discounts.js";

/**
 * Return the custom base price for an item, or null to leave the price unchanged.
 *
 * `item` fields available (from shippingAssignment.items):
 *   item_id       — quote item ID (use this in price_updates)
 *   sku           — child SKU for configurables (e.g. "IMAGEFORCEC5140-print_finish-Standard Flat Rate")
 *   base_price    — current unit base price in store base currency
 *   price         — current unit price in store display currency
 *   qty           — quantity in cart
 *   product_type  — "simple" | "configurable" | "bundle" etc.
 *
 * Replace with a lookup against your external pricing system, B2B catalog,
 * or customer-group contract table.
 *
 * @param {object} item
 * @param {object} quote
 * @returns {number|null}
 */
function resolveCustomPrice(item, quote) {
  // Example: apply a flat 25% B2B contract discount for configurable products
  // in customer group 1 (Wholesale). Replace with your own logic.
  const customerGroupId = Number(quote?.customer_group_id ?? -1);
  if (customerGroupId !== 1) {
    return null;
  }
  if (item.product_type !== "configurable") {
    return null;
  }

  const basePrice = Number(item.base_price ?? 0);
  if (basePrice <= 0) {
    return null;
  }

  return round2(basePrice * 0.75);
}

function applyItemPriceUpdate(params) {
  console.info("item-price-update: received event");
  try {
    // TODO: Temporarily skip webhook verify and signature as local testing doesn't support it
    // const { success, error } = webhookVerify(params);
    // if (!success) return webhookErrorResponse(`Failed to verify webhook: ${error}`);
    // const data = parseJsonBody(params);

    const data = params;
    const items = getShippingItems(data);
    const quote = data.quote ?? {};

    if (!items.length) {
      return itemPriceResponse([]);
    }

    const priceUpdates = [];

    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const itemId = resolveItemId(item);
      if (itemId == null) {
        continue;
      }

      const customPrice = resolveCustomPrice(item, quote);
      if (customPrice == null) {
        continue;
      }

      priceUpdates.push({ item_id: itemId, base_price: customPrice });
    }

    return itemPriceResponse(priceUpdates);
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

function resolveItemId(item) {
  for (const key of ["item_id", "id"]) {
    const v = item[key];
    if (v != null) {
      const n = Number(v);
      if (!Number.isNaN(n)) {
        return n;
      }
    }
  }
  return null;
}

function itemPriceResponse(priceUpdates) {
  // When nothing to update, return the no-op success operation rather than
  // writing to path:result, which would overwrite another hook's result in the
  // same batch (e.g. a discount hook) and break its DiscountHandler check.
  const operations = priceUpdates.length
    ? [
        {
          op: "replace",
          path: "result",
          value: { code: "item_price", price_updates: priceUpdates },
        },
      ]
    : [{ op: "success" }];
  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operations),
  };
}

export function main(params) {
  return applyItemPriceUpdate(params);
}
