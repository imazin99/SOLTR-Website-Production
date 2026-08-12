/**
 * SOLTR — seed.js
 * Seeds the database with the 9 existing products.
 * Copies images from ../assests/images/product/ → ./uploads/products/
 *
 * Run once:  node seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs       = require('path');
const fss      = require('fs');
const path     = require('path');
const Product  = require('./models/Product');

const SRC_DIR  = path.join(__dirname, '../assests/images/product');
const DEST_DIR = path.join(__dirname, 'uploads/products');

if (!fss.existsSync(DEST_DIR)) fss.mkdirSync(DEST_DIR, { recursive: true });

/* ── Copy a file, return the new safe filename ── */
function copyImage(originalName) {
  const src = path.join(SRC_DIR, originalName);
  if (!fss.existsSync(src)) {
    console.warn(`  ⚠️  Not found, skipping: ${originalName}`);
    return null;
  }
  const ext      = path.extname(originalName).toLowerCase();
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const dest     = path.join(DEST_DIR, safeName);
  fss.copyFileSync(src, dest);
  return safeName;
}

/* ── Seed data — matches your existing 9 products ── */
const SEED = [
  {
    name: 'Hustle', description: 'Heavyweight cotton tee, soft structured feel, minimal clean finish.', price: 650,
    category: 'Tee', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['White'], stock: 50,
    srcImages: ['Hustle White Tee (1).jpg', 'Hustle White Tee (2).jpg'],
  },
  {
    name: 'Off-Center', description: 'Premium boxy tee with an off-center graphic.', price: 650,
    category: 'Tee', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['Burgundy'], stock: 40,
    srcImages: ['Off-Centre Burgundy Tee (1).jpg', 'Off-Centre Burgundy Tee (2).jpg'],
  },
  {
    name: 'Legend', description: 'Statement graphic tee. Built heavy, worn hard.', price: 650,
    category: 'Tee', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['Black'], stock: 45,
    srcImages: ['Legend Black Tee (1).jpg', 'Legend Black Tee (2).jpg'],
  },
  {
    name: 'The Perfect Boxy', description: 'Boxy fit, heavyweight cotton. Minimal and clean.', price: 550,
    category: 'Boxy', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['Black'], stock: 35,
    srcImages: ['The Perfect Boxy (1).jpg', 'The Perfect Boxy (2).jpg'],
  },
  {
    name: 'Inklaw', description: 'Bold graphic tee. Ink-heavy, designed to last.', price: 650,
    category: 'Tee', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['Burgundy'], stock: 30,
    srcImages: ['Inklaw burgundy tee (1).jpg', 'Inklaw burgundy tee (2).jpg'],
  },
  {
    name: 'Inklaw', description: 'Bold graphic tee. Ink-heavy, designed to last.', price: 650,
    category: 'Tee', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['Black'], stock: 35,
    srcImages: ['Inklaw black tee (1).jpg', 'Inklaw black tee (2).jpg'],
  },
  {
    name: 'The Perfect Boxy', description: 'Boxy fit, heavyweight cotton. Minimal and clean.', price: 550,
    category: 'Boxy', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['White'], stock: 30,
    srcImages: ['the perfect boxy white (1).jpg', 'the perfect boxy white (2).jpg'],
  },
  {
    name: 'Off-Center', description: 'Premium boxy tee with an off-center graphic.', price: 650,
    category: 'Tee', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['White'], stock: 40,
    srcImages: ['off center white tee (1).jpg', 'off center white tee (2).jpg'],
  },
  {
    name: 'The Perfect Boxy', description: 'Boxy fit, heavyweight cotton. Minimal and clean.', price: 550,
    category: 'Boxy', collection: "SS'26", sizes: ['S','M','L','XL'], colors: ['Burgundy'], stock: 25,
    srcImages: ['the perfect boxy burgundy (1).jpg', 'the perfect boxy burgundy (2).jpg'],
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    await Product.deleteMany({});
    console.log('🗑️  Cleared existing products');

    for (const p of SEED) {
      const images = [];
      for (const filename of p.srcImages) {
        const copied = copyImage(filename);
        if (copied) {
          images.push(copied);
          console.log(`  📸 Copied: ${filename} → ${copied}`);
        }
      }
      const { srcImages, ...data } = p;
      await Product.create({ ...data, images });
      console.log(`  ✅ Seeded: ${p.name} (${p.colors.join(', ')})`);
    }

    console.log('\n🎉 Seed complete — 9 products added to MongoDB.');
    console.log('   Start the server: npm run dev');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
