const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Admin.js
 *
 * Singleton document: one admin account. `passwordHash` is a bcrypt
 * hash — the plain-text password is NEVER stored and NEVER returned
 * by any API response (see adminController.js, which always excludes
 * it with a projection).
 *
 * NOTE on scope: this model backs the "Admin Account" section of the
 * Settings dashboard page ONLY (change name / change password). The
 * separate client-side login screen (login.html / auth.js) still uses
 * its own hardcoded localStorage-based check — that flow is out of
 * scope for this feature and was intentionally left untouched to
 * avoid breaking dashboard login. See adminController.js for details.
 */
const adminSchema = new mongoose.Schema(
  {
    username:     { type: String, required: true, trim: true, unique: true,      default: undefined },
    name:         { type: String, required: true, trim: true, default: 'Mazen Ahmed' },
    passwordHash: { type: String, required: true, select: false }, // never returned unless explicitly requested
    tokenVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
