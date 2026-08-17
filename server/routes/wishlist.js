const express = require('express');
const router  = express.Router();
const { wishlistIp } = require('../middleware/rateLimits');

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

router.get('/',              wishlistIp, getWishlist);
router.post('/',              wishlistIp, addToWishlist);
router.delete('/:productId',  wishlistIp, removeFromWishlist);

module.exports = router;
