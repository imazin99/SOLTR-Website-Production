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
 * Atomically adjust stock for every item that has a product ObjectId.
 * Items created manually (no product ref) are silently skipped.
 *
 * delta = -1  →  deduct   (clamped at 0, never negative)
 * delta = +1  →  restore  (simple increment, always safe)
 *
 * Uses bulkWrite for a single round-trip regardless of item count.
 *
 * @param {Array}  items  - order.items array
 * @param {number} delta  - -1 or +1
 */
async function adjustStock(items, delta) {
  if (!Array.isArray(items) || items.length === 0) return;

  const ops = items
    .filter(i => i.product)           // skip items with no product reference
    .map(i => {
      const qty = Math.max(1, Number(i.quantity) || 1);

      return {
        updateOne: {
          filter: { _id: i.product },
          update:
            delta < 0
              /* Deduct — MongoDB aggregation pipeline update clamps at 0:
                 new stock = max(0, current_stock - qty)              */
              ? [{ $set: { stock: { $max: [0, { $subtract: ['$stock', qty] }] } } }]
              /* Restore — plain $inc, always a positive number        */
              : { $inc: { stock: qty } },
        },
      };
    });

  if (ops.length === 0) return;       // all items were manual — nothing to do

  /* ordered:false lets all ops run even if one fails */
  await Product.bulkWrite(ops, { ordered: false });
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
async function applyStockForStatusChange(order, newStatus, newItems) {
  /* ── Deduct ── */
  if (DEDUCT_STATES.has(newStatus) && !order.stockDeducted) {
    const itemsToDeduct = newItems || order.items;
    await adjustStock(itemsToDeduct, -1);
    order.stockDeducted = true;
    return;
  }

  /* ── Restore ── */
  if (RESTORE_STATES.has(newStatus) && order.stockDeducted) {
    /* Always restore from the items that were actually deducted.
       If items were swapped before this call, the caller must pass
       the OLD items — see updateOrder in the controller.              */
    await adjustStock(order.items, +1);
    order.stockDeducted = false;
  }

  /* ── No change ── (Pending, Shipped, Delivered, or redundant transition) */
}

module.exports = {
  adjustStock,
  applyStockForStatusChange,
  DEDUCT_STATES,
  RESTORE_STATES,
};
