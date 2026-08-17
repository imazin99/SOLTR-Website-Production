const bcrypt = require('bcrypt');
const Admin  = require('../models/Admin');

const SALT_ROUNDS = 10;

/**
 * Finds the single Admin document, creating it with defaults (and a
 * hashed default password) if none exists yet. Always includes
 * passwordHash (needed internally for login + password-change) —
 * every caller is responsible for stripping it before sending any
 * response (see toSafeAdminJSON below).
 */
async function getOrCreateAdmin() {
  let admin = await Admin.findOne().select('+passwordHash');
  if (!admin) {
    const passwordHash = await bcrypt.hash('maziinsoltr99', SALT_ROUNDS);
    admin = await Admin.create({ passwordHash });
    admin = await Admin.findById(admin._id).select('+passwordHash');
  }
  return admin;
}

/** Strips passwordHash from an Admin document before it's ever sent in a response. */
function toSafeAdminJSON(admin) {
  return { id: admin._id, username: admin.username, name: admin.name };
}

module.exports = { getOrCreateAdmin, toSafeAdminJSON, SALT_ROUNDS };
