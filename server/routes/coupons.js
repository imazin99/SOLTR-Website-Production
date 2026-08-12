const express = require('express');
const router  = express.Router();

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

router.get('/',               getCoupons);
router.post('/validate',      validateCoupon);   /* literal path — must be before /:id */
router.get('/:id',            getCoupon);
router.post('/',              createCoupon);
router.put('/:id/status',     toggleCoupon);     /* must be before /:id, same rule as orders.js */
router.put('/:id',            updateCoupon);
router.delete('/:id',         deleteCoupon);

module.exports = router;
