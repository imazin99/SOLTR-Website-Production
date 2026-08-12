const Setting = require('../models/Setting');

/* Simple, dependency-free validators (same pattern as other controllers in this project) */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Accepts +country code / spaces / dashes, 8-15 digits total — permissive enough for
   Egyptian numbers (+20...) and WhatsApp's own formatting, strict enough to catch typos */
const PHONE_RE = /^\+?[\d\s-]{8,20}$/;

/** Finds the single Setting document, creating it with schema defaults if none exists yet. */
async function getOrCreateSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

/* ═══════════════════════════════════════════════════
   GET /api/settings
═══════════════════════════════════════════════════ */
exports.getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch settings', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/settings
   Body: { storeName, storeEmail, whatsappNumber, instagramHandle,
           storeDescription, freeShipping, cashOnDelivery }
   All fields optional in the request — only provided fields are
   validated + updated, everything else is left as-is.
═══════════════════════════════════════════════════ */
exports.updateSettings = async (req, res) => {
  try {
    const {
      storeName, storeEmail, whatsappNumber,
      instagramHandle, storeDescription,
      freeShipping, cashOnDelivery,
    } = req.body;

    /* ── Validation ── */
    if (storeName !== undefined && !storeName.trim()) {
      return res.status(400).json({ message: 'Store Name cannot be empty' });
    }
    if (storeEmail !== undefined && !EMAIL_RE.test(storeEmail.trim())) {
      return res.status(400).json({ message: 'Please enter a valid Store Email' });
    }
    if (whatsappNumber !== undefined && !PHONE_RE.test(whatsappNumber.trim())) {
      return res.status(400).json({ message: 'Please enter a valid WhatsApp Number' });
    }

    const settings = await getOrCreateSettings();

    if (storeName        !== undefined) settings.storeName        = storeName.trim();
    if (storeEmail        !== undefined) settings.storeEmail        = storeEmail.trim().toLowerCase();
    if (whatsappNumber     !== undefined) settings.whatsappNumber     = whatsappNumber.trim();
    if (instagramHandle    !== undefined) settings.instagramHandle    = instagramHandle.trim();
    if (storeDescription   !== undefined) settings.storeDescription   = storeDescription.trim();
    if (freeShipping       !== undefined) settings.freeShipping       = Boolean(freeShipping);
    if (cashOnDelivery     !== undefined) settings.cashOnDelivery     = Boolean(cashOnDelivery);

    await settings.save();
    res.json(settings);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};
