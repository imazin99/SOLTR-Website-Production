const Visitor = require('../models/Visitor');

/* ═══════════════════════════════════════════════════
   POST /api/visitors/register
   Called automatically by the storefront on every page load.
   Idempotent: if visitorId already exists, this is a no-op —
   the count only ever grows when a genuinely new visitorId
   shows up. Safe to call on every single page view/refresh.

   Body: { visitorId }
═══════════════════════════════════════════════════ */
exports.registerVisit = async (req, res) => {
  try {
    const { visitorId } = req.body;

    if (!visitorId || typeof visitorId !== 'string' || !visitorId.trim()) {
      return res.status(400).json({ message: 'visitorId is required' });
    }

    /* findOneAndUpdate + upsert: creates the document only if it
       doesn't already exist. Existing visitors are simply returned
       unchanged — no duplicate document, no double-count. */
    const visitor = await Visitor.findOneAndUpdate(
      { visitorId: visitorId.trim() },
      { $setOnInsert: { visitorId: visitorId.trim(), firstSeenAt: new Date() } },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Visit registered', visitorId: visitor.visitorId });
  } catch (err) {
    /* Unique-index race (two near-simultaneous first requests for the
       same new visitorId) — harmless, the visitor is already counted */
    if (err.code === 11000) {
      return res.status(200).json({ message: 'Visit already registered' });
    }
    res.status(500).json({ message: 'Failed to register visit', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   GET /api/visitors/count
   Total number of unique visitors ever recorded.
═══════════════════════════════════════════════════ */
exports.getVisitorCount = async (req, res) => {
  try {
    const totalVisitors = await Visitor.countDocuments();
    res.json({ totalVisitors });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch visitor count', error: err.message });
  }
};
