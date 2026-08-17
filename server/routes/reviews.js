const express = require('express');
const router  = express.Router();

const requireAuth       = require('../middleware/auth');
const optionalAdminAuth = require('../middleware/optionalAdminAuth');
const { reviewCreationIp } = require('../middleware/rateLimits');
const { getReviews, addReview, updateReview, deleteReview } = require('../controllers/reviewController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Reviews API                                 │
  │                                                     │
  │  GET    /api/reviews    (public + admin, same route) │
  │           ?productId=&search=&sort=&limit=           │
  │           ?status=pending|approved|rejected (admin only — │
  │           ignored for non-admin callers, who are always   │
  │           restricted to approved reviews server-side)     │
  │  POST   /api/reviews    (public)  { productId, customerName, rating, text } │
  │           always created with status:'pending' — never visible │
  │           publicly until an admin approves it              │
  │  PUT    /api/reviews/:id  (admin) edit fields, and/or moderate: │
  │           { status: 'approved' | 'rejected' | 'pending' }   │
  │  DELETE /api/reviews/:id  (admin)                     │
  └─────────────────────────────────────────────────────┘
*/

router.get('/',       optionalAdminAuth, getReviews);
router.post('/',      reviewCreationIp, addReview);
router.put('/:id',    requireAuth, updateReview);
router.delete('/:id', requireAuth, deleteReview);

module.exports = router;
