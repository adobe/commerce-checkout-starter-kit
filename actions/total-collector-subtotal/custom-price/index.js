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

/** SKU → custom base price overrides. Replace with your own pricing logic. */
const PRICE_OVERRIDES = {
  "WS12-XS-Blue": 15.0,
};

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

function applyCustomPrice(params) {
  console.info("custom-price: received event");
  try {
    // TODO: Temporarily skip webhook verify and signature as local testing doesn't support it
    // const { success, error } = webhookVerify(params);
    // if (!success) return webhookErrorResponse(`Failed to verify webhook: ${error}`);
    // const data = parseJsonBody(params);

    const data = params;
    const items = getShippingItems(data);
    if (!items.length) {
      return successResponse();
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

      const sku = item.sku ?? item.product?.sku;
      if (!sku) {
        continue;
      }

      if (Object.hasOwn(PRICE_OVERRIDES, sku)) {
        priceUpdates.push({
          item_id: itemId,
          base_price: round2(PRICE_OVERRIDES[sku]),
        });
        console.info(
          `custom-price: override SKU=${sku} item_id=${itemId} -> ${PRICE_OVERRIDES[sku]}`,
        );
      }
    }

    if (!priceUpdates.length) {
      return successResponse();
    }

    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          op: "replace",
          path: "result",
          value: { code: "item_price", price_updates: priceUpdates },
        },
      ]),
    };
  } catch (err) {
    return webhookErrorResponse(`Server error: ${err.message}`);
  }
}

function successResponse() {
  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ op: "success" }]),
  };
}

export function main(params) {
  return applyCustomPrice(params);
}
