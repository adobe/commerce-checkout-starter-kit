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
 * Applies an additional discount on top of the Adobe Commerce computed base_price
 * (after catalog rules and group pricing). Returns null to leave the price unchanged.
 * Use custom-price instead for a fixed contract price that fully replaces catalog pricing.
 */
function resolveCustomPrice(item, quote) {
  // Example: additional 25% B2B contract reduction for group-1 configurables. Replace with your own logic.
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
