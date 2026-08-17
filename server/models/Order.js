const mongoose = require('mongoose');

/* ─────────────────────────────────────────────
   Sub-schema: individual item inside an order.
   We snapshot the product data at purchase time
   so the order record never changes if the product
   is later edited or deleted.
───────────────────────────────────────────── */
const orderItemSchema = new mongoose.Schema(
  {
    /* Reference kept for analytics — optional, nullable */
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    /* Snapshots — always populated, never depend on product lookup */
    name:     { type: String, required: [true, 'Item name is required'] },
    color:    { type: String, required: [true, 'Item color is required'] },
    size:     { type: String, required: [true, 'Item size is required'] },
    price:    { type: Number, required: [true, 'Item price is required'], min: 0 },
    quantity: { type: Number, required: [true, 'Quantity is required'],   min: 1, default: 1 },
    image:    { type: String, default: '' },    // filename from uploads/products/
  },
  { _id: false }   // no separate _id per item
);

/* ─────────────────────────────────────────────
   Sub-schema: customer contact details
───────────────────────────────────────────── */
const customerSchema = new mongoose.Schema(
  {
    name:    { type: String, required: [true, 'Customer name is required'], trim: true },
    phone:   { type: String, required: [true, 'Customer phone is required'], trim: true },
    email:   { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city:    { type: String, default: '', trim: true },
  },
  { _id: false }
);

/* ─────────────────────────────────────────────
   Main Order schema
───────────────────────────────────────────── */
const orderSchema = new mongoose.Schema(
  {
    /* Human-readable ID shown in dashboard (e.g. ORD-1001) */
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },

    customer: {
      type: customerSchema,
      required: [true, 'Customer information is required'],
    },

    items: {
      type: [orderItemSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'An order must have at least one item',
      },
    },

    subtotal:    { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, default: 0,    min: 0 },
    total:       { type: Number, required: true, min: 0 },

    /**
     * coupon — snapshot of the applied coupon at purchase time (optional).
     * Never null-checked against the live Coupon document later —
     * same "snapshot, don't look up" rule as order items.
     */
    coupon: {
      code:           { type: String, default: null },
      discountAmount: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: {
        values: ['Pending', 'Processing', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
        message: '{VALUE} is not a valid status',
      },
      default: 'Pending',
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ['WhatsApp', 'COD', 'Online'],
      default: 'WhatsApp',
    },

    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Paid'],
      default: 'Unpaid',
    },

    notes:  { type: String, default: '', trim: true },

    /* Where the order came from — for future multi-channel tracking */
    source: {
      type: String,
      enum: ['storefront', 'dashboard', 'whatsapp', 'other'],
      default: 'storefront',
    },

    /**
     * stockDeducted — internal inventory flag.
     * true  = stock has been reduced for this order's items.
     * false = stock has NOT been touched (order is Pending / Cancelled / Returned).
     *
     * This flag prevents double-deduction and incorrect restoration
     * when an order's status changes multiple times.
     */
    stockDeducted: {
      type:    Boolean,
      default: false,
    },
  },
  {
    timestamps: true,   // createdAt, updatedAt
    optimisticConcurrency: true,
  }
);

/* ─────────────────────────────────────────────
   Auto-generate orderNumber before first save.
   Format: ORD-1001, ORD-1002, …
   Finds the last order and increments its number.
   Safe for single-server, low-concurrency use.
───────────────────────────────────────────── */
orderSchema.pre('save', async function (next) {
  if (!this.isNew) return next();

  try {
    const last = await mongoose.model('Order')
      .findOne()
      .sort({ createdAt: -1 })
      .select('orderNumber')
      .lean();

    let nextNum = 1001;
    if (last && last.orderNumber) {
      const parsed = parseInt(last.orderNumber.replace('ORD-', ''), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    this.orderNumber = `ORD-${nextNum}`;
  } catch {
    /* Fallback: timestamp-based number */
    this.orderNumber = `ORD-${Date.now()}`;
  }

  next();
});

/* ─────────────────────────────────────────────
   Virtual: itemCount — total units in the order
───────────────────────────────────────────── */
orderSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

module.exports = mongoose.model('Order', orderSchema);
