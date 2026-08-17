const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checkoutHtml = fs.readFileSync(path.join(root, 'frontend/checkout/checkout.html'), 'utf8');
const checkoutSource = fs.readFileSync(path.join(root, 'frontend/checkout/checkout.js'), 'utf8');
const addressController = fs.readFileSync(path.join(__dirname, 'controllers/customerAddressController.js'), 'utf8');
const customerRoutes = fs.readFileSync(path.join(__dirname, 'routes/customers.js'), 'utf8');

function pass(name) { console.log(`PASS ${name}`); }

assert.match(checkoutHtml, /id="co-address-book"/);
assert.match(checkoutHtml, /id="co-add-address-btn"/);
assert.match(checkoutHtml, /id="co-save-address"/);
assert.match(checkoutHtml, /id="co-address-save-mode"/);
pass('checkout provides saved-address selection and explicit save/update controls');

assert.match(checkoutSource, /\/customers\/me\/addresses/);
assert.match(checkoutSource, /Authorization: `Bearer \$\{token\}`/);
assert.match(checkoutSource, /persistCheckoutAddress\(\)/);
assert.match(checkoutSource, /mode === 'update'/);
assert.doesNotMatch(checkoutSource.slice(checkoutSource.indexOf('function buildOrderPayload'), checkoutSource.indexOf('/* ═══════════════════════════════════════════════════\n   SUBMIT ORDER')), /customerId|addressId/);
pass('checkout reuses the authenticated address API and never trusts address/customer IDs in the order payload');

assert.match(customerRoutes, /router\.get\('\/me\/addresses',\s+requireCustomerAuth,\s+getAddresses\)/);
assert.match(customerRoutes, /router\.post\('\/me\/addresses',\s+requireCustomerAuth,\s+addAddress\)/);
assert.match(customerRoutes, /router\.put\('\/me\/addresses\/:id',\s+requireCustomerAuth,\s+updateAddress\)/);
assert.match(customerRoutes, /router\.delete\('\/me\/addresses\/:id',\s+requireCustomerAuth,\s+deleteAddress\)/);
pass('address routes require customer JWT authentication');

assert.match(addressController, /Address\.find\(\{ customerId: req\.customer\.customerId \}\)/);
assert.match(addressController, /Address\.create\(\{[\s\S]*customerId: req\.customer\.customerId/);
assert.match(addressController, /Address\.findOne\(\{ _id: req\.params\.id, customerId: req\.customer\.customerId \}\)/);
assert.match(addressController, /Address\.findOneAndDelete\(\{ _id: req\.params\.id, customerId: req\.customer\.customerId \}\)/);
assert.match(addressController, /updateMany\(\{ customerId: req\.customer\.customerId/);
pass('address reads, writes, updates, deletes, and default changes are scoped server-side to the authenticated customer');

console.log('PASS address-integration regression checks complete');
