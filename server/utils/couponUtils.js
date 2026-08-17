/**
 * SOLTR — server/utils/couponUtils.js
 *
 * Pure coupon validation + discount-calculation logic.
 * No Express req/res — just business rules, reused by both
 * the validate endpoint and order creation.
 * ─────────────────────────────────────────────────────────
 */

/**
 * validateCouponUsability(coupon, subtotal)
 *
 * Checks every rejection condition for applying a coupon to a cart.
 * Does NOT touch the database — caller passes in an already-fetched
 * coupon document (or null if not found).
 *
 * @param {Document|null} coupon    - Mongoose Coupon document
 * @param {number}         subtotal - Cart subtotal (before discount)
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateCouponUsability(coupon, subtotal) {
  if (!coupon) {
    return { valid: false, reason: 'Coupon code not found' };
  }

  if (!coupon.active) {
    return { valid: false, reason: 'This coupon is no longer active' };
  }

  if (coupon.expiryDate && new Date(coupon.expiryDate).getTime() < Date.now()) {
    return { valid: false, reason: 'This coupon has expired' };
  }

  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, reason: 'This coupon has reached its usage limit' };
  }

  if (coupon.minimumOrderAmount > 0 && Number(subtotal) < coupon.minimumOrderAmount) {
    return {
      valid: false,
      reason: `Minimum order amount for this coupon is LE ${coupon.minimumOrderAmount.toFixed(2)}`,
    };
  }

  return { valid: true };
}

/**
 * calculateDiscount(coupon, subtotal)
 *
 * Computes the discount amount for a valid coupon.
 * - percentage: subtotal * discountValue / 100, capped by maximumDiscount (if set)
 * - fixed:      discountValue, never more than the subtotal itself
 *
 * Always clamps between 0 and subtotal so totals can never go negative.
 *
 * @param {Document} coupon
 * @param {number}   subtotal
 * @returns {number} discount amount, rounded to 2 decimals
 */
function calculateDiscount(coupon, subtotal) {
  const sub = Number(subtotal) || 0;
  let discount = 0;

  if (coupon.discountType === 'percentage') {
    discount = (sub * coupon.discountValue) / 100;
    if (coupon.maximumDiscount > 0) {
      discount = Math.min(discount, coupon.maximumDiscount);
    }
  } else {
    /* fixed */
    discount = coupon.discountValue;
  }

  /* Never let the discount exceed the subtotal (prevents negative totals) */
  discount = Math.min(discount, sub);

  return Math.max(0, Math.round(discount * 100) / 100);
}

module.exports = {
  validateCouponUsability,
  calculateDiscount,
};
