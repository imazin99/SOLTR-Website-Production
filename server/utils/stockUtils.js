/**
 * SOLTR — server/utils/stockUtils.js
 *
 * Pure stock-management logic.
 * No Express req/res — just Mongoose and business rules.
 *
 * ── Rules ────────────────────────────────────────────────
 *  DEDUCT when order enters:   Confirmed | Processing
 *  RESTORE when order enters:  Cancelled | Returned
 *  No change for:              Pending | Shipped | Delivered
 *
 *  stockDeducted (on Order doc) = true  →  stock is currently held
 *                                  false →  stock is free
 *
 *  Stock never goes below 0 (clamped atomically in MongoDB).
 * ─────────────────────────────────────────────────────────
 */

const Product = require('../models/Product');

/* ── Status classification ── */
const DEDUCT_STATES  = new Set(['Confirmed', 'Processing']);
const RESTORE_STATES = new Set(['Cancelled', 'Returned']);

/**
 * adjustStock(items, delta)
 *
 * Adjust stock for every item that has a product ObjectId.
 * Items created manually (no product ref) are skipped; a referenced missing
 * product throws so the surrounding transaction can abort.
 *
 * delta = -1  →  deduct   (clamped at 0, never negative)
 * delta = +1  →  restore  (simple increment, always safe)
 *
 * When a session is supplied, every product save participates in the caller's
 * transaction so multi-item changes commit or roll back together.
 *
 * @param {Array}  items  - order.items array
 * @param {number} delta  - -1 or +1
 */
async function adjustStock(items, delta, session) {
  if (!Array.isArray(items) || items.length === 0) return;
  for (const item of items) {
    if (!item.product) continue;
    const qty = Math.max(1, Number(item.quantity) || 1);
    const query = Product.findById(item.product).select('stock sizes sizeInventory');
    if (session) query.session(session);
    const product = await query;
    if (!product) {
      const error = new Error(`Cannot adjust inventory: product ${item.product} was not found`);
      error.code = 'INVENTORY_PRODUCT_MISSING';
      throw error;
    }
    const hasSizeInventory = isSizeInventoryActive(product.sizeInventory);
    if (hasSizeInventory) {
      const current = Number(getMapValue(product.sizeInventory, item.size) ?? 0);
      setMapValue(product.sizeInventory, item.size, delta < 0 ? Math.max(0, current - qty) : current + qty);
    } else {
      product.stock = delta < 0 ? Math.max(0, Number(product.stock || 0) - qty) : Number(product.stock || 0) + qty;
    }
    await product.save(session ? { session } : undefined);
  }
}

function isSizeInventoryActive(inventory) {
  return Boolean(inventory && (
    (typeof inventory.size === 'number' && inventory.size > 0) ||
    (typeof inventory.size !== 'number' && Object.keys(inventory).length > 0)
  ));
}
function getMapValue(inventory, size) {
  return typeof inventory.get === 'function' ? inventory.get(size) : inventory[size];
}
function setMapValue(inventory, size, value) {
  if (typeof inventory.set === 'function') inventory.set(size, value);
  else inventory[size] = value;
}
function getSizeInventoryValue(product, size) {
  if (!product) return null;
  const inventory = product.sizeInventory;
  if (isSizeInventoryActive(inventory)) return Number(getMapValue(inventory, size) ?? 0);
  return Number(product.stock || 0);
}

function inventoryError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function validateItemInventory(items, session) {
  if (!Array.isArray(items)) return;
  const requested = new Map();
  for (const item of items) {
    if (!item.product) continue;
    if (!item.size) throw inventoryError(`A size is required for ${item.name || 'each product'}`);
    const key = `${item.product}:${item.size}`;
    requested.set(key, (requested.get(key) || 0) + Math.max(1, Number(item.quantity) || 1));
  }
  for (const [key, quantity] of requested) {
    const [productId, ...sizeParts] = key.split(':');
    const size = sizeParts.join(':');
    const query = Product.findById(productId).select('name sizes sizeInventory stock');
    if (session) query.session(session);
    const product = await query;
    if (!product) throw inventoryError(`Product ${productId} was not found`);
    if (Array.isArray(product.sizes) && product.sizes.length && !product.sizes.includes(size)) {
      throw inventoryError(`${product.name} is not available in size ${size}`);
    }
    const available = getSizeInventoryValue(product, size);
    if (available < quantity) {
      throw inventoryError(`${product.name} size ${size} has only ${available} item${available === 1 ? '' : 's'} available`);
    }
  }
}

/**
 * applyStockForStatusChange(order, newStatus, newItems?)
 *
 * Evaluates whether the incoming status transition requires a stock
 * deduction or restoration, then calls adjustStock() accordingly.
 *
 * Mutates order.stockDeducted — caller is responsible for order.save().
 *
 * @param {Document} order     - Mongoose Order document (not yet saved)
 * @param {string}   newStatus - The status being applied
 * @param {Array}   [newItems] - Supply ONLY when items have been replaced
 *                               before this function is called (updateOrder
 *                               edge case). Deduction will use newItems;
 *                               restoration always uses the original items.
 */
async function applyStockForStatusChange(order, newStatus, newItems, session) {
  /* ── Deduct ── */
  if (DEDUCT_STATES.has(newStatus) && !order.stockDeducted) {
    const itemsToDeduct = newItems || order.items;
    await validateItemInventory(itemsToDeduct, session);
    await adjustStock(itemsToDeduct, -1, session);
    order.stockDeducted = true;
    return;
  }

  /* ── Restore ── */
  if (RESTORE_STATES.has(newStatus) && order.stockDeducted) {
    /* Always restore from the items that were actually deducted.
       If items were swapped before this call, the caller must pass
       the OLD items — see updateOrder in the controller.              */
    await adjustStock(order.items, +1, session);
    order.stockDeducted = false;
  }

  /* ── No change ── (Pending, Shipped, Delivered, or redundant transition) */
}

module.exports = {
  adjustStock,
  applyStockForStatusChange,
  DEDUCT_STATES,
  RESTORE_STATES,
  getSizeInventoryValue,
  validateItemInventory,
};
