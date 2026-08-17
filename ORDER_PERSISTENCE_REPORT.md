# SOLTR Order Persistence Investigation Report

## Executive conclusion

The local source audit identified two concrete defects in the order flow.

First, the checkout page did not forward the existing customer JWT to `POST /api/orders`. The route correctly used optional customer authentication, but the frontend never supplied the bearer token. As a result, authenticated checkout requests were treated as guest checkout and `customerId` was stored as `null`, so the order could not appear in the authenticated customer’s My Orders list.

Second, the order-number pre-save hook queried the latest order without using the active transaction session. The hook generated the human-readable number immediately before the first save. If the transaction or save failed afterward, the number could be observed in the checkout flow or logs without a corresponding persisted document. The hook now uses the document’s active session for its lookup.

The frontend already handled failed HTTP responses correctly: it only cleared the cart and redirected after receiving an HTTP success response. Confirmation email delivery was already fire-and-forget after the HTTP response and could not make a failed database save appear successful. Inventory deduction was not the normal checkout failure path because new orders begin in `Pending`, while the deduction states remain `Confirmed` and `Processing`.

Because this sandbox has no local `server/.env`, no local MongoDB listener, and no `mongod` binary, a live MongoDB-backed checkout was not possible here. Therefore, this report does **not** claim that an actual order was inserted into MongoDB in this environment. The modified files are delivered for local verification against the user’s own safe local configuration.

## Exact root-cause findings

| Area | Finding | Effect |
|---|---|---|
| Checkout authentication | `checkout.js` sent JSON but no `Authorization: Bearer ...` header. | `optionalCustomerAuth` could not attach `req.customer`; `Order.customerId` became null and My Orders excluded the order. |
| Order numbering | `Order` pre-save hook generated `orderNumber` before the first save, but its latest-order query did not use the active transaction session. | A failed transaction could consume a number in the attempted flow without persisting a document; concurrent attempts also remained vulnerable to sequence races. |
| Persistence response | `createOrder` calls `await order.save({ session })` inside `session.withTransaction` and returns HTTP 201 only after the transaction completes. | Static source shows no success response is sent before the save/commit path. |
| Frontend success handling | Checkout clears cart and redirects only after `res.ok`. | The frontend does not intentionally treat a failed API response as success. |
| Email | Confirmation email starts after HTTP 201 and is caught separately. | Email failure cannot erase or fake the database save. |
| Inventory | New orders default to `Pending`; deduction states remain `Confirmed` and `Processing`. | Normal checkout does not deduct stock before the order is persisted. |

The existing BSON backup was inspected locally only. It contained sequential persisted order numbers through `ORD-1030` in the local snapshot, with no live database access. No production order was read, changed, deleted, or reset.

## Exact fixes implemented

`frontend/checkout/checkout.js` now reads the existing `soltr_customer_token` from session storage first and local storage second, adds it as a bearer token when present, and still permits anonymous checkout when no token exists.

`server/models/Order.js` now obtains `this.$session()` in the pre-save hook and applies that session to the latest-order lookup. The existing order-number format and database/collection names remain unchanged. Existing orders are not migrated or modified.

`server/order-persistence.test.js` was added to verify that guest checkout remains public, customer tokens are forwarded, order saving occurs before HTTP 201, order-number lookup uses the active session, `customerId` is assigned server-side, and confirmation email is not on the persistence critical path. `server/package.json` now exposes this test through `npm run test:orders`.

No image integration or Phase 4 security code was disabled or removed. The previously implemented image resolver, cross-origin resource policy, CORS allowlist, route authorization, JWT revocation, rate limiting, upload validation, canonical server-side pricing, and XSS escaping remain in the delivered project.

## Verification results

| Verification | Result | Notes |
|---|---|---|
| `npm run test:orders` | **PASS** | Focused order persistence and ownership regression checks passed. |
| `npm run test:security` | **PASS** | Existing 9 Phase 4 security checks passed. |
| `npm run test:images` | **PASS** | Existing image delivery, CORP/CORS, and URL resolver checks passed. |
| JavaScript syntax checks | **PASS** | All JavaScript files under `frontend/` and `server/` parsed successfully. |
| `git diff --check` | **PASS** | No whitespace errors. |
| Backend startup | **BLOCKED** | No local `server/.env`; Mongoose received an undefined URI. |
| `GET /api/health` on the real backend | **NOT RUN** | Backend could not remain running without local MongoDB configuration. |
| Real checkout → MongoDB insert | **NOT RUN** | No local MongoDB listener and no production access allowed. |
| Exact new order query in MongoDB | **NOT RUN** | Must be performed by the user against the intended safe local database. |
| My Orders live refresh | **NOT RUN** | Depends on the live customer/database test. |

## Required local end-to-end verification

Copy `server/.env.example` to `server/.env` and provide a safe local MongoDB URI. Start MongoDB locally, then run the backend from `server/`. Serve `frontend/` over HTTP, for example with `python3 -m http.server 5500`; do not use `file://` for the integration test.

Log in as a customer, add a product, complete checkout, record the returned order number, query the same local `orders` collection by that exact `orderNumber`, and verify that the document exists with `customerId` equal to the logged-in customer’s `_id`. Refresh Customer Account → My Orders and confirm the order appears. Confirm an existing order such as `ORD-1025` remains present, confirm inventory behavior, authentication, and image loading, and review the backend log if the request still fails. The server now logs full internal order errors while returning a generic public 5xx message.

## Changed files in this order-persistence fix

| File | Purpose |
|---|---|
| `frontend/checkout/checkout.js` | Forward authenticated customer JWT during checkout. |
| `server/models/Order.js` | Use the active transaction session for order-number lookup. |
| `server/order-persistence.test.js` | Add focused local regression checks. |
| `server/package.json` | Add `npm run test:orders`. |
| `ORDER_PERSISTENCE_AUDIT.md` | Preserve the initial investigation findings. |
| `ORDER_PERSISTENCE_REPORT.md` | This final report. |

The full project archive also contains the previously modified image-integration and Phase 4 security files. No existing MongoDB documents were modified, no collection was dropped or recreated, no order number was reset, and no production setting was changed.
