const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Setting.js
 *
 * Singleton document: SOLTR has exactly one store, so there is exactly
 * one Setting document. settingsController always operates on the
 * first (and only) document, creating it with sensible defaults on
 * first read if it doesn't exist yet — no separate seed step needed.
 */
const settingSchema = new mongoose.Schema(
  {
    storeName:        { type: String, required: true, trim: true, default: 'SOLTR Wear' },
    storeEmail:        { type: String, required: true, trim: true, lowercase: true, default: 'admin@soltrwear.com' },
    whatsappNumber:    { type: String, required: true, trim: true, default: '+20 111 145 5086' },
    instagramHandle:   { type: String, trim: true, default: '@soltr_wear' },
    storeDescription:  { type: String, trim: true, default: 'Premium heavyweight cotton tees, boxy cut, zero filler. Made in Egypt.' },
    freeShipping:      { type: Boolean, default: true },
    cashOnDelivery:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
