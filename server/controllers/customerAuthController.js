const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const Customer = require('../models/Customer');
const { sendPasswordResetEmail } = require('../services/passwordResetEmail');
const { sendVerificationEmail }  = require('../services/emailVerificationEmail');

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOKEN_EXPIRY_REMEMBERED   = '7d'; // Remember Me checked
const TOKEN_EXPIRY_NOT_REMEMBERED = '1d'; // default — still usable, just not persisted long-term

const PHONE_RE = /^\+?[\d\s-]{8,20}$/;

const RESET_TOKEN_EXPIRY_MINUTES = 20; // within the required 15–30 minute window
const RESET_TOKEN_EXPIRY_MS = RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000;

const EMAIL_VERIFICATION_EXPIRY_MINUTES = 30; // within the required 30–60 minute window
const EMAIL_VERIFICATION_EXPIRY_MS = EMAIL_VERIFICATION_EXPIRY_MINUTES * 60 * 1000;
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000; // basic anti-spam cooldown between resend requests

/** Base URL of the deployed storefront frontend, used to build links sent
    by email (verification, password reset). Set FRONTEND_URL in the
    backend's environment once the frontend is deployed — e.g.
    FRONTEND_URL=https://your-vercel-domain.vercel.app — and every link
    below automatically uses it. Falls back to the local dev server for
    local testing. */
const LOCAL_FRONTEND_URL = 'http://localhost:5500';

/** Resolve the link base at request time so tests and deployments can set it safely. */
function getFrontendUrl() {
  const configured = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    if (!configured) {
      const err = new Error('FRONTEND_URL is required in production');
      err.code = 'EMAIL_CONFIGURATION_ERROR';
      throw err;
    }
    let parsed;
    try { parsed = new URL(configured); } catch {
      parsed = null;
    }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      const err = new Error('FRONTEND_URL must be a public http(s) URL in production');
      err.code = 'EMAIL_CONFIGURATION_ERROR';
      throw err;
    }
  }
  return configured || LOCAL_FRONTEND_URL;
}

/** Returns a client-safe response while logging enough context for server debugging. */
async function clearUnsentVerification(customer, context) {
  try {
    customer.emailVerificationTokenHash = null;
    customer.emailVerificationExpiresAt = null;
    customer.lastVerificationEmailSentAt = null;
    await customer.save();
  } catch (err) {
    console.error(`[customerAuthController] Failed to clear unsent verification state (${context})`, {
      customerId: customer?._id ? String(customer._id) : undefined,
      error: err.message,
    });
  }
}

function respondEmailDeliveryFailure(res, context, customer, result, status = 502) {
  const errorMessage = result?.error || 'Unknown email delivery failure';
  console.error(`[customerAuthController] Verification email failed (${context})`, {
    customerId: customer?._id ? String(customer._id) : undefined,
    emailDomain: customer?.email ? String(customer.email).split('@')[1] || '' : undefined,
    error: errorMessage,
  });
  return res.status(status).json({
    message: 'We could not send the verification email right now. Please try again shortly.',
    code: 'EMAIL_DELIVERY_FAILED',
    retryable: true,
  });
}

/** Generates a random single-use token + its SHA-256 hash. Never store the raw token — only the hash. */
function generateSecureToken() {
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/** Strips passwordHash before a customer document is ever sent in a response. */
function toSafeCustomerJSON(customer) {
  return {
    id: customer._id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
    emailVerified: Boolean(customer.emailVerified),
    createdAt: customer.createdAt,
    lastLoginAt: customer.lastLoginAt || null,
  };
}

function signCustomerToken(customer, rememberMe) {
  return jwt.sign(
    { customerId: customer._id, email: customer.email, tokenVersion: Number(customer.tokenVersion || 0) },
    process.env.CUSTOMER_JWT_SECRET,
    { expiresIn: rememberMe ? TOKEN_EXPIRY_REMEMBERED : TOKEN_EXPIRY_NOT_REMEMBERED }
  );
}

/* ═══════════════════════════════════════════════════
   POST /api/customers/register
   Body: { name, email, phone?, password, rememberMe? }
═══════════════════════════════════════════════════ */
exports.register = async (req, res) => {
  try {
    if (!process.env.CUSTOMER_JWT_SECRET) {
      return res.status(500).json({ message: 'Server misconfiguration: CUSTOMER_JWT_SECRET is not set' });
    }

    const { name, email, phone, password, rememberMe } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!email || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ message: 'A valid email is required' });
    }
    if (phone && !PHONE_RE.test(phone.trim())) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await Customer.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const customer = await Customer.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : '',
      passwordHash,
      // emailVerified defaults to false via the schema — not set explicitly here
    });

    /* Email verification — required before the account can log in
       (see login() below). Same hashed-token pattern as Forgot
       Password: only the SHA-256 hash is ever stored. */
    const { rawToken, tokenHash } = generateSecureToken();
    customer.emailVerificationTokenHash  = tokenHash;
    customer.emailVerificationExpiresAt  = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
    customer.lastVerificationEmailSentAt = new Date();
    await customer.save();

    let verifyLink;
    try {
      verifyLink = `${getFrontendUrl()}/auth/verify-email.html?token=${rawToken}`;
    } catch (err) {
      return respondEmailDeliveryFailure(res, 'registration configuration', customer, { error: err.message }, 503);
    }

    const emailResult = await sendVerificationEmail(customer, verifyLink, EMAIL_VERIFICATION_EXPIRY_MINUTES);
    if (!emailResult?.success) {
      await clearUnsentVerification(customer, 'registration provider');
      return respondEmailDeliveryFailure(res, 'registration provider', customer, emailResult);
    }

    /* No session token issued here — an unverified account must not
       be able to authenticate against any protected endpoint, and
       the frontend never used this response's token anyway (it
       always sends the customer to the login page after registering). */
    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      customer: toSafeCustomerJSON(customer),
    });
  } catch (err) {
    /* Duplicate-key race condition (unique index) — same email registering twice at once */
    if (err.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    const status = err.name === 'ValidationError' ? 400 : 500;
    if (status === 500) console.error('[customerAuthController] Registration failed:', err);
    res.status(status).json({ message: status === 400 ? err.message : 'Registration failed. Please try again.' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/login
   Body: { email, password, rememberMe? }
   Generic error message on failure — doesn't reveal whether the
   email or the password was wrong.
═══════════════════════════════════════════════════ */
exports.login = async (req, res) => {
  try {
    if (!process.env.CUSTOMER_JWT_SECRET) {
      return res.status(500).json({ message: 'Server misconfiguration: CUSTOMER_JWT_SECRET is not set' });
    }

    const { email, password, rememberMe } = req.body;

    if (!email || !email.trim() || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const customer = await Customer.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!customer) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    const isMatch = await bcrypt.compare(password, customer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    if (!customer.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email address before continuing.',
        emailNotVerified: true,
        email: customer.email,
      });
    }

    customer.lastLoginAt = new Date();
    await customer.save();

    const token = signCustomerToken(customer, Boolean(rememberMe));
    res.json({ token, customer: toSafeCustomerJSON(customer) });
  } catch (err) {
    console.error('[customerAuthController] Login failed:', err);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/logout
   JWT auth is stateless — no server-side session to destroy. Same
   pattern as the admin's POST /api/auth/logout: a confirmation
   no-op. The client is responsible for deleting its own token.
═══════════════════════════════════════════════════ */
exports.logout = async (req, res) => {
  try {
    if (req.customer?.customerId) {
      await Customer.findByIdAndUpdate(req.customer.customerId, { $inc: { tokenVersion: 1 } });
    }
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.json({ message: 'Logged out successfully' });
  }
};

/* ═══════════════════════════════════════════════════
   GET /api/customers/me
   Protected (requireCustomerAuth). Verifies the token is valid and
   returns the currently authenticated customer's safe info.
═══════════════════════════════════════════════════ */
exports.me = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    res.json(toSafeCustomerJSON(customer));
  } catch (err) {
    console.error('[customerAuthController] Failed to fetch current customer:', err);
    res.status(500).json({ message: 'Failed to fetch current customer' });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/customers/me
   Protected (requireCustomerAuth). Body: { name?, phone? }
   Email is intentionally NOT accepted here — not editable yet, per spec.

   Security: scoped entirely to req.customer.customerId, which comes
   from the verified JWT payload (server/middleware/customerAuth.js) —
   there is no way to pass a different customer's ID in and edit their
   profile instead. No new auth logic; reuses the same middleware /me uses.
═══════════════════════════════════════════════════ */
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }
    if (phone && !PHONE_RE.test(phone.trim())) {
      return res.status(400).json({ message: 'Please enter a valid phone number' });
    }

    const customer = await Customer.findById(req.customer.customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (name !== undefined)  customer.name  = name.trim();
    if (phone !== undefined) customer.phone = phone.trim();

    await customer.save();
    res.json(toSafeCustomerJSON(customer));
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   PUT /api/customers/me/password
   Protected (requireCustomerAuth). Body: { currentPassword, newPassword }
   Requires the correct current password before allowing a change —
   same rule as the admin's PUT /api/admin/password.

   Hashing reuses the exact same bcrypt.hash(..., SALT_ROUNDS) call
   already used by register — no separate/duplicated hashing logic.
═══════════════════════════════════════════════════ */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are both required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const customer = await Customer.findById(req.customer.customerId).select('+passwordHash');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const isMatch = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    customer.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    customer.tokenVersion = Number(customer.tokenVersion || 0) + 1;
    await customer.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[customerAuthController] Failed to update password:', err);
    res.status(500).json({ message: 'Failed to update password' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/forgot-password
   Public. Body: { email }
   Always responds with the same generic message regardless of
   whether the email exists — this endpoint must never be usable to
   enumerate registered accounts. The reset email (if any) is sent
   fire-and-forget, so a slow/failed send never changes the response
   or its timing in an observable way.
═══════════════════════════════════════════════════ */
const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  message: 'If an account with that email exists, a password reset link has been sent.',
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (email && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const customer = await Customer.findOne({ email: normalizedEmail });

      if (customer) {
        const { rawToken, tokenHash } = generateSecureToken();

        customer.resetTokenHash   = tokenHash;
        customer.resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
        await customer.save();

        const resetLink = `${FRONTEND_URL}/auth/reset-password.html?token=${rawToken}`;

        sendPasswordResetEmail(customer, resetLink, RESET_TOKEN_EXPIRY_MINUTES).catch(err => {
          console.error('[customerAuthController] Failed to send password reset email:', err);
        });
      }
    }

    res.json(GENERIC_FORGOT_PASSWORD_RESPONSE);
  } catch (err) {
    // Even on an unexpected error, don't return anything that could hint at account existence.
    res.json(GENERIC_FORGOT_PASSWORD_RESPONSE);
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/reset-password
   Public. Body: { token, password }
═══════════════════════════════════════════════════ */
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Reset token is required' });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const customer = await Customer.findOneAndUpdate(
      {
        resetTokenHash: tokenHash,
        resetTokenExpiry: { $gt: new Date() },
      },
      {
        $set: {
          passwordHash,
          resetTokenHash: null,
          resetTokenExpiry: null,
        },
        $inc: { tokenVersion: 1 },
      },
      { new: true, select: '+passwordHash +resetTokenHash +resetTokenExpiry' }
    );

    if (!customer) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('[customerAuthController] Failed to reset password:', err);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/verify-email
   Public. Body: { token }
   Validates the hashed token + expiry in one query — a match means
   the token is valid, unexpired, and (since it's cleared on first
   use below) not previously used. Any failure mode — expired,
   malformed, already used, or simply wrong — collapses to the same
   "invalid or expired" response; there's nothing useful to
   distinguish between them for the customer, and it avoids leaking
   which failure mode occurred.
═══════════════════════════════════════════════════ */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    /* Atomic claim: the token, expiry, and unverified state must all match
       in the same update. This prevents concurrent requests from reusing
       the same token after the first request verifies the account. */
    const customer = await Customer.findOneAndUpdate(
      {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { $gt: new Date() },
        emailVerified: { $ne: true },
      },
      {
        $set: {
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      },
      { new: true }
    );

    if (!customer) {
      return res.status(400).json({ message: 'This verification link is invalid or has expired. Please request a new one.' });
    }

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error('[customerAuthController] Verification endpoint failed:', err);
    res.status(500).json({ message: 'We could not verify this email right now. Please try again shortly.' });
  }
};

/* ═══════════════════════════════════════════════════
   POST /api/customers/resend-verification
   Public. Body: { email }
   Unlike forgot-password, this doesn't need to hide account
   existence — the customer just registered with this email and is
   asking to be resent a link, so a direct "no account found" /
   "already verified" message is more helpful UX and isn't a
   meaningful enumeration risk in this context. Rate-limited per
   account via lastVerificationEmailSentAt to prevent spamming an
   inbox with repeated requests.
═══════════════════════════════════════════════════ */
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const customer = await Customer.findOne({ email: normalizedEmail })
      .select('+emailVerificationExpiresAt +lastVerificationEmailSentAt');

    if (!customer) {
      return res.status(404).json({ message: 'No account found with that email' });
    }
    if (customer.emailVerified) {
      return res.json({ message: 'This email is already verified. You can log in normally.' });
    }

    if (customer.lastVerificationEmailSentAt) {
      const elapsedMs = Date.now() - customer.lastVerificationEmailSentAt.getTime();
      if (elapsedMs < RESEND_VERIFICATION_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_VERIFICATION_COOLDOWN_MS - elapsedMs) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSeconds}s before requesting another verification email.` });
      }
    }

    let frontendUrl;
    try {
      frontendUrl = getFrontendUrl();
    } catch (err) {
      return respondEmailDeliveryFailure(res, 'resend configuration', customer, { error: err.message }, 503);
    }

    const { rawToken, tokenHash } = generateSecureToken();
    customer.emailVerificationTokenHash  = tokenHash; // overwrites (invalidates) any previous token
    customer.emailVerificationExpiresAt  = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
    customer.lastVerificationEmailSentAt = new Date();
    await customer.save();

    const verifyLink = `${frontendUrl}/auth/verify-email.html?token=${rawToken}`;
    const emailResult = await sendVerificationEmail(customer, verifyLink, EMAIL_VERIFICATION_EXPIRY_MINUTES);
    if (!emailResult?.success) {
      await clearUnsentVerification(customer, 'resend provider');
      return respondEmailDeliveryFailure(res, 'resend provider', customer, emailResult);
    }

    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    console.error('[customerAuthController] Resend verification endpoint failed:', err);
    res.status(500).json({ message: 'We could not resend the verification email right now. Please try again shortly.' });
  }
};
