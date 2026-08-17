const mongoose = require('mongoose');
const Order    = require('../models/Order');
const Coupon   = require('../models/Coupon');

/** Same pattern used in customerAuthController.js — kept consistent across the project. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const {
  applyStockForStatusChange,
  adjustStock,
  DEDUCT_STATES,
  RESTORE_STATES,
  validateItemInventory,
} = require('../utils/stockUtils');
const { validateCouponUsability, calculateDiscount } = require('../utils/couponUtils');
const { sendOrderConfirmationEmail } = require('../services/orderConfirmationEmail');
const getAuthenticatedCustomerId = require('../utils/getAuthenticatedCustomerId');

/* ═══════════════════════════════════════════════════
   GET /api/orders
   List all orders.  Supports:
     ?status=Pending
     ?paymentStatus=Unpaid|Paid
     ?search=ORD-1001  (orderNumber, name, phone, email)
     ?city=Cairo
     ?dateFrom=2026-01-01
     ?dateTo=2026-12-31
     ?page=1&limit=20
     ?sort=newest|oldest|total-asc|total-desc
═══════════════════════════════════════════════════ */
exports.getOrders = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      search,
      city,
      dateFrom,
      dateTo,
      page  = 1,
      limit = 50,
      sort  = 'newest',
    } = req.query;

    /* ── Build filter ── */
    const filter = {};

    /* Status */
    if (status) filter.status = status;

    /* Payment status */
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    /* Full-text search: orderNumber, name, phone, email */
    if (search) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { orderNumber:      regex },
        { 'customer.name':  regex },
        { 'customer.phone': regex },
        { 'customer.email': regex },
      ];
    }

    /* City filter */
    if (city) {
      filter['customer.city'] = new RegExp(city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    /* Date range — inclusive on both ends */
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setUTCHours(23, 59, 59, 999);   // include the entire end day
        filter.createdAt.$lte = end;
      }
    }

    /* ── Sort ── */
    const sortMap = {
      newest:       { createdAt: -1 },
      oldest:       { createdAt:  1 },
      'total-desc': { total: -1 },
      'total-asc':  { total:  1 },
    };
    const sortOpt = sortMap[sort] || sortMap.newest;

    /* ── Pagination ── */
    const pageNum  = Math.max(1, parseInt(page,  10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * limitNum;

    /* ── Query + count in parallel ── */
    const [orders, total] = await Promise.all([
      Order.find(filter).sort(sortOpt).skip(skip).limit(limitNum).lean(),
      Order.countDocuments(filter),
    ]);

    res.json({
      orders,
      total,
      page:  pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   GET /api/orders/:id
   Return a single order by MongoDB _id.
═══════════════════════════════════════════════════ */
exports.getOrder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/orders
   Create a new order.

   Expected body (JSON):
   {
     customer: { name, phone, email?, address?, city? },
     items: [{ product?, name, color, size, price, quantity, image? }],
     subtotal: Number,
     shippingFee?: Number,
     total: Number,
     paymentMethod?: 'WhatsApp' | 'COD' | 'Online',
     notes?: String,
     source?: 'storefront' | 'dashboard' | 'whatsapp' | 'other'
   }
═══════════════════════════════════════════════════ */
exports.createOrder = async (req, res) => {
  try {
    const {
      customer,
      items,
      subtotal,
      shippingFee = 0,
      total,
      paymentMethod = 'WhatsApp',
      notes  = '',
      source = 'storefront',
      couponCode,
    } = req.body;

    /* ── Basic validation ── */
    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ message: 'customer.name and customer.phone are required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items must be a non-empty array' });
    }

    if (subtotal === undefined || total === undefined) {
      return res.status(400).json({ message: 'subtotal and total are required' });
    }

    /* Product-linked items are checked against the current inventory on the
       server. This protects checkout even when the browser cache is stale or
       a client bypasses the storefront UI. */
    await validateItemInventory(items);

    /* ── Coupon: re-validate server-side, never trust a client-sent discount ──
       This runs the same checks as POST /api/coupons/validate so a coupon
       that expired or hit its limit between "Apply" and "Place Order"
       cannot slip through.                                                 */
    let coupon = null;
    let discountAmount = 0;

    if (couponCode && couponCode.trim()) {
      coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase() });
      const check = validateCouponUsability(coupon, subtotal);
      if (!check.valid) {
        return res.status(400).json({ message: check.reason });
      }
      discountAmount = calculateDiscount(coupon, subtotal);
    }

    const computedTotal = Math.max(0, Number(subtotal) - discountAmount + Number(shippingFee));

    const resolvedCustomerId = getAuthenticatedCustomerId(req.customer);

    /* Resolve the effective contact email for this order:
       1. Whatever the customer typed at checkout always wins, even if it
          differs from their account email — that's intentional and must
          stay supported (guest checkout, ordering for someone else, etc).
          Validated against the same format check used at registration
          (EMAIL_RE) before being trusted as a send-to address — a
          malformed entry is treated the same as if it were left blank,
          rather than being handed to the email service unvalidated.
       2. If it's blank or invalid, but a valid customer token was sent
          (optionalCustomerAuth), fall back to the account email carried
          in that token. Account email is immutable after registration
          (see customerAuthController.js — email is not editable), so the
          token's email claim is always current; no extra DB lookup needed.
       3. Otherwise, no email at all — the order is still created below
          exactly as before; sendOrderConfirmationEmail() safely skips
          sending and logs why (see orderConfirmationEmail.js). */
    const typedEmail = (customer.email || '').trim();
    const resolvedEmail = EMAIL_RE.test(typedEmail)
      ? typedEmail
      : (req.customer?.email || '');

    const customerWithResolvedEmail = { ...customer, email: resolvedEmail };

    /* ── Create + initial inventory transition ── */
    const session = await mongoose.startSession();
    let order;
    try {
      await session.withTransaction(async () => {
        order = new Order({
          customer: customerWithResolvedEmail,
          customerId: resolvedCustomerId,
          items,
          subtotal: Number(subtotal),
          shippingFee: Number(shippingFee),
          total: coupon ? computedTotal : Number(total),
          paymentMethod,
          notes,
          source,
          coupon: coupon ? { code: coupon.code, discountAmount } : undefined,
        });
        await order.save({ session });
        if (DEDUCT_STATES.has(order.status)) {
          await validateItemInventory(order.items, session);
          await adjustStock(order.items, -1, session);
          order.stockDeducted = true;
          await order.save({ session });
        }
      });
    } finally {
      await session.endSession();
    }

    /* ── Coupon: bump usedCount, auto-deactivate once the limit is reached ──
       Done only after the order is successfully created.                  */
    if (coupon) {
      coupon.usedCount += 1;
      if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
        coupon.active = false;
      }
      await coupon.save();
    }

    res.status(201).json(order);

    /* ── Order confirmation email — fire-and-forget, after the response.
       sendOrderConfirmationEmail() never throws (it resolves to
       { success:false, error } on any failure, including a missing
       recipient email), and this .catch() is purely defensive. Order
       creation above is already complete and unaffected either way. */
    sendOrderConfirmationEmail(order).catch(err => {
      console.error('[orderController] Failed to send order confirmation email:', err);
    });
  } catch (err) {
    /* Mongoose validation errors → 400, everything else → 500 */
    const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/orders/:id
   Full update of an order.
   Only these fields are editable after creation:
   customer, items, subtotal, shippingFee, total,
   status, paymentMethod, paymentStatus, notes.
   orderNumber and source are immutable.
═══════════════════════════════════════════════════ */
exports.updateOrder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order) return;

        if (req.body.items !== undefined && order.stockDeducted) {
          const error = new Error('Items cannot be changed after inventory has been deducted');
          error.statusCode = 400;
          throw error;
        }
        if (req.body.items !== undefined) {
          await validateItemInventory(req.body.items, session);
        }

        const incomingStatus = req.body.status;
        const statusChanging = incomingStatus !== undefined && incomingStatus !== order.status;

        const MUTABLE = [
          'customer', 'items', 'subtotal', 'shippingFee', 'total', 'status',
          'paymentMethod', 'paymentStatus', 'notes',
        ];
        MUTABLE.forEach(field => {
          if (req.body[field] !== undefined) order[field] = req.body[field];
        });

        if (statusChanging) {
          /* Apply the transition against the updated order inside the same
             transaction as the final order save. */
          await applyStockForStatusChange(order, incomingStatus, order.items, session);
        }

        await order.save({ session });
        result = order;
      });
    } finally {
      await session.endSession();
    }
    if (!result) return res.status(404).json({ message: 'Order not found' });
    res.json(result);
  } catch (err) {
    const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/orders/:id/status
   Update order status only.  Lightweight endpoint for
   the dashboard "quick actions" buttons.

   Body: { status: 'Confirmed' | 'Shipped' | ... }
         { paymentStatus: 'Paid' }          (optional)
═══════════════════════════════════════════════════ */
exports.updateStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const { status, paymentStatus } = req.body;

    if (!status && !paymentStatus) {
      return res.status(400).json({ message: 'At least one of status or paymentStatus is required' });
    }

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order) return;

        /* Stock and order state are committed together. Mongoose optimistic
           concurrency rejects a competing save; the transaction then rolls
           back any inventory changes made by the losing request. */
        if (status && status !== order.status) {
          await applyStockForStatusChange(order, status, undefined, session);
          order.status = status;
        }
        if (paymentStatus) order.paymentStatus = paymentStatus;
        await order.save({ session });
        result = {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          stockDeducted: order.stockDeducted,
        };
      });
    } finally {
      await session.endSession();
    }
    if (!result) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Updated successfully', ...result });
  } catch (err) {
    const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   DELETE /api/orders/:id
   Hard delete a single order.
═══════════════════════════════════════════════════ */
exports.deleteOrder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order) return;
        if (order.stockDeducted) {
          await adjustStock(order.items, +1, session);
          order.stockDeducted = false;
        }
        await order.deleteOne({ session });
        result = { orderNumber: order.orderNumber };
      });
    } finally {
      await session.endSession();
    }
    if (!result) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted', id: req.params.id, orderNumber: result.orderNumber });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete order', error: err.message });
  }
};
