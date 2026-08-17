/**
 * SOLTR — testEmail.js
 * Sends a one-off test email to verify RESEND_API_KEY and EMAIL_FROM
 * are configured correctly.
 *
 * Usage:
 *   node testEmail.js you@example.com
 */

require('dotenv').config();
const { sendEmail } = require('./services/emailService');

async function main() {
  const to = process.argv[2];

  if (!to) {
    console.error('Usage: node testEmail.js you@example.com');
    process.exit(1);
  }

  console.log(`Sending test email to ${to}...`);

  const result = await sendEmail({
    to,
    subject: 'SOLTR — Test Email',
    html: '<p>This is a test email confirming Resend is wired up correctly in the SOLTR backend.</p>',
    text: 'This is a test email confirming Resend is wired up correctly in the SOLTR backend.',
  });

  if (result.success) {
    console.log('✅ Email sent successfully. ID:', result.id);
  } else {
    console.error('❌ Failed to send email:', result.error);
    process.exit(1);
  }
}

main();
