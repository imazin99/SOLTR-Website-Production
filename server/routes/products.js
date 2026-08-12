const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const Product = require('../models/Product');
const upload  = require('../middleware/upload');

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
router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const {
      name, description, price, category,
      collection, sizes, colors, stock,
    } = req.body;

    /* sizes and colors arrive as JSON strings or comma-separated */
    const parsedSizes  = parseList(sizes);
    const parsedColors = parseList(colors);

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
router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const {
      name, description, price, category,
      collection, sizes, colors, stock, removeImages,
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
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

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

module.exports = router;
