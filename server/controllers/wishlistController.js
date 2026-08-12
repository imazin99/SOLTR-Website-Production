const mongoose  = require('mongoose');
const Wishlist  = require('../models/Wishlist');

/* ═══════════════════════════════════════════════════
   GET /api/wishlist?visitorId=xxx
   Returns the list of product IDs this visitor has wishlisted.
   Deliberately lean — the frontend already has full product data
   from GET /api/products and just needs to know which IDs to filter to.
═══════════════════════════════════════════════════ */
exports.getWishlist = async (req, res) => {
  try {
    const { visitorId } = req.query;
    if (!visitorId || !visitorId.trim()) {
      return res.status(400).json({ message: 'visitorId is required' });
    }

    const items = await Wishlist.find({ visitorId: visitorId.trim() }).sort({ createdAt: -1 });
    res.json(items.map(i => ({ productId: i.productId, addedAt: i.createdAt })));
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch wishlist', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/wishlist
   Body: { visitorId, productId }
   Idempotent — adding an already-wishlisted product is a harmless no-op.
═══════════════════════════════════════════════════ */
exports.addToWishlist = async (req, res) => {
  try {
    const { visitorId, productId } = req.body;

    if (!visitorId || !visitorId.trim()) {
      return res.status(400).json({ message: 'visitorId is required' });
    }
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'A valid productId is required' });
    }

    try {
      await Wishlist.create({ visitorId: visitorId.trim(), productId });
    } catch (err) {
      if (err.code !== 11000) throw err; // 11000 = already wishlisted, ignore (idempotent)
    }

    res.status(201).json({ message: 'Added to wishlist' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add to wishlist', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   DELETE /api/wishlist/:productId?visitorId=xxx
═══════════════════════════════════════════════════ */
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const { visitorId }  = req.query;

    if (!visitorId || !visitorId.trim()) {
      return res.status(400).json({ message: 'visitorId is required' });
    }
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid productId format' });
    }

    await Wishlist.deleteOne({ visitorId: visitorId.trim(), productId });
    res.json({ message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove from wishlist', error: err.message });
  }
};
