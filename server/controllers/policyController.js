const Policy = require('../models/Policy');

/* ═══════════════════════════════════════════════════
   GET /api/policies
   Admin-only. Lists every policy page (slug, title, updatedAt) for
   the Content Management dashboard screen — no content body, since
   the list view only needs enough to render the table + Edit links.
═══════════════════════════════════════════════════ */
exports.getAllPolicies = async (req, res) => {
  try {
    const policies = await Policy.find().select('slug title updatedAt').sort({ title: 1 });
    res.json(policies);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch policy pages', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   GET /api/policies/:slug
   Public. Powers the local policy.html?slug=... pages. Returns 404
   if that slug hasn't been created yet (e.g. the other four policy
   pages, which don't exist until their own phase) so the frontend
   can show a clean "not available yet" state instead of erroring.
═══════════════════════════════════════════════════ */
exports.getPolicyBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const policy = await Policy.findOne({ slug });
    if (!policy) return res.status(404).json({ message: 'Policy page not found' });
    res.json(policy);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch policy page', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/policies/:slug
   Admin-only. Upsert — creates the document on first save if it
   doesn't exist yet (so the dashboard editor works even before a
   seed script has run), updates it otherwise.
   Body: { title, content }
═══════════════════════════════════════════════════ */
exports.upsertPolicy = async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { title, content } = req.body;

    if (!slug) return res.status(400).json({ message: 'Slug is required' });
    if (title !== undefined && !title.trim()) {
      return res.status(400).json({ message: 'Title cannot be empty' });
    }
    if (content !== undefined && !content.trim()) {
      return res.status(400).json({ message: 'Content cannot be empty' });
    }

    const update = {};
    if (title   !== undefined) update.title   = title.trim();
    if (content !== undefined) update.content = content;

    const policy = await Policy.findOneAndUpdate(
      { slug },
      { $set: update, $setOnInsert: { slug } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json(policy);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};
