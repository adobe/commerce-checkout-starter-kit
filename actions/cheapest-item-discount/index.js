/**
 * Buy 3 shirts (same category) → one unit of the cheapest eligible line free.
 * Category resolution matches Python (quote.items product, extension_attributes.categories, etc.).
 * Stacks promo on existing line discounts like `total-collector`. No signature check.
 *
 * With `raw-http: true`, body is base64 in `__ow_body`.
 */
import { HTTP_OK } from "../../lib/http.js";

const MIN_QTY = 3;
/** Set to the category id that represents “shirts” in your catalog (was 10 in sales2a). */
const SHIRT_CATEGORY_ID = 3;

const RULE_LABEL = `Buy 3 shirts → cheapest free (category ${SHIRT_CATEGORY_ID})`;

function parseJsonBody(params) {
  if (!params.__ow_body) {
    return null;
  }
  try {
    return JSON.parse(atob(params.__ow_body));
  } catch {
    return null;
  }
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function getShippingItems(webhookData) {
  const assignment =
    webhookData.shippingAssignment ?? webhookData.shipping_assignment ?? {};
  return Array.isArray(assignment.items) ? assignment.items : [];
}

function getExistingItemBaseDiscount(item) {
  const raw =
    item.base_discount_amount ??
    item.baseDiscountAmount ??
    item.base_discount ??
    0;
  return round2(Number(raw) || 0);
}

function getExistingItemDiscountAmount(item) {
  return round2(Number(item.discount_amount ?? item.discountAmount ?? 0) || 0);
}

/**
 * @param {Record<number, number[]>} lookup
 * @param {object} row
 */
function mergeCategoryRowIntoLookup(lookup, row) {
  if (!row || typeof row !== "object") {
    return;
  }
  const iid = row.item_id;
  const cats = row.category_ids;
  if (iid == null || !Array.isArray(cats)) {
    return;
  }
  const idNum = Number(iid);
  if (Number.isNaN(idNum)) {
    return;
  }
  lookup[idNum] = cats.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
}

function categoriesLookupFromQuote(quote) {
  if (!quote || typeof quote !== "object") {
    return {};
  }
  const ext = quote.extension_attributes ?? {};
  const raw = ext.categories;
  if (raw == null) {
    return {};
  }
  try {
    const rows = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(rows)) {
      return {};
    }
    /** @type {Record<number, number[]>} */
    const lookup = {};
    for (const row of rows) {
      mergeCategoryRowIntoLookup(lookup, row);
    }
    return lookup;
  } catch {
    return {};
  }
}

function pushIfValidNumber(out, value) {
  const n = Number(value);
  if (!Number.isNaN(n)) {
    out.push(n);
  }
}

function appendCategoriesFromCategoryIdsField(out, raw) {
  if (typeof raw === "string") {
    for (const part of raw.split(",")) {
      pushIfValidNumber(out, part.trim());
    }
  } else if (Array.isArray(raw)) {
    for (const x of raw) {
      pushIfValidNumber(out, x);
    }
  }
}

function categoriesFromProduct(product) {
  if (!product || typeof product !== "object") {
    return [];
  }
  const out = [];
  const cid = product.category_id;
  if (cid != null && String(cid).trim() !== "") {
    pushIfValidNumber(out, cid);
  }
  appendCategoriesFromCategoryIdsField(out, product.category_ids);
  return [...new Set(out)];
}

function quoteProductByItemId(quote) {
  /** @type {Record<number, object>} */
  const out = {};
  const list = quote?.items;
  if (!Array.isArray(list)) {
    return out;
  }
  for (const qi of list) {
    if (!qi || typeof qi !== "object") {
      continue;
    }
    const iid = qi.item_id;
    if (iid == null) {
      continue;
    }
    const idNum = Number(iid);
    if (Number.isNaN(idNum)) {
      continue;
    }
    const prod = qi.product;
    if (prod && typeof prod === "object") {
      out[idNum] = prod;
    }
  }
  return out;
}

function itemIdentifierForLookup(item) {
  for (const key of ["item_id", "id"]) {
    const iid = item[key];
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

function categoryIdsFromItemExtensionFields(item) {
  let raw = item.category_ids ?? item.categoryIds;
  if (raw == null && item.extension_attributes) {
    raw = item.extension_attributes.category_ids;
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
  }
  return [];
}

function parseCategoryIdsForItem(item, lookupByItemId, productByItemId) {
  let ids = categoriesFromProduct(item.product);

  if (!ids.length) {
    const iid = itemIdentifierForLookup(item);
    if (iid != null && productByItemId[iid]) {
      ids = categoriesFromProduct(productByItemId[iid]);
    }
  }

  if (!ids.length) {
    ids = categoryIdsFromItemExtensionFields(item);
  }

  if (!ids.length) {
    const iid = itemIdentifierForLookup(item);
    if (iid != null && lookupByItemId[iid]) {
      ids = lookupByItemId[iid];
    }
  }

  return ids;
}

function itemInCategory(item, categoryId, lookupByItemId, productByItemId) {
  const target = Number(categoryId);
  if (Number.isNaN(target)) {
    return false;
  }
  return parseCategoryIdsForItem(
    item,
    lookupByItemId,
    productByItemId,
  ).includes(target);
}

/**
 * @returns {{ totalNewBase: number, cheapestIndex: number, ruleLabel: string | null }}
 */
function calculateCheapestFree(items, quote) {
  const lookup = categoriesLookupFromQuote(quote);
  const productByItemId = quoteProductByItemId(quote);

  const eligibleIndices = [];
  let totalEligibleQty = 0;
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (itemInCategory(item, SHIRT_CATEGORY_ID, lookup, productByItemId)) {
      eligibleIndices.push(idx);
      totalEligibleQty += Number(item?.qty ?? 0) || 0;
    }
  }

  if (totalEligibleQty < MIN_QTY) {
    return { totalNewBase: 0, cheapestIndex: -1, ruleLabel: null };
  }

  /** @type {Array<{ idx: number; baseUnit: number; qty: number }>} */
  const lines = [];
  for (const idx of eligibleIndices) {
    const item = items[idx];
    const baseUnit = Number(item?.base_price ?? 0) || 0;
    const qty = Number(item?.qty ?? 0) || 0;
    lines.push({ idx, baseUnit, qty });
  }

  const cheapest = lines.reduce((best, cur) => {
    if (cur.baseUnit < best.baseUnit) {
      return cur;
    }
    if (cur.baseUnit === best.baseUnit && cur.idx < best.idx) {
      return cur;
    }
    return best;
  });

  const lineQty = cheapest.qty;
  const freeUnits = lineQty > 0 ? Math.min(1, lineQty) : 0;
  const unitDiscountBase = round2(cheapest.baseUnit * freeUnits);

  return {
    totalNewBase: unitDiscountBase,
    cheapestIndex: cheapest.idx,
    ruleLabel: RULE_LABEL,
  };
}

function zeroDiscountOperation() {
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

function collectCheapestItemDiscount(params) {
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
  const quote = data.quote ?? {};

  if (!items.length) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const { totalNewBase, cheapestIndex, ruleLabel } = calculateCheapestFree(
    items,
    quote,
  );

  if (totalNewBase <= 0 || !ruleLabel || cheapestIndex < 0) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const item = items[cheapestIndex];
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
  const freeUnits = qty > 0 ? Math.min(1, qty) : 0;
  const newStoreDiscount = round2(storePrice * freeUnits);

  const existingBase = getExistingItemBaseDiscount(item);
  const existingStore = getExistingItemDiscountAmount(item);
  const combinedBase = round2(existingBase + totalNewBase);
  const combinedStore = round2(existingStore + newStoreDiscount);

  const lineBaseSubtotal = round2(basePrice * qty);
  const discountPercent =
    lineBaseSubtotal > 0
      ? Math.round((100 * 10_000 * combinedBase) / lineBaseSubtotal) / 10_000
      : 0;

  const operations = [];

  const idx = cheapestIndex;
  operations.push({
    op: "replace",
    path: `shippingAssignment/items/${idx}/base_discount_amount`,
    value: combinedBase,
  });
  operations.push({
    op: "replace",
    path: `shippingAssignment/items/${idx}/discount_amount`,
    value: combinedStore,
  });
  operations.push({
    op: "replace",
    path: `shippingAssignment/items/${idx}/discount_percent`,
    value: discountPercent,
  });
  operations.push({
    op: "replace",
    path: "result",
    value: {
      code: "discount",
      base_discount: Number(totalNewBase),
      discount_description_array: { 1: ruleLabel },
    },
  });

  return {
    statusCode: HTTP_OK,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operations),
  };
}

export function main(params) {
  return collectCheapestItemDiscount(params);
}
