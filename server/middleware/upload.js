const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

/* ── Upload destination ── */
const UPLOAD_DIR = path.join(__dirname, '../uploads/products');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ── Storage: disk, with safe unique filenames ── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, unique + ext);          // e.g.  1719000000000-123456789.jpg
  },
});

/* ── Only allow images ── */
const fileFilter = (_req, file, cb) => {
  const allowed = /\.(jpe?g|png|webp|gif)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpg, png, webp, gif)'));
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },   // 15 MB per file
});
