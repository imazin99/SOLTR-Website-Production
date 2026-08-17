/**
 * SOLTR — migrateReviewStatus.js
 *
 * One-time migration for the review moderation feature.
 *
 * Every review that existed before the `status` field was added has
 * no value for it in the database. Reviews going forward always get
 * an explicit status at creation time (new submissions: 'pending';
 * admin dashboard's seeded sample reviews: 'approved', set directly
 * in seedReviews.js). This script only handles the gap in between —
 * real reviews that were already live and publicly visible before
 * this feature existed.
 *
 * Strategy: treat every pre-existing review as already approved.
 * They were already publicly visible with no moderation gate at all
 * before this feature — hiding them all on deploy would make
 * legitimate, real customer reviews disappear with no warning. New
 * reviews submitted from now on default to 'pending' (see the Review
 * schema and reviewController.addReview) — this script never touches
 * that; it only backfills the field for documents that don't have it.
 *
 * Idempotent — only updates documents missing the field, so it's
 * safe to run more than once.
 *
 * Run once:  node migrateReviewStatus.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Review   = require('./models/Review');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const result = await Review.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'approved' } }
    );

    console.log(`✅ Migrated ${result.modifiedCount} existing review(s) to status: 'approved'.`);
    console.log('   (Reviews that already had a status were left untouched.)');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
