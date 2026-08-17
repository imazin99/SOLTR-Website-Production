const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const orderController = fs.readFileSync(path.join(__dirname, 'controllers/orderController.js'), 'utf8');
const orderModel = fs.readFileSync(path.join(__dirname, 'models/Order.js'), 'utf8');
const orderRoute = fs.readFileSync(path.join(__dirname, 'routes/orders.js'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'frontend/checkout/checkout.js'), 'utf8');

function pass(name) {
  console.log(`PASS ${name}`);
}

assert.match(orderRoute, /router\.post\('\/',\s*orderCreationIp,\s*optionalCustomerAuth,\s*createOrder\)/);
pass('guest checkout remains public and optional customer auth is attached');

assert.match(checkout, /sessionStorage\.getItem\('soltr_customer_token'\)/);
assert.match(checkout, /localStorage\.getItem\('soltr_customer_token'\)/);
assert.match(checkout, /headers\.Authorization = `Bearer \$\{token\}`/);
pass('checkout forwards the existing authenticated customer token when available');

assert.match(orderController, /await order\.save\(\{ session \}\)/);
assert.match(orderController, /res\.status\(201\)\.json\(order\)/);
const saveIndex = orderController.indexOf('await order.save({ session });');
const responseIndex = orderController.indexOf('res.status(201).json(order);');
assert.ok(saveIndex >= 0 && responseIndex > saveIndex, 'HTTP success must occur after persistence code');
pass('order creation saves inside the transaction before returning HTTP 201');

assert.match(orderModel, /const session = this\.\$session\(\);/);
assert.match(orderModel, /if \(session\) query\.session\(session\);/);
pass('order-number lookup participates in the active transaction session');

assert.match(orderController, /customerId: resolvedCustomerId/);
assert.match(orderController, /sendOrderConfirmationEmail\(order\)\.catch/);
assert.ok(orderController.indexOf('res.status(201).json(order);') < orderController.indexOf('sendOrderConfirmationEmail(order).catch'));
pass('customerId is assigned server-side and confirmation email cannot mask persistence response');

console.log('PASS order-persistence regression checks complete');
