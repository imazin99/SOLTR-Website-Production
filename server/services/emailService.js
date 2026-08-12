const { Resend } = require('resend');

/**
 * SOLTR — server/services/emailService.js
 *
 * Phase 12: reusable email infrastructure. This module does not send
 * any email on its own and is not wired into checkout, auth, or any
 * other business logic — it only exposes sendEmail() for future
 * features (Forgot Password, Welcome Email, Order Confirmation, etc.)
 * to call.
 *
 * Credentials are read exclusively from environment variables:
 *   - RESEND_API_KEY  (Resend dashboard → API Keys)
 *   - EMAIL_FROM      (a sender address/domain verified in Resend)
 * Nothing is hardcoded. If either is missing, sendEmail() resolves
 * with { success: false, error } instead of throwing — a missing
 * key must never crash the server, especially at require-time
 * (e.g. before .env is loaded, or in environments where email isn't
 * configured yet).
 */

let _client = null;

/** Lazily creates the Resend client only once a valid API key is present. */
function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  if (!_client) {
    _client = new Resend(apiKey);
  }
  return _client;
}

/**
 * Sends an email via Resend.
 *
 * @param {Object} options
 * @param {string|string[]} options.to      Recipient address(es) — required
 * @param {string} options.subject          Email subject — required
 * @param {string} [options.html]           HTML body (provide html and/or text)
 * @param {string} [options.text]           Plain-text body
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 *          Never throws — callers can always safely check `.success`.
 */
async function sendEmail({ to, subject, html, text } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM;

  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY is not set. Add it to your .env file.' };
  }
  if (!from) {
    return { success: false, error: 'EMAIL_FROM is not set. Add it to your .env file.' };
  }
  if (!to) {
    return { success: false, error: 'Missing "to" address.' };
  }
  if (!subject) {
    return { success: false, error: 'Missing "subject".' };
  }
  if (!html && !text) {
    return { success: false, error: 'Provide "html" and/or "text" content.' };
  }

  const client = getClient();
  if (!client) {
    // Defensive — getClient() only returns null when the key is missing,
    // which is already handled above, but never let a null client through.
    return { success: false, error: 'RESEND_API_KEY is not set. Add it to your .env file.' };
  }

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    });

    if (error) {
      console.error('[emailService] Resend API error:', error);
      return { success: false, error: error.message || 'Resend failed to send the email.' };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[emailService] Unexpected error sending email:', err);
    return { success: false, error: err.message || 'Unexpected error sending email.' };
  }
}

module.exports = { sendEmail };
