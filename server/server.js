require('dotenv').config();
const express      = require('express');
const mongoose     = require('mongoose');
const cors         = require('cors');
const path         = require('path');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');

const app  = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const configuredClientOrigin = String(process.env.CLIENT_ORIGIN || '').trim().replace(/\/$/, '');
const configuredOrigins = [process.env.CLIENT_ORIGIN, process.env.FRONTEND_URL]
  .flatMap(value => String(value || '').split(','))
  .map(value => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
const localDevelopmentOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowedOrigins = new Set([...localDevelopmentOrigins, ...configuredOrigins]);

if (isProduction && !configuredClientOrigin) {
  throw new Error('CLIENT_ORIGIN must be set in production');
}

/* ═══════════════════════════════════════════════
   MIDDLEWARE
═══════════════════════════════════════════════ */
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: isProduction,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  noSniff: true,
}));
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy-Report-Only', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: http: https:",
    "connect-src 'self' http: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  next();
});
app.use(cors({
  origin(origin, callback) {
    /* Non-browser requests and direct image loads may have no Origin header. */
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: false,
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
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
  .then(async () => {
    const Order = require('./models/Order');
    const connection = mongoose.connection;
    const databaseName = connection.name;
    const collectionName = Order.collection.name;

    if (databaseName !== 'soltr') {
      throw new Error(`MongoDB connection must target database soltr, received ${databaseName || 'unknown'}`);
    }
    if (collectionName !== 'orders') {
      throw new Error(`Order model must use collection orders, received ${collectionName}`);
    }

    await connection.db.command({ ping: 1 });
    console.log('✅ MongoDB connected');
    console.log(`   Host: ${connection.host || 'unknown'}`);
    console.log(`   Database: ${databaseName}`);
    console.log(`   Order collection: ${collectionName}`);
  })
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

/* Public responses never expose raw database/provider/filesystem errors. */
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled request error:', err);
  if (res.headersSent) return;
  const status = err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({ message: status < 500 ? (err.message || 'Request rejected') : 'Internal server error' });
});

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
