/* ═══════════════════════════════════════════════════
   SOLTR — thankyou.js
   Reads the `order` query param that checkout.js already sets when
   it calls redirectToThankYou(order.orderNumber) after a successful
   POST /api/orders. No API calls of its own — order creation and
   validation happened on checkout.html; this page only displays the
   confirmation.
════════════════════════════════════════════════════ */

function init() {
  const params = new URLSearchParams(window.location.search);
  const orderNumber = params.get('order');

  if (orderNumber) {
    document.getElementById('tyOrderNumber').textContent = orderNumber;
    document.getElementById('tyOrderCard').style.display = '';
  }
}

init();
