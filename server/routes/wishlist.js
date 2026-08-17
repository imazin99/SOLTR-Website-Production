const express = require('express');
const router  = express.Router();

const { getWishlist, addToWishlist, removeFromWishlist } = require('../controllers/wishlistController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Wishlist API  (public — anonymous visitor)   │
  │                                                     │
  │  GET    /api/wishlist?visitorId=xxx        list product IDs │
  │  POST   /api/wishlist                      { visitorId, productId } │
  │  DELETE /api/wishlist/:productId?visitorId=xxx        │
  └─────────────────────────────────────────────────────┘
*/

router.get('/',              getWishlist);
router.post('/',              addToWishlist);
router.delete('/:productId',  removeFromWishlist);

module.exports = router;
