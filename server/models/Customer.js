const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Customer.js
 *
 * A real, persisted customer account — separate from, and unrelated
 * to, the admin dashboard's "Customers" page (server/controllers/
 * customerController.js), which derives its data entirely from
 * Order.aggregate() and never reads or writes this collection. The
 * two just happen to share the word "customer"; they are otherwise
 * completely independent features with zero data overlap.
 *
 * This file previously held a documentation-only schema that was
 * never actually used anywhere (confirmed: nothing imported it) — it
 * described the *shape* of the admin page's derived view without ever
 * persisting real documents. It's replaced here with the real model
 * backing customer registration/login, since nothing depended on the
 * old version.
 *
 * Also separate from server/models/Admin.js — admin and customer
 * accounts are two independent trust domains with their own models,
 * password hashes, and JWT secrets (CUSTOMER_JWT_SECRET vs
 * JWT_SECRET). A customer can never authenticate as an admin or
 * vice versa, even in principle.
 */
const customerSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, trim: true, lowercase: true, unique: true },
    phone:        { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true, select: false }, // never returned unless explicitly requested
    lastLoginAt:  { type: Date, default: null },
    tokenVersion:  { type: Number, default: 0, min: 0 },

    /* Forgot Password — only the SHA-256 hash of the reset token is
       ever stored, never the raw token itself (that's emailed to the
       customer once and never persisted). select:false for the same
       reason as passwordHash. Cleared back to null the moment the
       token is used or replaced, making each token single-use. */
    resetTokenHash:   { type: String, default: null, select: false },
    resetTokenExpiry: { type: Date,   default: null, select: false },

    /* Email verification — same hashed-token pattern as password
       reset above, for the same reason (never store the raw token).
       emailVerified gates login (see customerAuthController.js);
       accounts start unverified and stay that way until the customer
       clicks the link in the verification email. lastVerificationEmailSentAt
       backs the resend cooldown, so it can't be used to spam an inbox. */
    emailVerified:               { type: Boolean, default: false },
    emailVerificationTokenHash:  { type: String, default: null, select: false },
    emailVerificationExpiresAt:  { type: Date,   default: null, select: false },
    lastVerificationEmailSentAt: { type: Date,   default: null, select: false },
  },
  { timestamps: true } // createdAt = "Member Since" / "Account Creation Date"
);

module.exports = mongoose.model('Customer', customerSchema);
