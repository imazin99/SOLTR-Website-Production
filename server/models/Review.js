const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Review.js
 *
 * productId is a REAL ref to Product (required) — needed so the Home
 * page slider and admin dashboard can filter/link by product, and so
 * "Reviewed Product Name" can link to that exact product's detail page.
 *
 * productName is ALSO kept as a snapshot at creation time (same
 * "snapshot, don't look up on every read" convention used by
 * Order.items elsewhere in this project) — display stays correct and
 * fast even if the product is later renamed, without a populate() on
 * every request.
 *
 * verified ("Verified Purchase"): there is no customer-account or
 * order-linkage system yet, so a publicly-submitted review has no way
 * to be genuinely verified. New reviews via POST /api/reviews default
 * to false — marking them "verified" with nothing behind that claim
 * would be a false badge shown to shoppers. Only curated/seeded
 * sample reviews (server/seedReviews.js) are marked true, since
 * those are explicitly the store owner's own sample content, not
 * anonymous public submissions. This field is named/typed so it's
 * ready to be driven by a real order-linkage check later (see
 * reviewController.js's addReview for exactly where that hook goes).
 */
const reviewSchema = new mongoose.Schema(
  {
    productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName:  { type: String, required: true, trim: true }, // snapshot, see above
    customerName: { type: String, required: true, trim: true },
    rating:       { type: Number, required: true, min: 1, max: 5 },
    text:         { type: String, required: true, trim: true },
    verified:     { type: Boolean, default: false },
  },
  { timestamps: true } // createdAt drives the "2 days ago" relative date on the storefront
);

reviewSchema.index({ productId: 1, createdAt: -1 }); // fast per-product review lookups

module.exports = mongoose.model('Review', reviewSchema);
