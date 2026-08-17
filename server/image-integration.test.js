const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const projectRoot = path.join(__dirname, '..');
const uploadRoot = path.join(__dirname, 'uploads');
const imageResolverSource = fs.readFileSync(path.join(projectRoot, 'frontend/js/image-url.js'), 'utf8');
const firstImage = fs.readdirSync(path.join(uploadRoot, 'products')).find(name => /\.(?:jpe?g|png|webp|gif)$/i.test(name));

function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
  });
}

(async () => {
  assert.ok(firstImage, 'a local uploaded product image is required for this regression test');

  const allowedOrigins = new Set(['http://localhost:5500']);
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
  }));
  app.use('/uploads', express.static(uploadRoot));

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const image = await request(`http://127.0.0.1:${port}/uploads/products/${encodeURIComponent(firstImage)}`, {
      Origin: 'http://localhost:5500',
    });
    assert.equal(image.status, 200);
    assert.match(image.headers['content-type'] || '', /^image\//);
    assert.equal(image.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(image.headers['access-control-allow-origin'], 'http://localhost:5500');
    assert.ok(image.body.length > 100, 'image response should contain file bytes');

    const blocked = await request(`http://127.0.0.1:${port}/uploads/products/${encodeURIComponent(firstImage)}`, {
      Origin: 'http://evil.example',
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
    assert.equal(blocked.headers['cross-origin-resource-policy'], 'cross-origin');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  const context = {
    window: { SOLTR_CONFIG: { IMG: 'http://localhost:5000' } },
    document: { currentScript: { src: 'http://localhost:5500/js/image-url.js' } },
    URL,
  };
  vm.runInNewContext(imageResolverSource, context);
  const resolveImage = context.window.productImageUrl;
  assert.equal(resolveImage(firstImage), `http://localhost:5000/uploads/products/${encodeURIComponent(firstImage)}`);
  assert.equal(resolveImage('/uploads/products/legacy image.jpg'), 'http://localhost:5000/uploads/products/legacy%20image.jpg');
  assert.equal(resolveImage('server\\uploads\\products\\windows image.jpg'), 'http://localhost:5000/uploads/products/windows%20image.jpg');
  assert.equal(resolveImage('https://cdn.example/image.jpg'), 'https://cdn.example/image.jpg');

  console.log(`PASS static image delivery and cross-origin headers (${firstImage})`);
  console.log('PASS CORS allowlist permits localhost:5500 and omits headers for an untrusted origin');
  console.log('PASS shared resolver handles bare filenames, legacy paths, Windows paths, and absolute URLs');
})().catch(err => {
  console.error(`FAIL image integration: ${err.stack || err.message}`);
  process.exitCode = 1;
});
