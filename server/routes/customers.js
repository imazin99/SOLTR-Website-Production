const express = require('express');
const router  = express.Router();

const requireAuth         = require('../middleware/auth');          // admin JWT
const requireCustomerAuth = require('../middleware/customerAuth');  // customer JWT — separate secret/model

const { getCustomers, getCustomer } = require('../controllers/customerController');
const {
  register,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} = require('../controllers/customerAuthController');
const { getMyOrders } = require('../controllers/customerOrderController');
const {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} = require('../controllers/customerAddressController');

/*
  ┌─────────────────────────────────────────────────────────────┐
  │  SOLTR — /api/customers                                       │
  │  Two unrelated features share this base path by name          │
  │  coincidence only — no shared data, model, or auth domain.     │
  │                                                               │
  │  CUSTOMER ACCOUNT AUTH (public except /me, PUT /me, PUT /me/password) — │
  │  real accounts, server/models/Customer.js, verified via customerAuth.js │
  │  using CUSTOMER_JWT_SECRET:                                    │
  │    POST /api/customers/register       { name, email, phone?, password, rememberMe? } │
  │    POST /api/customers/login          { email, password, rememberMe? }  │
  │    POST /api/customers/logout                                  │
  │    POST /api/customers/forgot-password  { email }                        │
  │    POST /api/customers/reset-password   { token, password }              │
  │    POST /api/customers/verify-email     { token }                        │
  │    POST /api/customers/resend-verification { email }                     │
  │    GET  /api/customers/me             (requires customer JWT)   │
  │    PUT  /api/customers/me             { name?, phone? } (requires customer JWT) │
  │    PUT  /api/customers/me/password    { currentPassword, newPassword } (requires customer JWT) │
  │    GET  /api/customers/me/orders      (requires customer JWT) — matched by customerId, see customerOrderController.js │
  │    GET    /api/customers/me/addresses      (requires customer JWT)   │
  │    POST   /api/customers/me/addresses      { label?, fullName, phone, address, city, isDefault? } │
  │    PUT    /api/customers/me/addresses/:id  any of the same fields, incl. isDefault (also how "make default" works) │
  │    DELETE /api/customers/me/addresses/:id                       │
  │                                                               │
  │  ADMIN DASHBOARD "Customers" PAGE (admin-only) — derived        │
  │  read-only analytics over Order data, verified via auth.js      │
  │  using JWT_SECRET (see server/controllers/customerController.js): │
  │    GET /api/customers            list + search + sort           │
  │    GET /api/customers/:id        single customer (by phone)     │
  │                                                               │
  │  Literal paths (register/login/logout/me) are registered        │
  │  BEFORE /:id so Express never matches e.g. "me" as an :id value. │
  └─────────────────────────────────────────────────────────────┘
*/

/* ── Customer account auth ── */
router.post('/register',     register);
router.post('/login',        login);
router.post('/logout',       logout);
router.post('/forgot-password',     forgotPassword);
router.post('/reset-password',      resetPassword);
router.post('/verify-email',        verifyEmail);
router.post('/resend-verification', resendVerification);
router.get('/me',            requireCustomerAuth, me);
router.put('/me',            requireCustomerAuth, updateProfile);
router.put('/me/password',   requireCustomerAuth, changePassword);
router.get('/me/orders',     requireCustomerAuth, getMyOrders);
router.get('/me/addresses',      requireCustomerAuth, getAddresses);
router.post('/me/addresses',     requireCustomerAuth, addAddress);
router.put('/me/addresses/:id',  requireCustomerAuth, updateAddress);
router.delete('/me/addresses/:id', requireCustomerAuth, deleteAddress);

/* ── Admin dashboard analytics (unchanged) ── */
router.get('/',     requireAuth, getCustomers);
router.get('/:id',  requireAuth, getCustomer);

module.exports = router;
