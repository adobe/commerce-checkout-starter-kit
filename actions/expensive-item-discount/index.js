/**
 * Buy 3+ units in category 3 → 30% off the full line (qty × price) on the most expensive eligible line (`sales2c.py`).
 * Enriches shipping lines from `quote.items` (by item_id / sku) when categories are missing.
 * Stacks promo on existing discounts like `total-collector` / `cheapest-item-discount`. No signature check.
 *
 * With `raw-http: true`, body is base64 in `__ow_body`.
 */
import { HTTP_OK } from "../../lib/http.js";

const MIN_QTY = 3;
const TARGET_CATEGORY_ID = 3;
const DISCOUNT_PERCENT = 30;

const RULE_LABEL = `Buy 3 from category ${TARGET_CATEGORY_ID} → ${DISCOUNT_PERCENT}% off full qty on most expensive line`;

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: quote extension categories map kept explicit (Commerce payload shape).
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
      if (!row || typeof row !== "object") {
        continue;
      }
      const iid = row.item_id;
      const cats = row.category_ids;
      if (iid == null || !Array.isArray(cats)) {
        continue;
      }
      const idNum = Number(iid);
      if (Number.isNaN(idNum)) {
        continue;
      }
      lookup[idNum] = cats
        .map((x) => Number(x))
        .filter((n) => !Number.isNaN(n));
    }
    return lookup;
  } catch {
    return {};
  }
}

/** @param {number[]} out */
function pushIfValidNumber(out, n) {
  if (!Number.isNaN(n)) {
    out.push(n);
  }
}

/** @param {number[]} out @param {unknown} raw */
function appendCategoryIdsFromRaw(out, raw) {
  if (typeof raw === "string") {
    for (const part of raw.split(",")) {
      pushIfValidNumber(out, Number(part.trim()));
    }
  } else if (Array.isArray(raw)) {
    for (const x of raw) {
      pushIfValidNumber(out, Number(x));
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
    pushIfValidNumber(out, Number(cid));
  }
  appendCategoryIdsFromRaw(out, product.category_ids);
  return [...new Set(out)];
}

function productDictHasCategories(prod) {
  return !!(
    prod &&
    typeof prod === "object" &&
    categoriesFromProduct(prod).length
  );
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
    if (productDictHasCategories(prod)) {
      out[idNum] = prod;
    } else if (prod && typeof prod === "object") {
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

function categoryIdsFromItemOrExtension(item) {
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
  let prodOnLine = item.product;
  if (
    typeof prodOnLine === "object" &&
    prodOnLine !== null &&
    Object.keys(prodOnLine).length === 0
  ) {
    prodOnLine = null;
  }

  let ids = categoriesFromProduct(prodOnLine ?? undefined);

  if (!ids.length) {
    const iid = itemIdentifierForLookup(item);
    if (iid != null && productByItemId[iid]) {
      ids = categoriesFromProduct(productByItemId[iid]);
    }
  }

  if (!ids.length) {
    ids = categoryIdsFromItemOrExtension(item);
  }

  if (!ids.length) {
    const iid = itemIdentifierForLookup(item);
    if (iid != null && lookupByItemId[iid]) {
      ids = lookupByItemId[iid];
    }
  }

  return ids;
}

function buildQuoteItemIndex(quoteItems) {
  const byId = {};
  const bySku = {};
  for (const qi of quoteItems) {
    if (!qi || typeof qi !== "object") {
      continue;
    }
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

function resolveQuoteLineForShippingItem(item, byId, bySku) {
  const iid = itemIdentifierForLookup(item);
  if (iid != null && byId[iid]) {
    return byId[iid];
  }
  if (item.sku && bySku[item.sku]) {
    return bySku[item.sku];
  }
  return null;
}

function mergeQuoteProductOntoLine(item, qline) {
  if (!productDictHasCategories(item.product)) {
    const qp = qline.product;
    if (qp && typeof qp === "object") {
      item.product = qp;
    }
  }
  for (const key of ["base_price", "price", "qty"]) {
    if (item[key] == null && qline[key] != null) {
      item[key] = qline[key];
    }
  }
}

/** Merge `quote.items` product/prices onto shipping lines when needed (sales2c). */
function enrichShippingItemsFromQuoteItems(items, quote) {
  if (!(Array.isArray(items) && items.length)) {
    return;
  }
  const quoteItems = quote?.items;
  if (!(Array.isArray(quoteItems) && quoteItems.length)) {
    return;
  }

  const { byId, bySku } = buildQuoteItemIndex(quoteItems);

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const qline = resolveQuoteLineForShippingItem(item, byId, bySku);
    if (!qline) {
      continue;
    }
    mergeQuoteProductOntoLine(item, qline);
  }
}

/**
 * @returns {{ totalNewBase: number, expensiveIndex: number, ruleLabel: string | null }}
 */
function calculateMostExpensiveDiscount(items, quote) {
  const lookup = categoriesLookupFromQuote(quote);
  const productByItemId = quoteProductByItemId(quote);

  const eligibleIndices = [];
  let totalEligibleQty = 0;
  for (const [idx, lineItem] of items.entries()) {
    const cats = parseCategoryIdsForItem(lineItem, lookup, productByItemId);
    if (cats.includes(TARGET_CATEGORY_ID)) {
      eligibleIndices.push(idx);
      totalEligibleQty += Number(lineItem?.qty ?? 0) || 0;
    }
  }

  if (totalEligibleQty < MIN_QTY) {
    return { totalNewBase: 0, expensiveIndex: -1, ruleLabel: null };
  }

  /** @type {Array<{ idx: number; subtotal: number; item: object }>} */
  const lines = [];
  for (const idx of eligibleIndices) {
    const item = items[idx];
    const basePrice = Number(item?.base_price ?? 0) || 0;
    const qty = Number(item?.qty ?? 0) || 0;
    lines.push({
      idx,
      subtotal: round2(basePrice * qty),
      item,
    });
  }

  if (!lines.length) {
    return { totalNewBase: 0, expensiveIndex: -1, ruleLabel: null };
  }

  const expensive = lines.reduce((best, cur) => {
    if (cur.subtotal > best.subtotal) {
      return cur;
    }
    if (cur.subtotal === best.subtotal && cur.idx > best.idx) {
      return cur;
    }
    return best;
  });

  const discountAmount = round2(expensive.subtotal * (DISCOUNT_PERCENT / 100));

  return {
    totalNewBase: discountAmount,
    expensiveIndex: expensive.idx,
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

function collectExpensiveItemDiscount(params) {
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

  enrichShippingItemsFromQuoteItems(items, quote);

  const { totalNewBase, expensiveIndex, ruleLabel } =
    calculateMostExpensiveDiscount(items, quote);

  if (totalNewBase <= 0 || !ruleLabel || expensiveIndex < 0) {
    return {
      statusCode: HTTP_OK,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([zeroDiscountOperation()]),
    };
  }

  const item = items[expensiveIndex];
  const qty = Number(item?.qty ?? 0) || 0;
  const basePrice = Number(item?.base_price ?? 0) || 0;
  const storePrice = Number(item?.price ?? item?.base_price ?? 0) || 0;
  const lineBaseSubtotal = round2(basePrice * qty);
  const lineStoreSubtotal = round2(storePrice * qty);
  const newStoreDiscount = round2(lineStoreSubtotal * (DISCOUNT_PERCENT / 100));

  const existingBase = getExistingItemBaseDiscount(item);
  const existingStore = getExistingItemDiscountAmount(item);
  const combinedBase = round2(existingBase + totalNewBase);
  const combinedStore = round2(existingStore + newStoreDiscount);
  const discountPercent =
    lineBaseSubtotal > 0
      ? Math.round((100 * 10_000 * combinedBase) / lineBaseSubtotal) / 10_000
      : 0;

  const operations = [];
  const idx = expensiveIndex;

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
  return collectExpensiveItemDiscount(params);
}
