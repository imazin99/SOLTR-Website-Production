const mongoose = require('mongoose');
const Review   = require('../models/Review');
const Product  = require('../models/Product');

/**
 * Shared helper: given a final (already-filtered) list of reviews,
 * compute averageRating, totalCount, and the 5★→1★ distribution.
 * Reused by every response shape below so the math only lives once.
 */
function summarize(reviews) {
  const totalCount = reviews.length;
  const averageRating = totalCount > 0
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10) / 10
    : 0;

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const r of reviews) {
    const star = Math.max(1, Math.min(5, Math.round(r.rating)));
    distribution[star] += 1;
  }

  return { averageRating, totalCount, distribution };
}

/* ═══════════════════════════════════════════════════
   GET /api/reviews
   Public. One flexible endpoint reused by the Home page slider, the
   Product Details page, and the admin dashboard — no duplicate
   endpoints per requirement.

   Query params (all optional):
     ?productId=...   filter to one product (Product Details page, admin filter)
     ?search=...       matches customerName, text, or productName (admin search)
     ?sort=newest|top  newest = most recent first (default), top = highest-rated first
     ?limit=N          cap the number of reviews returned (Home page slider)

   averageRating / totalCount / distribution are always computed over
   the FILTERED set — e.g. with ?productId=, they describe that one
   product, not the whole site.
═══════════════════════════════════════════════════ */
exports.getReviews = async (req, res) => {
  try {
    const { productId, search, sort = 'newest', limit } = req.query;

    const filter = {};
    if (productId) {
      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ message: 'Invalid productId format' });
      }
      filter.productId = productId;
    }
    if (search && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re   = new RegExp(safe, 'i');
      filter.$or = [{ customerName: re }, { text: re }, { productName: re }];
    }

    let reviews = await Review.find(filter);

    /* Stats always reflect the full filtered set, computed BEFORE any ?limit= truncation */
    const { averageRating, totalCount, distribution } = summarize(reviews);

    reviews = sort === 'top'
      ? reviews.sort((a, b) => b.rating - a.rating || b.createdAt - a.createdAt)
      : reviews.sort((a, b) => b.createdAt - a.createdAt);

    const limitNum = parseInt(limit, 10);
    if (Number.isFinite(limitNum) && limitNum > 0) {
      reviews = reviews.slice(0, limitNum);
    }

    res.json({ reviews, averageRating, totalCount, distribution });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch reviews', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/reviews
   Public — no customer-account system exists yet, so this stays
   anonymous for now (see server/models/Review.js's note on `verified`).
   Body: { productId, customerName, rating, text }
═══════════════════════════════════════════════════ */
exports.addReview = async (req, res) => {
  try {
    const { productId, customerName, rating, text } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'A valid productId is required' });
    }
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ message: 'Reviewer name is required' });
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5' });
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Review text is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    /* verified stays false here — there's no order/customer-account link
       to check yet. Wiring that check in later (e.g. "has this
       visitorId/customer completed an order containing this product")
       is the only change needed to make this honest, without touching
       anything else in this controller. */
    const review = await Review.create({
      productId,
      productName: product.name,
      customerName: customerName.trim(),
      rating: ratingNum,
      text: text.trim(),
      verified: false,
    });

    res.status(201).json(review);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/reviews/:id
   Admin-only (future-ready) — there's no customer-account system to
   verify a reviewer is editing their own review, so this is
   restricted to admins rather than left open to any anonymous caller.
   Body: any of { customerName, rating, text }
═══════════════════════════════════════════════════ */
exports.updateReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid review ID format' });
    }

    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    const { customerName, rating, text } = req.body;

    if (customerName !== undefined) {
      if (!customerName.trim()) return res.status(400).json({ message: 'Reviewer name cannot be empty' });
      review.customerName = customerName.trim();
    }
    if (rating !== undefined) {
      const ratingNum = Number(rating);
      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5' });
      }
      review.rating = ratingNum;
    }
    if (text !== undefined) {
      if (!text.trim()) return res.status(400).json({ message: 'Review text cannot be empty' });
      review.text = text.trim();
    }

    await review.save();
    res.json(review);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   DELETE /api/reviews/:id
   Admin-only.
═══════════════════════════════════════════════════ */
exports.deleteReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid review ID format' });
    }

    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    res.json({ message: 'Review deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete review', error: err.message });
  }
};
