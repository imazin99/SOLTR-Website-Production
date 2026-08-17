const { sendEmail } = require('./emailService');

/**
 * SOLTR — server/services/orderConfirmationEmail.js
 *
 * Phase 13: sends the customer a branded Order Confirmation email
 * once an order has been created. This module only builds the email
 * and calls the existing sendEmail() — it never touches order
 * creation, checkout, stock, or coupon logic, and it never throws:
 * any failure (missing recipient email, Resend error, etc.) resolves
 * to { success: false, error } so the caller can safely fire-and-forget.
 *
 * order.customer.email is resolved before the order is even created
 * (see orderController.js's createOrder — checkout-entered email wins,
 * falls back to the logged-in customer's account email if left blank).
 * This function just sends to whatever ended up there; it has no
 * fallback logic of its own.
 */

const BRAND = {
  black:  '#0b0b0c',
  black2: '#141414',
  bone:   '#ece7dd',
  paper:  '#f7f5f0',
  burgundy: '#6e1423',
  smoke:  '#9a958a',
  line:   '#2a2a2a',
};

function fmt(n) {
  return `LE ${Number(n || 0).toFixed(2)}`;
}

function formatOrderDate(date) {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Escapes HTML-significant characters in dynamic values before inlining them into the email. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildItemsRows(items) {
  return (items || []).map(item => `
    <tr>
      <td style="padding:14px 0; border-bottom:1px solid ${BRAND.line}; color:${BRAND.bone}; font-size:14px; font-family:Arial,Helvetica,sans-serif;">
        ${esc(item.name)}
        <div style="color:${BRAND.smoke}; font-size:12px; margin-top:3px;">${esc(item.color)} · Size ${esc(item.size)}</div>
      </td>
      <td style="padding:14px 0; border-bottom:1px solid ${BRAND.line}; color:${BRAND.smoke}; font-size:13px; text-align:center; font-family:Arial,Helvetica,sans-serif;">
        ${esc(item.quantity)}
      </td>
      <td style="padding:14px 0; border-bottom:1px solid ${BRAND.line}; color:${BRAND.bone}; font-size:14px; text-align:right; font-family:Arial,Helvetica,sans-serif;">
        ${fmt(item.price * item.quantity)}
      </td>
    </tr>`).join('');
}

/**
 * Builds the full HTML body for an order confirmation email.
 * @param {Object} order  A Mongoose Order document (or plain object with the same shape)
 * @returns {string} HTML
 */
function buildOrderConfirmationHtml(order) {
  const customer = order.customer || {};
  const addressParts = [customer.address, customer.city].filter(Boolean).join(', ');

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:${BRAND.black2}; font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.black2}; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:${BRAND.black}; border:1px solid ${BRAND.line};">

          <!-- Header / Brand -->
          <tr>
            <td style="padding:36px 40px 28px; text-align:center; border-bottom:1px solid ${BRAND.line};">
              <div style="font-size:24px; letter-spacing:.08em; color:${BRAND.bone}; font-weight:bold; text-transform:uppercase;">SOLTR</div>
              <div style="font-size:11px; letter-spacing:.12em; color:${BRAND.smoke}; text-transform:uppercase; margin-top:4px;">Order Confirmation</div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <div style="font-size:20px; color:${BRAND.bone}; margin-bottom:8px;">Thank you, ${esc(customer.name)}.</div>
              <div style="font-size:14px; color:${BRAND.smoke}; line-height:1.6;">
                We've received your order and we're getting it ready. Here's a summary for your records.
              </div>
            </td>
          </tr>

          <!-- Order meta -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; padding-bottom:4px;">Order Number</td>
                  <td style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; padding-bottom:4px; text-align:right;">Order Date</td>
                </tr>
                <tr>
                  <td style="font-size:15px; color:${BRAND.bone}; font-weight:bold;">${esc(order.orderNumber)}</td>
                  <td style="font-size:15px; color:${BRAND.bone}; text-align:right;">${esc(formatOrderDate(order.createdAt))}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; padding-bottom:10px; border-bottom:1px solid ${BRAND.line};">Item</td>
                  <td style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; padding-bottom:10px; border-bottom:1px solid ${BRAND.line}; text-align:center;">Qty</td>
                  <td style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; padding-bottom:10px; border-bottom:1px solid ${BRAND.line}; text-align:right;">Total</td>
                </tr>
                ${buildItemsRows(order.items)}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px; color:${BRAND.smoke}; padding:4px 0;">Subtotal</td>
                  <td style="font-size:13px; color:${BRAND.bone}; padding:4px 0; text-align:right;">${fmt(order.subtotal)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:${BRAND.smoke}; padding:4px 0;">Shipping</td>
                  <td style="font-size:13px; color:${BRAND.bone}; padding:4px 0; text-align:right;">${order.shippingFee ? fmt(order.shippingFee) : 'Free'}</td>
                </tr>
                ${order.coupon && order.coupon.code ? `
                <tr>
                  <td style="font-size:13px; color:${BRAND.smoke}; padding:4px 0;">Coupon (${esc(order.coupon.code)})</td>
                  <td style="font-size:13px; color:${BRAND.bone}; padding:4px 0; text-align:right;">−${fmt(order.coupon.discountAmount)}</td>
                </tr>` : ''}
                <tr>
                  <td style="font-size:15px; color:${BRAND.bone}; font-weight:bold; padding:14px 0 0; border-top:1px solid ${BRAND.line};">Total</td>
                  <td style="font-size:15px; color:${BRAND.bone}; font-weight:bold; padding:14px 0 0; border-top:1px solid ${BRAND.line}; text-align:right;">${fmt(order.total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Shipping + Payment -->
          <tr>
            <td style="padding:32px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="vertical-align:top; padding-right:12px;">
                    <div style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; margin-bottom:6px;">Shipping Address</div>
                    <div style="font-size:13px; color:${BRAND.bone}; line-height:1.6;">
                      ${esc(customer.name)}<br>
                      ${addressParts ? esc(addressParts) + '<br>' : ''}
                      ${esc(customer.phone)}
                    </div>
                  </td>
                  <td width="50%" style="vertical-align:top; padding-left:12px;">
                    <div style="font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:${BRAND.smoke}; margin-bottom:6px;">Payment Method</div>
                    <div style="font-size:13px; color:${BRAND.bone};">${esc(order.paymentMethod)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Thank you -->
          <tr>
            <td style="padding:36px 40px 32px;">
              <div style="border-top:1px solid ${BRAND.line}; padding-top:24px; text-align:center;">
                <div style="font-size:14px; color:${BRAND.bone}; margin-bottom:6px;">Thank you for shopping with SOLTR.</div>
                <div style="font-size:12px; color:${BRAND.smoke};">Questions about your order? Reply to this email or reach us at soltrwear@gmail.com.</div>
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
 * Sends the order confirmation email for a given order. Safe to call
 * unawaited (fire-and-forget) — never throws. If the order has no
 * usable recipient email, the send is skipped safely (the order was
 * already created successfully either way) and the reason is logged
 * so it's visible in the backend console instead of failing silently.
 *
 * @param {Object} order  A Mongoose Order document (or plain object with the same shape)
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
async function sendOrderConfirmationEmail(order) {
  const to = order?.customer?.email;

  if (!to) {
    const orderRef = order?.orderNumber || '(unknown order number)';
    console.log(`[orderConfirmationEmail] Skipped for order ${orderRef} — no recipient email on file (not entered at checkout and no logged-in account email available). Order was created successfully; only the confirmation email was skipped.`);
    return { success: false, error: 'No customer email on file for this order — confirmation email skipped.' };
  }

  try {
    const html = buildOrderConfirmationHtml(order);
    return await sendEmail({
      to,
      subject: `SOLTR — Order Confirmed (${order.orderNumber})`,
      html,
      text: `Thank you for your order, ${order.customer.name}. Your order number is ${order.orderNumber}. Total: ${fmt(order.total)}.`,
    });
  } catch (err) {
    console.error('[orderConfirmationEmail] Failed to build/send order confirmation email:', err);
    return { success: false, error: err.message || 'Unexpected error sending order confirmation email.' };
  }
}

module.exports = { sendOrderConfirmationEmail, buildOrderConfirmationHtml };
