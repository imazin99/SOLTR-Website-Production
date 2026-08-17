const express = require('express');
const router  = express.Router();

const requireAuth = require('../middleware/auth');
const { adminLoginIp, adminLoginAccount } = require('../middleware/rateLimits');
const { login, logout, me } = require('../controllers/authController');

/*
  ┌─────────────────────────────────────────────────────┐
  │  SOLTR — Auth API                                    │
  │                                                     │
  │  POST /api/auth/login    (public)  { username, password } → { token, admin } │
  │  POST /api/auth/logout   (public)  stateless JWT — confirms only, no server state to clear │
  │  GET  /api/auth/me       (protected) → currently authenticated admin's safe info, verifies the token │
  └─────────────────────────────────────────────────────┘
*/

router.post('/login',  adminLoginIp, adminLoginAccount, login);
router.post('/logout', requireAuth, logout);
router.get('/me',      requireAuth, me);

module.exports = router;
