const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

async function optionalCustomerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^\s*Bearer\s+(.+?)\s*$/i);
  if (!match) return next();

  if (!process.env.CUSTOMER_JWT_SECRET) {
    return res.status(500).json({ message: 'Server misconfiguration: CUSTOMER_JWT_SECRET is not set' });
  }

  try {
    const payload = jwt.verify(match[1], process.env.CUSTOMER_JWT_SECRET);
    const customer = await Customer.findById(payload.customerId).select('tokenVersion email');
    if (!customer || Number(customer.tokenVersion || 0) !== Number(payload.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    req.customer = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = optionalCustomerAuth;
