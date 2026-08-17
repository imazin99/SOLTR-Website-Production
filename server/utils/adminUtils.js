const bcrypt = require('bcrypt');
const Admin  = require('../models/Admin');

const SALT_ROUNDS = 10;

/**
 * Finds the singleton admin, creating it only when explicit bootstrap
 * credentials are supplied through the local/server environment.
 */
async function getOrCreateAdmin() {
  let admin = await Admin.findOne().select('+passwordHash');
  if (!admin) {
    const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
    const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');
    const name = String(process.env.ADMIN_BOOTSTRAP_NAME || 'SOLTR Admin').trim();
    if (!username || !password || password.length < 12) {
      const error = new Error('Admin account is not initialized. Configure ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD for one-time setup.');
      error.statusCode = 503;
      throw error;
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    admin = await Admin.create({ username, name, passwordHash });
    admin = await Admin.findById(admin._id).select('+passwordHash');
  }
  return admin;
}

function toSafeAdminJSON(admin) {
  return { id: admin._id, username: admin.username, name: admin.name };
}

module.exports = { getOrCreateAdmin, toSafeAdminJSON, SALT_ROUNDS };
