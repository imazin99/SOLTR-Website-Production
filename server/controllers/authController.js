const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { getOrCreateAdmin, toSafeAdminJSON } = require('../utils/adminUtils');

const TOKEN_EXPIRY = '7d';

/* ═══════════════════════════════════════════════════
   POST /api/auth/login
   Body: { username, password }
   `username` may be either the admin's username OR their email —
   matches whichever is set (see server/models/Admin.js).

   Returns: { token, admin: { id, username, name } } on success.
   Always the same generic message on failure, so a wrong username
   and a wrong password look identical to an attacker.
═══════════════════════════════════════════════════ */
exports.login = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server misconfiguration: JWT_SECRET is not set' });
    }

    const { username, password } = req.body;

    if (!username || !username.trim() || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const admin = await getOrCreateAdmin();

    const identifier = username.trim().toLowerCase();
    const matchesAccount =
      identifier === admin.username.toLowerCase() ||
      (admin.email && identifier === admin.email.toLowerCase());

    if (!matchesAccount) {
      return res.status(401).json({ message: 'Incorrect username or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect username or password' });
    }

    const token = jwt.sign(
      { adminId: admin._id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ token, admin: toSafeAdminJSON(admin) });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/auth/logout
   JWT auth is stateless — there's no server-side session to destroy,
   so this is intentionally a no-op that just returns a confirmation.
   The client is responsible for deleting its own token (see
   dashboard.js's inlined logout(), which clears localStorage and
   redirects to login.html). This endpoint exists for API symmetry
   and as a hook for future token-blacklisting if that's ever needed.
═══════════════════════════════════════════════════ */
exports.logout = async (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

/* ═══════════════════════════════════════════════════
   GET /api/auth/me
   Protected (requireAuth). Verifies the token is valid and returns
   the currently authenticated admin's safe info — useful for the
   frontend to confirm a stored token still works without waiting for
   some other API call to fail first.
═══════════════════════════════════════════════════ */
exports.me = async (req, res) => {
  try {
    const admin = await getOrCreateAdmin();
    res.json(toSafeAdminJSON(admin));
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch current admin', error: err.message });
  }
};
