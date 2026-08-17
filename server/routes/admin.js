const express = require('express');
const router  = express.Router();

const requireAuth = require('../middleware/auth');
const { getAdmin, updateAdminName, updateAdminPassword } = require('../controllers/adminController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Admin Account API  (admin-only)             │
  │  (Settings page → Admin Account card)                │
  │                                                     │
  │  GET /api/admin              current admin (no hash)  │
  │  PUT /api/admin/name         { name }                 │
  │  PUT /api/admin/password     { currentPassword, newPassword } │
  └─────────────────────────────────────────────────────┘
*/
router.get('/',          requireAuth, getAdmin);
router.put('/name',      requireAuth, updateAdminName);
router.put('/password',  requireAuth, updateAdminPassword);

module.exports = router;
