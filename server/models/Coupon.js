const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      trim: true,
      uppercase: true,
      unique: true,
    },
    discountType: {
      type: String,
      required: [true, 'Discount type is required'],
      enum: {
        values: ['percentage', 'fixed'],
        message: '{VALUE} is not a valid discount type',
      },
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    /* Cart subtotal must reach this amount before the coupon can be applied. 0 = no minimum */
    minimumOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'Minimum order amount cannot be negative'],
    },
    /* Caps the discount for percentage coupons. 0 = no cap. Ignored for fixed coupons. */
    maximumDiscount: {
      type: Number,
      default: 0,
      min: [0, 'Maximum discount cannot be negative'],
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    /* Total number of times this coupon may be redeemed. 0 = unlimited */
    usageLimit: {
      type: Number,
      default: 0,
      min: [0, 'Usage limit cannot be negative'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,   // adds createdAt + updatedAt automatically
  }
);

/* Percentage coupons must not exceed 100% */
couponSchema.path('discountValue').validate(function (value) {
  if (this.discountType === 'percentage') return value <= 100;
  return true;
}, 'Percentage discount cannot exceed 100');

module.exports = mongoose.model('Coupon', couponSchema);
