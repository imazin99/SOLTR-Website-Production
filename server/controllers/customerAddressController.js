const mongoose = require('mongoose');
const Address  = require('../models/Address');

const PHONE_RE = /^\+?[\d\s-]{8,20}$/;

/**
 * SOLTR — server/controllers/customerAddressController.js
 *
 * Every handler scopes its query to req.customer.customerId (from the
 * verified JWT payload — server/middleware/customerAuth.js). There is
 * no way to pass a different customer's ID and touch their addresses;
 * no new auth logic was written, this just reuses the same middleware
 * every other customer-facing endpoint already uses.
 */

function validateAddressFields({ fullName, phone, address, city }, { partial = false } = {}) {
  if (!partial || fullName !== undefined) {
    if (!fullName || !fullName.trim()) return 'Full name is required';
  }
  if (!partial || phone !== undefined) {
    if (!phone || !PHONE_RE.test(phone.trim())) return 'A valid phone number is required';
  }
  if (!partial || address !== undefined) {
    if (!address || !address.trim()) return 'Street address is required';
  }
  if (!partial || city !== undefined) {
    if (!city || !city.trim()) return 'City is required';
  }
  return null;
}

/* ═══════════════════════════════════════════════════
   GET /api/customers/me/addresses
═══════════════════════════════════════════════════ */
exports.getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ customerId: req.customer.customerId }).sort({ isDefault: -1, createdAt: -1 });
    res.json(addresses);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch addresses', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/me/addresses
   Body: { label?, fullName, phone, address, city, isDefault? }
   The very first address a customer saves is always made default,
   regardless of what was submitted — there must always be a sensible
   default once at least one address exists.
═══════════════════════════════════════════════════ */
exports.addAddress = async (req, res) => {
  try {
    const { label, fullName, phone, address, city, isDefault } = req.body;

    const validationError = validateAddressFields({ fullName, phone, address, city });
    if (validationError) return res.status(400).json({ message: validationError });

    const existingCount = await Address.countDocuments({ customerId: req.customer.customerId });
    const shouldBeDefault = existingCount === 0 || Boolean(isDefault);

    if (shouldBeDefault) {
      await Address.updateMany({ customerId: req.customer.customerId }, { isDefault: false });
    }

    const doc = await Address.create({
      customerId: req.customer.customerId,
      label: (label || 'Home').trim(),
      fullName: fullName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      isDefault: shouldBeDefault,
    });

    res.status(201).json(doc);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/customers/me/addresses/:id
   Body: any of { label, fullName, phone, address, city, isDefault }
   Also used for "make this my default address" (body: { isDefault: true })
   — no separate endpoint needed for that.
═══════════════════════════════════════════════════ */
exports.updateAddress = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid address ID format' });
    }

    const { label, fullName, phone, address, city, isDefault } = req.body;

    const validationError = validateAddressFields({ fullName, phone, address, city }, { partial: true });
    if (validationError) return res.status(400).json({ message: validationError });

    const doc = await Address.findOne({ _id: req.params.id, customerId: req.customer.customerId });
    if (!doc) return res.status(404).json({ message: 'Address not found' });

    if (label !== undefined)    doc.label    = label.trim() || 'Home';
    if (fullName !== undefined) doc.fullName = fullName.trim();
    if (phone !== undefined)    doc.phone    = phone.trim();
    if (address !== undefined)  doc.address  = address.trim();
    if (city !== undefined)     doc.city     = city.trim();

    if (isDefault === true && !doc.isDefault) {
      /* Ensure only one default ever exists — unset every other address for this customer first */
      await Address.updateMany({ customerId: req.customer.customerId, _id: { $ne: doc._id } }, { isDefault: false });
      doc.isDefault = true;
    } else if (isDefault === false) {
      doc.isDefault = false;
    }

    await doc.save();
    res.json(doc);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   DELETE /api/customers/me/addresses/:id
═══════════════════════════════════════════════════ */
exports.deleteAddress = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid address ID format' });
    }

    const doc = await Address.findOneAndDelete({ _id: req.params.id, customerId: req.customer.customerId });
    if (!doc) return res.status(404).json({ message: 'Address not found' });

    res.json({ message: 'Address deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete address', error: err.message });
  }
};
