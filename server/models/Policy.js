const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Policy.js
 *
 * Phase 8 (Content Management): one document per footer policy page,
 * keyed by a unique `slug`. This is the reusable content model the
 * handoff doc calls for — Return & Refund is the first slug seeded,
 * and Shipping Policy / Privacy Policy / Terms of Service / Contact
 * Information will each get their own document with the same shape
 * in later conversations. No new model/route/controller pattern
 * needed per page — just a new slug.
 *
 * `content` is stored as plain text, one logical line per paragraph
 * (blank lines are ignored). This keeps the admin editor a single
 * plain textarea — no rich-text editor / HTML sanitization needed —
 * while the public page renders each line as its own paragraph and
 * auto-bolds a leading "Label:" prefix if present (see policy.js).
 */
const policySchema = new mongoose.Schema(
  {
    slug:    { type: String, required: true, unique: true, trim: true, lowercase: true },
    title:   { type: String, required: true, trim: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);
