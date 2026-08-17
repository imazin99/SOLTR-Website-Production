const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');

const root = path.join(__dirname, '..');
const orderControllerSource = fs.readFileSync(path.join(__dirname, 'controllers/orderController.js'), 'utf8');
const customerAuthSource = fs.readFileSync(path.join(__dirname, 'controllers/customerAuthController.js'), 'utf8');
const storefrontSource = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'frontend/dashboard/dashboard.js'), 'utf8');

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  process.env.JWT_SECRET = 'local-admin-test-secret';
  process.env.CUSTOMER_JWT_SECRET = 'local-customer-test-secret';

  const Admin = require('./models/Admin');
  const Customer = require('./models/Customer');
  const Order = require('./models/Order');
  const requireAuth = require('./middleware/auth');
  const customerOrderController = require('./controllers/customerOrderController');
  const { validateUploadedImages } = require('./middleware/upload');

  await test('anonymous admin API access returns 401', async () => {
    const res = responseCapture();
    await requireAuth({ headers: {}, cookies: {} }, res, () => { throw new Error('next should not run'); });
    assert.equal(res.statusCode, 401);
  });

  await test('valid admin JWT with matching tokenVersion succeeds', async () => {
    const originalFindById = Admin.findById;
    Admin.findById = () => ({ select: async () => ({ tokenVersion: 0, username: 'admin' }) });
    try {
      const token = jwt.sign({ adminId: '507f1f77bcf86cd799439011', tokenVersion: 0 }, process.env.JWT_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
      const res = responseCapture();
      let called = false;
      await requireAuth(req, res, () => { called = true; });
      assert.equal(called, true);
      assert.equal(req.admin.tokenVersion, 0);
    } finally {
      Admin.findById = originalFindById;
    }
  });

  await test('customer order queries enforce ownership and include only matching legacy snapshots', async () => {
    const originalCustomerFindById = Customer.findById;
    const originalOrderFind = Order.find;
    let capturedFilter;
    const store = [
      { _id: 'A-1', customerId: 'customer-a', customer: { email: 'a@example.test' } },
      { _id: 'A-legacy', customerId: null, customer: { email: 'A@EXAMPLE.TEST' } },
      { _id: 'B-1', customerId: 'customer-b', customer: { email: 'a@example.test' } },
      { _id: 'B-legacy', customerId: null, customer: { email: 'b@example.test' } },
    ];
    Customer.findById = () => ({ select: async () => ({ _id: 'customer-a', email: 'a@example.test' }) });
    Order.find = (filter) => {
      capturedFilter = filter;
      return {
        sort: async () => store.filter(order => filter.$or.some(clause => {
          if (clause.customerId) return String(order.customerId) === String(clause.customerId);
          const emailRegex = clause.$and?.find(part => part['customer.email'])?.['customer.email'];
          const customerIdClause = clause.$and?.find(part => part.$or)?.$or || [];
          const legacyId = customerIdClause.some(part => part.customerId === null || part.customerId?.$exists === false);
          const orderHasNoCustomerId = order.customerId === null || order.customerId === undefined;
          return legacyId && orderHasNoCustomerId && emailRegex?.test(order.customer?.email || '');
        })),
      };
    };
    try {
      const res = responseCapture();
      await customerOrderController.getMyOrders({ customer: { customerId: 'customer-a' } }, res);
      assert.equal(capturedFilter.$or.length, 2);
      assert.deepEqual(res.body.map(order => order._id).sort(), ['A-1', 'A-legacy']);
      assert.equal(res.body.some(order => order._id === 'B-1' || order._id === 'B-legacy'), false);
    } finally {
      Customer.findById = originalCustomerFindById;
      Order.find = originalOrderFind;
    }
  });

  await test('order creation derives monetary fields from canonical server values', async () => {
    assert.match(orderControllerSource, /canonicalizeOrderItems\(items, session\)/);
    assert.match(orderControllerSource, /const subtotal = money\(/);
    assert.match(orderControllerSource, /getServerShippingFee\(session\)/);
    assert.match(orderControllerSource, /reserveCoupon\(couponCode, subtotal, session\)/);
    assert.match(orderControllerSource, /paymentStatus: 'Unpaid'/);
    const createOrderBlock = orderControllerSource.slice(orderControllerSource.indexOf('exports.createOrder'), orderControllerSource.indexOf('exports.updateOrder ='));
    assert.doesNotMatch(createOrderBlock, /Number\(subtotal\)|Number\(total\)|Number\(shippingFee\)|req\.body\.subtotal|req\.body\.total|req\.body\.shippingFee/);
    assert.match(orderControllerSource, /price: money\(product\.price\)/);
  });

  await test('coupon usage reservation is atomic and bounded by usageLimit', async () => {
    assert.match(orderControllerSource, /findOneAndUpdate\(filter, update, \{ new: true, session \}\)/);
    assert.match(orderControllerSource, /filter\.usedCount = \{ \$lt: coupon\.usageLimit \}/);
    assert.doesNotMatch(orderControllerSource, /coupon\.usedCount \+= 1/);
  });

  await test('stored XSS values are escaped before dashboard/storefront HTML insertion', async () => {
    assert.match(storefrontSource, /const esc =/);
    assert.match(storefrontSource, /<h3>\$\{esc\(p\.name\)\}<\/h3>/);
    assert.match(dashboardSource, /const esc =/);
    assert.match(dashboardSource, /\$\{esc\(r\.customerName\)\}/);
    assert.match(dashboardSource, /\$\{esc\(snippet\)\}/);
    assert.match(dashboardSource, /\$\{esc\(item\.name \|\| '—'\)\}/);
    assert.match(dashboardSource, /\$\{esc\(o\.customer\?\.phone\)\}/);
  });

  await test('invalid upload MIME/content is rejected and temporary file is removed', async () => {
    const tempPath = path.join(os.tmpdir(), `soltr-security-${Date.now()}.png`);
    const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(tempPath, onePixelPng);
    let capturedError;
    await new Promise(resolve => {
      validateUploadedImages(
        { files: [{ path: tempPath, size: onePixelPng.length, originalname: 'payload.png', mimetype: 'application/octet-stream' }] },
        {},
        err => { capturedError = err; resolve(); }
      );
    });
    assert.equal(capturedError.statusCode, 400);
    assert.equal(fs.existsSync(tempPath), false);
  });

  await test('login and sensitive endpoints have practical rate-limit wiring', async () => {
    const rateLimitSource = fs.readFileSync(path.join(__dirname, 'middleware/rateLimits.js'), 'utf8');
    assert.match(rateLimitSource, /adminLoginIp/);
    assert.match(rateLimitSource, /customerLoginIp/);
    assert.match(rateLimitSource, /\blimit,/);
    assert.match(fs.readFileSync(path.join(__dirname, 'routes/auth.js'), 'utf8'), /adminLoginIp/);
    assert.match(fs.readFileSync(path.join(__dirname, 'routes/customers.js'), 'utf8'), /customerLoginIp/);
  });

  await test('password reset consumes the token atomically and revokes old JWTs', async () => {
    assert.match(customerAuthSource, /findOneAndUpdate\(/);
    assert.match(customerAuthSource, /resetTokenHash: null/);
    assert.match(customerAuthSource, /resetTokenExpiry: null/);
    assert.match(customerAuthSource, /\$inc: \{ tokenVersion: 1 \}/);
  });
})();
