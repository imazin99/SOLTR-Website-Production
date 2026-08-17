# SOLTR Order Persistence Audit — Initial Findings

## Confirmed from source

`POST /api/orders` is public and routed through `orderCreationIp`, `optionalCustomerAuth`, and `createOrder`. The checkout page builds a JSON payload and treats only an HTTP 2xx response as success; it does not clear the cart or redirect on non-2xx responses. It sends no `Authorization` header because `checkout.html` does not load `customer-auth.js` and `checkout.js` does not read the customer token.

The server create flow canonicalizes products and prices, starts a Mongoose session, runs `session.withTransaction`, constructs a new `Order`, calls `await order.save({ session })`, and only then returns HTTP 201. Confirmation email delivery runs after the response and is not on the persistence critical path.

The Order schema pre-save hook generates `orderNumber` immediately before the first save by querying the latest persisted order and assigning the next number. If the save or transaction later fails, the generated number is not persisted. This explains how a number can be observed during a failed attempt without a corresponding document, and the number generator is not a durable counter.

The customer My Orders controller queries by `Order.customerId`. Because checkout currently omits the bearer token, `optionalCustomerAuth` leaves `req.customer` unset and `customerId` is stored as null for storefront checkout. This is a separate ownership/display bug even when order persistence succeeds.

The normal new-order status is Pending, and inventory deduction is not expected during checkout because `DEDUCT_STATES` contains only Confirmed and Processing. Inventory utilities do not generate order numbers or send responses.

## Local runtime limitation

The backend starts its Express listener but exits when Mongoose receives an undefined URI. No local `server/.env` exists, no local MongoDB listener is available on port 27017, and no local `mongod` binary is installed. No production database or production credentials were accessed.

## Leading implementation targets

The smallest safe fix should add the existing customer JWT to checkout requests so persisted orders receive `customerId`, and should make order-number generation participate in the active transaction/session to avoid reading outside the transaction. The implementation must preserve existing order documents, route security, inventory utilities, and image integration. A regression test should assert that the create flow saves before responding and that the customer bearer token is forwarded.
