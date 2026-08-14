const jwt = require('jsonwebtoken');

/**
 * SOLTR — server/middleware/optionalAdminAuth.js
 *
 * Same verification as requireAuth (auth.js) — same secret, same
 * token — but never blocks the request. Used only on GET /api/reviews,
 * which is a single endpoint reused by the public storefront (Home
 * slider, Product Details) AND the admin dashboard's Reviews section
 * (see reviewController.js's own comment: "no duplicate endpoints").
 *
 * If a valid admin token is present, req.admin = { adminId, username,
 * iat, exp } is attached, and the controller allows seeing reviews of
 * any moderation status. If the header is missing, malformed, or the
 * token is invalid/expired, req.admin is left undefined and the
 * controller forces status:'approved' — the public storefront must
 * never see pending or rejected reviews, and must never be able to
 * bypass that by sending its own ?status= value.
 */
function optionalAdminAuth(req, res, next) {
  if (!process.env.JWT_SECRET) return next();

  const header = req.headers.authorization || '';
  const match = header.match(/^\s*Bearer\s+(.+?)\s*$/i);
  const token = match ? match[1] : (req.cookies?.token || null);

  if (!token) return next();

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Invalid or expired token — proceed as a public (non-admin) caller.
  }

  next();
}

module.exports = optionalAdminAuth;
