const mongoose = require('mongoose');
const Order    = require('../models/Order');
const Coupon   = require('../models/Coupon');
const Product  = require('../models/Product');
const Setting  = require('../models/Setting');

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

const PAYMENT_METHODS = new Set(['WhatsApp', 'COD', 'Online']);
const PHONE_RE = /^\+?[\d\s-]{7,20}$/;
const MAX_ITEM_QUANTITY = 100;

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function cleanText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function orderError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function publicOrderError(err, context) {
  const status = err?.statusCode || (err?.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error(`[orderController] ${context}:`, err);
  return { status, message: status < 500 ? (err.message || 'Request rejected') : 'Request could not be completed' };
}

async function canonicalizeOrderItems(items, session) {
  if (!Array.isArray(items) || items.length === 0) throw orderError('items must be a non-empty array');
  const ids = [];
  for (const item of items) {
    if (!item?.product || !mongoose.isValidObjectId(item.product)) {
      throw orderError('Every order item must reference a valid product');
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      throw orderError(`Each item quantity must be an integer from 1 to ${MAX_ITEM_QUANTITY}`);
    }
    const size = cleanText(item.size, 40);
    if (!size) throw orderError('A size is required for every product');
    ids.push(String(item.product));
  }

  const query = Product.find({ _id: { $in: ids } }).select('name price colors sizes images stock sizeInventory');
  if (session) query.session(session);
  const products = await query;
  const byId = new Map(products.map(product => [String(product._id), product]));

  return items.map(item => {
    const product = byId.get(String(item.product));
    if (!product) throw orderError('One or more selected products are no longer available', 409);
    const size = cleanText(item.size, 40);
    if (Array.isArray(product.sizes) && product.sizes.length && !product.sizes.includes(size)) {
      throw orderError(`${product.name} is not available in size ${size}`);
    }
    const requestedColor = cleanText(item.color, 80);
    const color = requestedColor && product.colors.includes(requestedColor)
      ? requestedColor
      : (product.colors[0] || '');
    return {
      product: product._id,
      name: product.name,
      color,
      size,
      price: money(product.price),
      quantity: Number(item.quantity),
      image: product.images?.[0] || '',
    };
  });
}

function sanitizeCustomer(input, fallbackEmail = '') {
  const customer = input && typeof input === 'object' ? input : {};
  const name = cleanText(customer.name, 120);
  const phone = cleanText(customer.phone, 30);
  if (!name || !phone) throw orderError('customer.name and customer.phone are required');
  if (!PHONE_RE.test(phone)) throw orderError('Please enter a valid phone number');
  const typedEmail = cleanText(customer.email, 254).toLowerCase();
  const email = EMAIL_RE.test(typedEmail)
    ? typedEmail
    : (EMAIL_RE.test(fallbackEmail) ? fallbackEmail.toLowerCase() : '');
  return {
    name,
    phone,
    email,
    address: cleanText(customer.address, 500),
    city: cleanText(customer.city, 120),
  };
}

async function getServerShippingFee(session) {
  const query = Setting.findOne().select('freeShipping');
  if (session) query.session(session);
  const settings = await query.lean();
  /* The current store has no configured non-zero shipping amount. Keep the
     canonical server value at zero while still ignoring client shipping. */
  return settings?.freeShipping === false ? 0 : 0;
}

async function reserveCoupon(code, subtotal, session) {
  if (!code || !String(code).trim()) return { coupon: null, discountAmount: 0 };
  const normalized = String(code).trim().toUpperCase();
  const lookup = Coupon.findOne({ code: normalized });
  if (session) lookup.session(session);
  const coupon = await lookup;
  const check = validateCouponUsability(coupon, subtotal);
  if (!check.valid) throw orderError(check.reason);
  const filter = { _id: coupon._id, active: true, expiryDate: { $gte: new Date() } };
  if (coupon.usageLimit > 0) filter.usedCount = { $lt: coupon.usageLimit };
  const update = { $inc: { usedCount: 1 } };
  const reservedQuery = Coupon.findOneAndUpdate(filter, update, { new: true, session });
  const reserved = await reservedQuery;
  if (!reserved) throw orderError('This coupon is no longer available', 409);
  if (reserved.usageLimit > 0 && reserved.usedCount >= reserved.usageLimit) {
    await Coupon.updateOne({ _id: reserved._id }, { $set: { active: false } }, { session });
  }
  return { coupon: reserved, discountAmount: calculateDiscount(reserved, subtotal) };
}

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
    console.error('[orderController] Failed to fetch orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders' });
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
    console.error('[orderController] Failed to fetch order:', err);
    res.status(500).json({ message: 'Failed to fetch order' });
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
      paymentMethod = 'WhatsApp',
      notes = '',
      source = 'storefront',
      couponCode,
    } = req.body || {};

    if (!PAYMENT_METHODS.has(paymentMethod)) {
      throw orderError('Invalid payment method');
    }
    const sanitizedCustomer = sanitizeCustomer(customer, req.customer?.email || '');
    const resolvedCustomerId = getAuthenticatedCustomerId(req.customer);
    const session = await mongoose.startSession();
    let order;

    try {
      await session.withTransaction(async () => {
        const canonicalItems = await canonicalizeOrderItems(items, session);
        await validateItemInventory(canonicalItems, session);
        const subtotal = money(canonicalItems.reduce(
          (sum, item) => sum + (item.price * item.quantity),
          0
        ));
        const shippingFee = money(await getServerShippingFee(session));
        const { coupon, discountAmount } = await reserveCoupon(couponCode, subtotal, session);
        const total = money(Math.max(0, subtotal - discountAmount + shippingFee));

        order = new Order({
          customer: sanitizedCustomer,
          customerId: resolvedCustomerId,
          items: canonicalItems,
          subtotal,
          shippingFee,
          total,
          paymentMethod,
          paymentStatus: 'Unpaid',
          notes: cleanText(notes, 2000),
          source: ['storefront', 'dashboard', 'whatsapp', 'other'].includes(source) ? source : 'other',
          coupon: coupon ? { code: coupon.code, discountAmount } : undefined,
        });
        await order.save({ session });

        /* Preserve the completed transactional inventory behavior exactly. */
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

    res.status(201).json(order);

    /* Confirmation delivery is intentionally fire-and-forget after persistence. */
    sendOrderConfirmationEmail(order).catch(err => {
      console.error('[orderController] Failed to send order confirmation email:', err);
    });
  } catch (err) {
    const failure = publicOrderError(err, 'createOrder failed');
    res.status(failure.status).json({ message: failure.message });
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
    console.error('[orderController] Failed to delete order:', err);
    res.status(500).json({ message: 'Failed to delete order' });
  }
};
