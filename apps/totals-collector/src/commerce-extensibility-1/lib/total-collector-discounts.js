/**
 * Shared helpers for total-collector discount actions.
 */

import { replaceOperation } from "@adobe/aio-commerce-sdk/webhooks/responses";

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function getShippingItems(webhookData) {
  const assignment =
    webhookData.shippingAssignment ?? webhookData.shipping_assignment ?? {};
  return Array.isArray(assignment.items) ? assignment.items : [];
}

/** One `item_id` per `shippingAssignment.items` entry, e.g. `[1, 2, 3, 4]`. */
export function getShippingAssignmentItemIds(shippingItems) {
  return shippingItems.map((item) => Number(item?.item_id ?? item?.id));
}

/** Numeric `item_id` or `id` from a shipping line, for matching `quote.items`. */
export function itemIdentifierForLookup(item) {
  for (const key of ["item_id", "id"]) {
    const iid = item[key];
    // biome-ignore lint/suspicious/noEqualsToNull: item[key] may be undefined (missing property), not just null
    if (iid == null) {
      continue;
    }
    const n = Number(iid);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return null;
}

/** Map `quote.items` by numeric `item_id` and by `sku` for shipping-line lookup. */
export function buildQuoteItemIndex(quoteItems) {
  const byId = {};
  const bySku = {};
  for (const qi of quoteItems) {
    if (!qi || typeof qi !== "object") {
      continue;
    }
    // biome-ignore lint/suspicious/noEqualsToNull: qi.item_id may be undefined (missing property), not just null
    if (qi.item_id != null) {
      const idNum = Number(qi.item_id);
      if (!Number.isNaN(idNum)) {
        byId[idNum] = qi;
      }
    }
    if (qi.sku) {
      bySku[qi.sku] = qi;
    }
  }
  return { byId, bySku };
}

/** Match a shipping assignment line to `quote.items` via id or SKU. */
export function resolveQuoteLineForShippingItem(item, byId, bySku) {
  const iid = itemIdentifierForLookup(item);
  if (iid !== null && byId[iid]) {
    return byId[iid];
  }
  if (item.sku && bySku[item.sku]) {
    return bySku[item.sku];
  }
  return null;
}

export function getExistingItemBaseDiscount(item) {
  const raw =
    item.base_discount_amount ??
    item.baseDiscountAmount ??
    item.base_discount ??
    0;
  return round2(Number(raw) || 0);
}

export function getExistingItemDiscountAmount(item) {
  return round2(Number(item.discount_amount ?? item.discountAmount ?? 0) || 0);
}

export function zeroDiscountOperation() {
  return replaceOperation("result", {
    base_discount: 0,
    code: "discount",
    discount_description_array: {},
  });
}

export function discountOperation(totalDiscount, descriptionDict) {
  return replaceOperation("result", {
    base_discount: Number(totalDiscount),
    code: "discount",
    discount_description_array: descriptionDict,
  });
}

/** Single `result` replace: percentage discount scoped to `discountItemIds`. */
export function discountResultOperation(
  percent,
  descriptionDict,
  discountItemIds,
) {
  return replaceOperation("result", {
    base_discount: Number(percent),
    code: "discount",
    discount_description_array: descriptionDict,
    discount_item_id_array: discountItemIds,
    discount_type: "percentage",
  });
}

function categoryFromSku(sku) {
  if (typeof sku !== "string") {
    return null;
  }
  const normalized = sku.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const parts = normalized.split("-").filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return parts.at(-1);
}

// Testing-only approach: derive category from SKU at runtime.
// For production, call a category API by SKU to fetch authoritative product category data.
export function itemCategoryFromSku(item, quoteLine) {
  const lineSku = item?.sku ?? item?.product?.sku;
  const quoteSku = quoteLine?.sku ?? quoteLine?.product?.sku;
  return categoryFromSku(lineSku) ?? categoryFromSku(quoteSku);
}
