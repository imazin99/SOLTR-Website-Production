const express = require('express');
const router  = express.Router();
const requireAuth = require('../middleware/auth');

const { getAnalytics } = require('../controllers/analyticsController');

/*
  GET /api/analytics   — all dashboard Analytics-page metrics, computed live from Order data
*/
router.get('/', requireAuth, getAnalytics);

module.exports = router;
