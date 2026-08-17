/**
 * SOLTR — server/utils/getAuthenticatedCustomerId.js
 *
 * Every customer JWT issued by this project is signed as
 * { customerId, email } (see customerAuthController.js's signToken()).
 * This helper is the single place that reads that id back out of a
 * decoded token payload — used by both optionalCustomerAuth.js /
 * orderController.js (write) and customerOrderController.js (read),
 * so the two sides can never disagree about which property holds it.
 *
 * Tolerant of common alternate property names (id, _id, sub) in case
 * a token was ever issued by different code, or the payload shape
 * changes in the future — it does not assume `customerId` is the
 * only possible key.
 */
function getAuthenticatedCustomerId(decodedPayload) {
  if (!decodedPayload || typeof decodedPayload !== 'object') return null;

  const candidate =
    decodedPayload.customerId ??
    decodedPayload.id ??
    decodedPayload._id ??
    decodedPayload.sub ??
    null;

  return candidate ? String(candidate) : null;
}

module.exports = getAuthenticatedCustomerId;
