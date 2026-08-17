const express = require('express');
const router  = express.Router();
const requireAuth = require('../middleware/auth');

const {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  toggleCoupon,
  deleteCoupon,
  validateCoupon,
} = require('../controllers/couponController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Coupons API                                │
  │                                                     │
  │  GET    /api/coupons              list + search      │
  │  POST   /api/coupons/validate     validate for cart   │
  │  GET    /api/coupons/:id          single coupon      │
  │  POST   /api/coupons              create coupon      │
  │  PUT    /api/coupons/:id/status   activate/deactivate │
  │  PUT    /api/coupons/:id          full update        │
  │  DELETE /api/coupons/:id          delete             │
  └─────────────────────────────────────────────────────┘
*/

router.get('/',               requireAuth, getCoupons);
router.post('/validate',      validateCoupon);   /* literal path — must be before /:id */
router.get('/:id',            requireAuth, getCoupon);
router.post('/',              requireAuth, createCoupon);
router.put('/:id/status',     requireAuth, toggleCoupon);     /* must be before /:id, same rule as orders.js */
router.put('/:id',            requireAuth, updateCoupon);
router.delete('/:id',         requireAuth, deleteCoupon);

module.exports = router;
