const express = require('express');
const router  = express.Router();

const requireAuth = require('../middleware/auth');
const { getReviews, addReview, updateReview, deleteReview } = require('../controllers/reviewController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Reviews API                                 │
  │                                                     │
  │  GET    /api/reviews    (public)  ?productId=&search=&sort=&limit= │
  │  POST   /api/reviews    (public)  { productId, customerName, rating, text } │
  │  PUT    /api/reviews/:id  (admin) future-ready edit    │
  │  DELETE /api/reviews/:id  (admin)                     │
  └─────────────────────────────────────────────────────┘
*/

router.get('/',       getReviews);
router.post('/',      addReview);
router.put('/:id',    requireAuth, updateReview);
router.delete('/:id', requireAuth, deleteReview);

module.exports = router;
