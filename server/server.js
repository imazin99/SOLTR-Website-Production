require('dotenv').config();
const express      = require('express');
const mongoose     = require('mongoose');
const cors         = require('cors');
const path         = require('path');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ═══════════════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════════════ */
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
/* Parses cookies into req.cookies. Not the primary auth mechanism
   (see middleware/auth.js) — the frontend is served as static files
   from a different origin than the API, so a cross-origin httpOnly
   cookie would need SameSite=None; Secure (HTTPS-only) to work
   reliably. Wired in as a working, optional fallback: if this project
   is ever deployed same-origin, issuing a cookie from
   authController.login and reading it here becomes a safe upgrade. */
app.use(cookieParser());

/* ── Serve uploaded images as static files ──
   GET /uploads/products/filename.jpg  */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ═══════════════════════════════════════════════
   DATABASE
═══════════════════════════════════════════════ */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected')) // never log process.env.MONGO_URI itself — it embeds credentials
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

/* ═══════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════ */
app.use('/api/auth',      require('./routes/auth'));       // NEW — POST /api/auth/login (public, issues JWT)
app.use('/api/products',  require('./routes/products'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/coupons',   require('./routes/coupons'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/admin',     require('./routes/admin'));       // NEW — Settings page Admin Account card (name/password)
app.use('/api/visitors',  require('./routes/visitors'));
app.use('/api/reviews',   require('./routes/reviews'));
app.use('/api/wishlist',  require('./routes/wishlist'));
app.use('/api/policies',  require('./routes/policies'));  // NEW — Phase 8: Content Management (footer policy pages)
app.use('/api/email-test', require('./routes/emailTest')); // NEW — Phase 12: admin-only endpoint to verify Resend is wired up

/* Health check */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

/* 404 fallback */
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

/* ═══════════════════════════════════════════════
   START
═══════════════════════════════════════════════ */
app.listen(PORT, () => {
  const base = process.env.NODE_ENV === 'production'
    ? `port ${PORT}`
    : `http://localhost:${PORT}`;
  console.log(`🚀 SOLTR Server running → ${base}`);
  console.log(`   Health check  → /api/health`);
});
