const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const requireAuth = require('../middleware/auth');
const { uploadIp } = require('../middleware/rateLimits');

const Product = require('../models/Product');
const Order   = require('../models/Order');
const upload  = require('../middleware/upload');
const { validateUploadedImages } = upload;

/* ─────────────────────────────────────────────
   Helper: delete image files from disk
───────────────────────────────────────────── */
function deleteImageFiles(filenames = []) {
  filenames.forEach(filename => {
    const filePath = path.join(__dirname, '../uploads/products', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

/* ─────────────────────────────────────────────
   GET /api/products
   Returns all products, newest first.
   Optional query: ?category=Tee  ?color=Black  ?limit=5
───────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.color)    filter.colors    = req.query.color;

    const limit    = parseInt(req.query.limit) || 0;   // 0 = no limit
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products', error: err.message });
  }
});

/* ─────────────────────────────────────────────
   GET /api/products/:id
   Returns a single product by MongoDB _id.
───────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch product', error: err.message });
  }
});

/* ─────────────────────────────────────────────
   POST /api/products
   Creates a new product.
   Body: multipart/form-data
   Fields: name, description, price, category, collection,
           sizes (JSON array or comma-separated), colors (same),
           stock
   Files: images (up to 10)
───────────────────────────────────────────── */
router.post('/', requireAuth, uploadIp, upload.array('images', 10), validateUploadedImages, async (req, res) => {
  try {
    const {
      name, description, price, category,
      collection, sizes, colors, stock, sizeInventory,
    } = req.body;

    /* sizes and colors arrive as JSON strings or comma-separated */
    const parsedSizes  = parseList(sizes);
    const parsedColors = parseList(colors);
    const parsedSizeInventory = parseSizeInventory(sizeInventory, parsedSizes, stock);

    /* image filenames uploaded by multer */
    const images = req.files ? req.files.map(f => f.filename) : [];

    const product = await Product.create({
      name, description,
      price      : Number(price),
      category,
      collection : collection || "SS'26",
      sizes      : parsedSizes,
      colors     : parsedColors,
      stock      : Number(stock) || 0,
      sizeInventory: parsedSizeInventory,
      images,
    });

    res.status(201).json(product);
  } catch (err) {
    /* Clean up any uploaded files if DB save failed */
    if (req.files) deleteImageFiles(req.files.map(f => f.filename));
    res.status(400).json({ message: err.message });
  }
});

/* ─────────────────────────────────────────────
   PUT /api/products/:id
   Updates an existing product.
   Uploading new images appends to the existing list.
   To remove specific images pass: removeImages (JSON array of filenames)
───────────────────────────────────────────── */
router.put('/:id', requireAuth, uploadIp, upload.array('images', 10), validateUploadedImages, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const {
      name, description, price, category,
      collection, sizes, colors, stock, sizeInventory, removeImages,
    } = req.body;

    /* Images to delete from disk */
    const toRemove = parseList(removeImages);
    if (toRemove.length) {
      deleteImageFiles(toRemove);
      product.images = product.images.filter(img => !toRemove.includes(img));
    }

    /* Append newly uploaded images */
    const newImages = req.files ? req.files.map(f => f.filename) : [];
    product.images = [...product.images, ...newImages];

    /* Update other fields */
    if (name        !== undefined) product.name        = name;
    if (description !== undefined) product.description = description;
    if (price       !== undefined) product.price       = Number(price);
    if (category    !== undefined) product.category    = category;
    if (collection  !== undefined) product.collection  = collection;
    if (sizes       !== undefined) product.sizes       = parseList(sizes);
    if (colors      !== undefined) product.colors      = parseList(colors);
    if (stock       !== undefined) product.stock       = Number(stock);
    if (sizeInventory !== undefined || sizes !== undefined) {
      const nextSizes = sizes !== undefined ? parseList(sizes) : product.sizes;
      product.sizeInventory = parseSizeInventory(sizeInventory, nextSizes, stock !== undefined ? stock : product.stock);
    }

    await product.save();
    res.json(product);
  } catch (err) {
    if (req.files) deleteImageFiles(req.files.map(f => f.filename));
    res.status(400).json({ message: err.message });
  }
});

/* ─────────────────────────────────────────────
   DELETE /api/products/:id
   Deletes product and removes its images from disk.
───────────────────────────────────────────── */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const activeOrder = await Order.exists({
      stockDeducted: true,
      'items.product': product._id,
    });
    if (activeOrder) {
      return res.status(400).json({
        message: 'Product cannot be deleted while active orders are holding inventory',
      });
    }

    await product.deleteOne();
    deleteImageFiles(product.images);
    res.json({ message: 'Product deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product', error: err.message });
  }
});

/* ─────────────────────────────────────────────
   Helper: parse stringified list from form body
───────────────────────────────────────────── */
function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try { return JSON.parse(value); } catch {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
}

/* Accept either a JSON object or an object supplied directly by tests/API
   clients. Only selected sizes are stored; missing entries inherit the
   legacy aggregate stock when no explicit per-size value is supplied. */
function parseSizeInventory(value, sizes, legacyStock) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = {}; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const result = {};
  (sizes || []).forEach(size => {
    const candidate = raw[size] !== undefined ? raw[size] : legacyStock;
    const quantity = Number(candidate);
    if (Number.isFinite(quantity) && quantity >= 0) result[size] = Math.floor(quantity);
  });
  return Object.keys(result).length ? result : undefined;
}

module.exports = router;
