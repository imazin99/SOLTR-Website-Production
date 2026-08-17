const jwt = require('jsonwebtoken');

/**
 * SOLTR — server/middleware/customerAuth.js
 *
 * Verifies a CUSTOMER JWT, completely independent from
 * server/middleware/auth.js (admin). Uses CUSTOMER_JWT_SECRET — a
 * different secret from the admin's JWT_SECRET — so a customer token
 * can never be used against admin-protected routes, and an admin
 * token can never be used here, even by accident. Two separate trust
 * domains, verified with two separate keys.
 *
 * Expects: Authorization: Bearer <token>
 * On success: attaches req.customer = { customerId, email, iat, exp }
 * On any failure: responds 401 immediately, route handler never runs.
 */
function requireCustomerAuth(req, res, next) {
  if (!process.env.CUSTOMER_JWT_SECRET) {
    return res.status(500).json({ message: 'Server misconfiguration: CUSTOMER_JWT_SECRET is not set' });
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);
    req.customer = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = requireCustomerAuth;
