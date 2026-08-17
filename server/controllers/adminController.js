const bcrypt = require('bcrypt');
const { getOrCreateAdmin, toSafeAdminJSON, SALT_ROUNDS } = require('../utils/adminUtils');

const MIN_PASSWORD_LENGTH = 8;

/* ═══════════════════════════════════════════════════
   GET /api/admin
   Used by the Settings page to populate the Admin Name field.
   passwordHash is never included (schema has select:false on it,
   and toSafeAdminJSON strips it again as a second layer of defense).
═══════════════════════════════════════════════════ */
exports.getAdmin = async (req, res) => {
  try {
    const admin = await getOrCreateAdmin();
    res.json(toSafeAdminJSON(admin));
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch admin account', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/admin/name
   Body: { name }
═══════════════════════════════════════════════════ */
exports.updateAdminName = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Admin Name cannot be empty' });
    }

    const admin = await getOrCreateAdmin();
    admin.name = name.trim();
    await admin.save();

    res.json({ message: 'Admin name updated successfully', admin: toSafeAdminJSON(admin) });
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/admin/password
   Body: { currentPassword, newPassword }
   Requires the correct current password before allowing a change.
═══════════════════════════════════════════════════ */
exports.updateAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are both required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    /* getOrCreateAdmin() always includes passwordHash internally */
    const admin = await getOrCreateAdmin();

    const isMatch = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    admin.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    admin.tokenVersion = Number(admin.tokenVersion || 0) + 1;
    await admin.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update password', error: err.message });
  }
};
