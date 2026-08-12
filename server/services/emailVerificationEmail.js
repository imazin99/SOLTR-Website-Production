const { sendEmail } = require('./emailService');

/**
 * SOLTR — server/services/emailVerificationEmail.js
 *
 * Sends the "verify your email" message for account registration.
 * Only builds the email and calls the existing sendEmail() — never
 * touches Customer lookup, token generation/hashing, or validation,
 * all of which live in customerAuthController.js. Never throws; any
 * failure resolves to { success: false, error }.
 */

const BRAND = {
  black:  '#0b0b0c',
  black2: '#141414',
  bone:   '#ece7dd',
  burgundy: '#6e1423',
  burgundyLight: '#8c1f2e',
  smoke:  '#9a958a',
  line:   '#2a2a2a',
};

/** Escapes HTML-significant characters in dynamic values before inlining them into the email. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildVerificationHtml({ name, verifyLink, expiryMinutes }) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:${BRAND.black2}; font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.black2}; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:${BRAND.black}; border:1px solid ${BRAND.line};">

          <!-- Header / Brand -->
          <tr>
            <td style="padding:36px 40px 28px; text-align:center; border-bottom:1px solid ${BRAND.line};">
              <div style="font-size:24px; letter-spacing:.08em; color:${BRAND.bone}; font-weight:bold; text-transform:uppercase;">SOLTR</div>
              <div style="font-size:11px; letter-spacing:.12em; color:${BRAND.smoke}; text-transform:uppercase; margin-top:4px;">Verify Your Email</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 0;">
              <div style="font-size:20px; color:${BRAND.bone}; margin-bottom:12px;">Hi ${esc(name)},</div>
              <div style="font-size:14px; color:${BRAND.smoke}; line-height:1.6;">
                Welcome to SOLTR. Confirm this is your email address to finish setting up your account — this is also where we'll send your order confirmations and shipping updates, so it's worth getting right. This link expires in ${esc(expiryMinutes)} minutes and can only be used once.
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:32px 40px 0; text-align:center;">
              <a href="${verifyLink}" style="display:inline-block; background:${BRAND.burgundy}; color:${BRAND.bone}; text-decoration:none; font-size:13px; letter-spacing:.04em; text-transform:uppercase; padding:14px 32px; border:1px solid ${BRAND.burgundyLight};">
                Verify Email
              </a>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:24px 40px 0;">
              <div style="font-size:12px; color:${BRAND.smoke}; line-height:1.6; word-break:break-all;">
                Or paste this link into your browser:<br>
                <a href="${verifyLink}" style="color:${BRAND.smoke};">${verifyLink}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:36px 40px 32px;">
              <div style="border-top:1px solid ${BRAND.line}; padding-top:24px; text-align:center;">
                <div style="font-size:12px; color:${BRAND.smoke};">If you didn't create a SOLTR account, you can safely ignore this email.</div>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the email verification email.
 * @param {Object} customer     A Customer document (needs .name, .email)
 * @param {string} verifyLink   Full URL the customer clicks, including ?token=
 * @param {number} expiryMinutes  How long the link is valid for, for display only
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
async function sendVerificationEmail(customer, verifyLink, expiryMinutes) {
  try {
    const html = buildVerificationHtml({ name: customer.name, verifyLink, expiryMinutes });
    return await sendEmail({
      to: customer.email,
      subject: 'SOLTR — Verify Your Email',
      html,
      text: `Hi ${customer.name}, verify your SOLTR account here: ${verifyLink} (expires in ${expiryMinutes} minutes, single use).`,
    });
  } catch (err) {
    console.error('[emailVerificationEmail] Failed to build/send verification email:', err);
    return { success: false, error: err.message || 'Unexpected error sending verification email.' };
  }
}

module.exports = { sendVerificationEmail, buildVerificationHtml };
