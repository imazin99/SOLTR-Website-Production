const mongoose = require('mongoose');
const Coupon   = require('../models/Coupon');
const { validateCouponUsability, calculateDiscount } = require('../utils/couponUtils');

/* ═══════════════════════════════════════════════════
   GET /api/coupons
   List all coupons. Supports:
     ?search=SOLTR10   (case-insensitive code search)
     ?sort=newest|oldest  (default: newest)
═══════════════════════════════════════════════════ */
exports.getCoupons = async (req, res) => {
  try {
    const { search, sort = 'newest' } = req.query;

    const filter = {};
    if (search) {
      filter.code = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
    };
    const sortOpt = sortMap[sort] || sortMap.newest;

    const coupons = await Coupon.find(filter).sort(sortOpt);
    res.json(coupons);
  } catch (err) {
    console.error('[couponController] Failed to fetch coupons:', err);
    res.status(500).json({ message: 'Failed to fetch coupons' });
  }
};

/* ═══════════════════════════════════════════════════
   GET /api/coupons/:id
═══════════════════════════════════════════════════ */
exports.getCoupon = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid coupon ID format' });
    }

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    res.json(coupon);
  } catch (err) {
    console.error('[couponController] Failed to fetch coupon:', err);
    res.status(500).json({ message: 'Failed to fetch coupon' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/coupons
   Create a new coupon.

   Body:
   {
     code, discountType: 'percentage'|'fixed', discountValue,
     minimumOrderAmount?, maximumDiscount?, expiryDate,
     usageLimit?, active?
   }
═══════════════════════════════════════════════════ */
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minimumOrderAmount = 0,
      maximumDiscount    = 0,
      expiryDate,
      usageLimit         = 0,
      active             = true,
    } = req.body;

    /* ── Basic validation ── */
    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }
    if (!['percentage', 'fixed'].includes(discountType)) {
      return res.status(400).json({ message: 'discountType must be "percentage" or "fixed"' });
    }
    if (discountValue === undefined || Number(discountValue) < 0) {
      return res.status(400).json({ message: 'discountValue is required and cannot be negative' });
    }
    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      return res.status(400).json({ message: 'A valid expiryDate is required' });
    }

    /* ── Prevent duplicate codes (case-insensitive) ── */
    const normalizedCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(400).json({ message: `Coupon code "${normalizedCode}" already exists` });
    }

    const coupon = await Coupon.create({
      code: normalizedCode,
      discountType,
      discountValue: Number(discountValue),
      minimumOrderAmount: Number(minimumOrderAmount) || 0,
      maximumDiscount: Number(maximumDiscount) || 0,
      expiryDate: new Date(expiryDate),
      usageLimit: Number(usageLimit) || 0,
      active: Boolean(active),
    });

    res.status(201).json(coupon);
  } catch (err) {
    /* Mongoose validation errors (incl. our percentage-cap validator) → 400 */
    const status = err.name === 'ValidationError' ? 400 : 500;
    /* Duplicate key race condition (unique index) */
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/coupons/:id
   Update an existing coupon. Editable fields only —
   usedCount is never editable directly (see order flow).
═══════════════════════════════════════════════════ */
exports.updateCoupon = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid coupon ID format' });
    }

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    const {
      code, discountType, discountValue,
      minimumOrderAmount, maximumDiscount,
      expiryDate, usageLimit, active,
    } = req.body;

    /* ── Duplicate-code check if code is changing ── */
    if (code !== undefined) {
      const normalizedCode = code.trim().toUpperCase();
      if (normalizedCode !== coupon.code) {
        const existing = await Coupon.findOne({ code: normalizedCode, _id: { $ne: coupon._id } });
        if (existing) {
          return res.status(400).json({ message: `Coupon code "${normalizedCode}" already exists` });
        }
      }
      coupon.code = normalizedCode;
    }

    if (discountType !== undefined) {
      if (!['percentage', 'fixed'].includes(discountType)) {
        return res.status(400).json({ message: 'discountType must be "percentage" or "fixed"' });
      }
      coupon.discountType = discountType;
    }
    if (discountValue       !== undefined) coupon.discountValue      = Number(discountValue);
    if (minimumOrderAmount  !== undefined) coupon.minimumOrderAmount = Number(minimumOrderAmount) || 0;
    if (maximumDiscount     !== undefined) coupon.maximumDiscount    = Number(maximumDiscount) || 0;
    if (usageLimit          !== undefined) coupon.usageLimit         = Number(usageLimit) || 0;
    if (active              !== undefined) coupon.active            = Boolean(active);
    if (expiryDate          !== undefined) {
      if (isNaN(new Date(expiryDate).getTime())) {
        return res.status(400).json({ message: 'A valid expiryDate is required' });
      }
      coupon.expiryDate = new Date(expiryDate);
    }

    await coupon.save();
    res.json(coupon);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/coupons/:id/toggle
   Activate / deactivate a coupon without touching any
   other field. Lightweight endpoint for the dashboard
   quick-action toggle switch.
═══════════════════════════════════════════════════ */
exports.toggleCoupon = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid coupon ID format' });
    }

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    /* Body may explicitly set { active: true|false }; otherwise flip it */
    coupon.active = req.body.active !== undefined ? Boolean(req.body.active) : !coupon.active;

    await coupon.save();
    res.json({ message: 'Coupon updated', id: coupon._id, active: coupon.active });
  } catch (err) {
    console.error('[couponController] Failed to update coupon:', err);
    res.status(500).json({ message: 'Failed to update coupon' });
  }
};

/* ═══════════════════════════════════════════════════
   DELETE /api/coupons/:id
═══════════════════════════════════════════════════ */
exports.deleteCoupon = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid coupon ID format' });
    }

    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    res.json({ message: 'Coupon deleted', id: req.params.id });
  } catch (err) {
    console.error('[couponController] Failed to delete coupon:', err);
    res.status(500).json({ message: 'Failed to delete coupon' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/coupons/validate
   Used by checkout.js to validate a coupon against the
   current cart subtotal BEFORE the order is placed.
   Does NOT increment usedCount — that only happens when
   the order is actually created (see orderController).

   Body: { code, subtotal }
   Response: { valid: true, coupon: { code, discountType,
              discountValue, discountAmount } } | { valid: false, message }
═══════════════════════════════════════════════════ */
exports.validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ valid: false, message: 'Coupon code is required' });
    }
    if (subtotal === undefined || isNaN(Number(subtotal))) {
      return res.status(400).json({ valid: false, message: 'subtotal is required' });
    }

    const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
    const check  = validateCouponUsability(coupon, subtotal);

    if (!check.valid) {
      return res.status(400).json({ valid: false, message: check.reason });
    }

    const discountAmount = calculateDiscount(coupon, subtotal);

    res.json({
      valid: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
      },
    });
  } catch (err) {
    console.error('[couponController] Failed to validate coupon:', err);
    res.status(500).json({ valid: false, message: 'Failed to validate coupon' });
  }
};
