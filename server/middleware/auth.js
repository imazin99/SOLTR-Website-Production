const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

async function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Server misconfiguration: JWT_SECRET is not set' });
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^\s*Bearer\s+(.+?)\s*$/i);
  const token = match ? match[1] : req.cookies?.token;

  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(payload.adminId).select('tokenVersion username');
    if (!admin || Number(admin.tokenVersion || 0) !== Number(payload.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
