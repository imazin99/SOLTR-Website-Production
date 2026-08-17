const express = require('express');
const router  = express.Router();

const { getAnalytics } = require('../controllers/analyticsController');

/*
  GET /api/analytics   — all dashboard Analytics-page metrics, computed live from Order data
*/
router.get('/', getAnalytics);

module.exports = router;
