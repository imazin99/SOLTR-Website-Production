const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function makeLimit(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message },
  });
}

function makeAccountLimit(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const raw = req.body?.email ?? req.body?.username ?? '';
      const account = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return account ? `account:${account}` : `ip:${ipKeyGenerator(req.ip)}`;
    },
    message: { message },
  });
}

module.exports = {
  adminLoginIp: makeLimit(15 * 60 * 1000, 10, 'Too many login attempts. Please try again later.'),
  adminLoginAccount: makeAccountLimit(15 * 60 * 1000, 8, 'Too many login attempts. Please try again later.'),
  customerLoginIp: makeLimit(15 * 60 * 1000, 10, 'Too many login attempts. Please try again later.'),
  customerLoginAccount: makeAccountLimit(15 * 60 * 1000, 8, 'Too many login attempts. Please try again later.'),
  registrationIp: makeLimit(60 * 60 * 1000, 10, 'Too many registration attempts. Please try again later.'),
  registrationAccount: makeAccountLimit(60 * 60 * 1000, 5, 'Too many registration attempts. Please try again later.'),
  forgotPasswordIp: makeLimit(15 * 60 * 1000, 10, 'Too many password-reset requests. Please try again later.'),
  forgotPasswordAccount: makeAccountLimit(15 * 60 * 1000, 5, 'Too many password-reset requests. Please try again later.'),
  resetPasswordIp: makeLimit(15 * 60 * 1000, 10, 'Too many password-reset attempts. Please try again later.'),
  verifyEmailIp: makeLimit(15 * 60 * 1000, 10, 'Too many verification attempts. Please try again later.'),
  resendVerificationIp: makeLimit(15 * 60 * 1000, 10, 'Too many verification-email requests. Please try again later.'),
  resendVerificationAccount: makeAccountLimit(60 * 60 * 1000, 5, 'Too many verification-email requests. Please try again later.'),
  orderCreationIp: makeLimit(15 * 60 * 1000, 30, 'Too many order attempts. Please try again later.'),
  reviewCreationIp: makeLimit(60 * 60 * 1000, 10, 'Too many review submissions. Please try again later.'),
  visitorIp: makeLimit(60 * 60 * 1000, 120, 'Too many visitor requests. Please try again later.'),
  wishlistIp: makeLimit(15 * 60 * 1000, 120, 'Too many wishlist requests. Please try again later.'),
  uploadIp: makeLimit(15 * 60 * 1000, 20, 'Too many upload requests. Please try again later.'),
};
