const mongoose = require('mongoose');

/**
 * SOLTR — server/models/Address.js
 *
 * A customer's saved address book. This is a genuinely new data
 * domain — Order.customer.address/city (server/models/Order.js) is a
 * per-order SNAPSHOT taken at checkout time, not a reusable, editable
 * address a customer can save/update/delete ahead of time. There was
 * nothing to reuse here, so this is intentionally the one new model
 * Phase 7 required.
 *
 * field names (address/city) match Order.customer's naming exactly,
 * for consistency across the codebase.
 */
const addressSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    label:      { type: String, default: 'Home', trim: true },      // e.g. "Home", "Work"
    fullName:   { type: String, required: true, trim: true },        // recipient name
    phone:      { type: String, required: true, trim: true },
    address:    { type: String, required: true, trim: true },        // street address
    city:       { type: String, required: true, trim: true },
    isDefault:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

addressSchema.index({ customerId: 1 });

module.exports = mongoose.model('Address', addressSchema);
