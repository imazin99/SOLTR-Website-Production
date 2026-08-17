const express = require('express');
const router  = express.Router();

const requireAuth = require('../middleware/auth');
const { getAllPolicies, getPolicyBySlug, upsertPolicy } = require('../controllers/policyController');

/*
  GET  /api/policies        — list all policy pages (admin-only, Content Management table)
  GET  /api/policies/:slug  — fetch one policy page's content (public, local policy.html)
  PUT  /api/policies/:slug  — create/update one policy page's content (admin-only)
*/
router.get('/', requireAuth, getAllPolicies);
router.get('/:slug', getPolicyBySlug);
router.put('/:slug', requireAuth, upsertPolicy);

module.exports = router;
