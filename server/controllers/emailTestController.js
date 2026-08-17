const { sendEmail } = require('../services/emailService');

/* ═══════════════════════════════════════════════════
   POST /api/email-test/send
   Admin-only. Sends a one-off test email so email infrastructure can
   be verified from the dashboard/Postman without a shell script.
   Body: { to: "you@example.com" }
═══════════════════════════════════════════════════ */
exports.sendTestEmail = async (req, res) => {
  const to = req.body?.to;

  if (!to) {
    return res.status(400).json({ success: false, error: 'Please provide a "to" email address in the request body.' });
  }

  const result = await sendEmail({
    to,
    subject: 'SOLTR — Test Email',
    html: '<p>This is a test email confirming Resend is wired up correctly in the SOLTR backend.</p>',
    text: 'This is a test email confirming Resend is wired up correctly in the SOLTR backend.',
  });

  if (result.success) {
    return res.json({ success: true, id: result.id });
  }

  return res.status(500).json({ success: false, error: result.error });
};
