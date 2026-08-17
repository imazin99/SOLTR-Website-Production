const express = require('express');
const router  = express.Router();

const { getSettings, updateSettings } = require('../controllers/settingsController');

/*
  GET /api/settings   — current store settings (auto-created with defaults on first read)
  PUT /api/settings   — update store settings
*/
router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
