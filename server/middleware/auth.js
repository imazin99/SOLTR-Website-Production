const jwt = require('jsonwebtoken');

/**
 * SOLTR — server/middleware/auth.js
 *
 * Protects admin-only routes. Primary mechanism:
 *   Authorization: Bearer <token>
 *
 * Fallback: also accepts a `token` cookie (req.cookies.token, via
 * cookie-parser in server.js) if no Authorization header is present.
 * Not currently issued by authController.login — this project's
 * frontend is served as static files from a different origin than the
 * API, so a cross-origin httpOnly cookie needs SameSite=None; Secure
 * (HTTPS-only) to work reliably in browsers. The fallback is wired in
 * and functional so cookie-based auth becomes a safe drop-in upgrade
 * (just add res.cookie('token', ...) in authController.login) if this
 * is ever deployed same-origin.
 *
 * On success, attaches the decoded payload to req.admin ({ adminId, username })
 * and calls next(). On any failure, responds 401 immediately — the route
 * handler never runs.
 *
 * Does NOT touch: GET/POST endpoints the public storefront calls directly
 * (product browsing, placing an order, coupon validation, visitor
 * registration) — those stay open on purpose. See routes/*.js for which
 * endpoints use this middleware and which don't.
 */
function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Server misconfiguration: JWT_SECRET is not set' });
  }

  const header = req.headers.authorization || '';
  const [scheme, headerToken] = header.split(' ');

  const token = (scheme === 'Bearer' && headerToken) ? headerToken : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { adminId, username, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
