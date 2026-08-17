/**
 * SOLTR — seedReviews.js
 * Seeds the database with sample customer reviews.
 *
 * Reviews now require a real productId (see server/models/Review.js),
 * so this looks up each product by name in the real Product
 * collection first, rather than hardcoding a fake ID.
 *
 * These seeded reviews are marked verified:true deliberately — they
 * represent curated sample content the store owner is choosing to
 * show, not anonymous public submissions (which always default to
 * verified:false — see reviewController.js's addReview).
 *
 * Run once:  node seedReviews.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Review   = require('./models/Review');
const Product  = require('./models/Product');

const SEED = [
  { customerName: 'Ali',             rating: 5, text: 'Quality and fast shipping. Thank you.',                    productName: 'Hustle' },
  { customerName: 'Youssef Rohayem', rating: 5, text: "Great quality for the price. It doesn't feel like fast fashion at all.", productName: 'Off-Center' },
  { customerName: 'Mohamed Yasser',  rating: 5, text: 'Amazing! Better than expected, the fabric is genuinely heavyweight.', productName: 'Legend' },
  { customerName: 'Ahmedd',          rating: 4, text: 'Great product, sizing runs slightly big so keep that in mind.', productName: 'The Perfect Boxy' },
  { customerName: 'Saly',            rating: 5, text: 'Perfect size and great material. Ordered a second one in Black.', productName: 'Inklaw' },
  { customerName: 'Karim Adel',      rating: 5, text: 'Delivery was quick and the boxy fit is exactly what I wanted.', productName: 'The Perfect Boxy' },
  { customerName: 'Nour Hassan',     rating: 4, text: 'Really solid tee, the print held up well after a few washes.', productName: 'Legend' },
  { customerName: 'Omar Tarek',      rating: 5, text: 'This is my third order from Soltr, never disappoints.',        productName: 'Hustle' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    await Review.deleteMany({});
    console.log('🗑️  Cleared existing reviews');

    let seeded = 0, skipped = 0;
    for (const r of SEED) {
      const product = await Product.findOne({ name: r.productName });
      if (!product) {
        console.log(`  ⚠️  Skipped review from ${r.customerName} — no product named "${r.productName}" found. Run the product seed first.`);
        skipped++;
        continue;
      }

      await Review.create({
        productId: product._id,
        productName: product.name,
        customerName: r.customerName,
        rating: r.rating,
        text: r.text,
        verified: true, // curated sample content — see file header
        status: 'approved', // same reasoning as verified:true — this is intentionally-shown curated content, not an anonymous public submission
      });
      console.log(`  ✅ Seeded review from ${r.customerName} for "${product.name}"`);
      seeded++;
    }

    console.log(`\n🎉 Seed complete — ${seeded} reviews added${skipped ? `, ${skipped} skipped (product not found)` : ''}.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
