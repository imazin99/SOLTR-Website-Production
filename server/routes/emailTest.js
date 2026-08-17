const express = require('express');
const router  = express.Router();

const requireAuth = require('../middleware/auth');
const { sendTestEmail } = require('../controllers/emailTestController');

/*
  POST /api/email-test/send — admin-only, sends a one-off test email
  to verify RESEND_API_KEY / EMAIL_FROM are configured correctly.
  Not used by checkout, auth, or any other business logic.
*/
router.post('/send', requireAuth, sendTestEmail);

module.exports = router;
