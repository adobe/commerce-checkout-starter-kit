/**
 * Shared helpers for total-collector discount actions.
 */

export function parseJsonBody(params) {
  if (!params.__ow_body) {
    return null;
  }
  try {
    return JSON.parse(atob(params.__ow_body));
  } catch {
    return null;
  }
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function getShippingItems(webhookData) {
  const assignment =
    webhookData.shippingAssignment ?? webhookData.shipping_assignment ?? {};
  return Array.isArray(assignment.items) ? assignment.items : [];
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
  return {
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: 0,
      discount_description_array: {},
    },
  };
}

export function discountOperation(totalDiscount, descriptionDict) {
  return {
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: Number(totalDiscount),
      discount_description_array: descriptionDict,
    },
  };
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
