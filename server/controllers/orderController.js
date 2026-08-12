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

    /* ── Create ── */
    const order = await Order.create({
      customer: customerWithResolvedEmail,
      customerId: resolvedCustomerId, // set only if a valid customer token was sent — see optionalCustomerAuth.js
      items,
      subtotal:    Number(subtotal),
      shippingFee: Number(shippingFee),
      total:       coupon ? computedTotal : Number(total),
      paymentMethod,
      notes,
      source,
      coupon: coupon ? { code: coupon.code, discountAmount } : undefined,
    });

    /* ── Stock: deduct if the order is created in a deduct-state status ──
       Default status is 'Pending', so this only fires when the caller
       explicitly sets status to 'Confirmed' or 'Processing' on creation. */
    if (DEDUCT_STATES.has(order.status)) {
      await adjustStock(order.items, -1);
      order.stockDeducted = true;
      await order.save();
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
    const status = err.name === 'ValidationError' ? 400 : 500;
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

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const incomingStatus = req.body.status;
    const statusChanging  = incomingStatus !== undefined && incomingStatus !== order.status;

    /* ── Stock step 1: if moving to a RESTORE state, restore BEFORE items change ──
       We must use the original items (what was actually deducted).              */
    if (statusChanging && RESTORE_STATES.has(incomingStatus) && order.stockDeducted) {
      await adjustStock(order.items, +1);
      order.stockDeducted = false;
    }

    /* ── Apply all mutable field updates ── */
    const MUTABLE = [
      'customer', 'items', 'subtotal', 'shippingFee',
      'total', 'status', 'paymentMethod', 'paymentStatus', 'notes',
    ];
    MUTABLE.forEach(field => {
      if (req.body[field] !== undefined) order[field] = req.body[field];
    });

    /* ── Stock step 2: if moving to a DEDUCT state, deduct from UPDATED items ── */
    if (statusChanging && DEDUCT_STATES.has(incomingStatus) && !order.stockDeducted) {
      await adjustStock(order.items, -1);
      order.stockDeducted = true;
    }

    await order.save();
    res.json(order);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
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

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    /* ── Stock: evaluate the transition before mutating order.status ── */
    if (status && status !== order.status) {
      await applyStockForStatusChange(order, status);
      /* applyStockForStatusChange already mutated order.stockDeducted */
      order.status = status;
    }

    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();

    res.json({
      message:        'Updated successfully',
      orderNumber:    order.orderNumber,
      status:         order.status,
      paymentStatus:  order.paymentStatus,
      stockDeducted:  order.stockDeducted,
    });
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
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

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    /* ── Stock: restore before deleting if stock was held by this order ── */
    if (order.stockDeducted) {
      await adjustStock(order.items, +1);
    }

    await order.deleteOne();

    res.json({
      message:     'Order deleted',
      id:          req.params.id,
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete order', error: err.message });
  }
};
