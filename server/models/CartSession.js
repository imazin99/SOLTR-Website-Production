const mongoose = require('mongoose');

/**
 * SOLTR — server/models/CartSession.js
 *
 * NOT USED YET. This is scaffolding for a future Cart Abandonment
 * feature — no controller or route currently writes to or reads from
 * this collection. It exists so the shape is decided ahead of time,
 * per the "prepare the backend structure" requirement.
 *
 * Intended future flow (not implemented):
 *   1. checkout.js generates/reuses the same visitorId localStorage
 *      already uses (see server/models/Visitor.js) and calls
 *      POST /api/cart-sessions whenever the cart has items, updating
 *      `items` + `updatedAt` as the cart changes.
 *   2. When an order is successfully placed, orderController marks
 *      the matching CartSession `completed: true`.
 *   3. Cart Abandonment Rate = sessions where completed === false and
 *      updatedAt is older than some cutoff (e.g. 30 min), divided by
 *      total sessions in the period.
 *
 * Until that flow exists, GET /api/analytics returns cartAbandonment
 * as an honest placeholder rather than a fabricated percentage.
 */
const cartSessionSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, trim: true },
    items:     { type: Array, default: [] },   // snapshot of cart contents at last update
    completed: { type: Boolean, default: false }, // set true once an order is placed
  },
  { timestamps: true }
);

module.exports = mongoose.model('CartSession', cartSessionSchema);
