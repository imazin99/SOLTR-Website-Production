const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const sharp  = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '../uploads/products');
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_DIMENSION = 6000;
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, unique + ext);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, WebP, and GIF image files are allowed'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: MAX_FILES,
    fieldSize: 64 * 1024,
    parts: 40,
  },
});

function hasKnownSignature(buffer, format) {
  if (format === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (format === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (format === 'gif') return buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  if (format === 'webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

async function removeUploadedFiles(files = []) {
  await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
}

async function validateUploadedImages(req, _res, next) {
  const files = req.files || [];
  try {
    if (files.length > MAX_FILES) throw new Error('Too many image files');
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Total image upload size is too large');

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const header = await fs.promises.readFile(file.path, { encoding: null });
      const metadata = await sharp(header, { animated: ext === '.gif' }).metadata();
      const normalizedFormat = metadata.format === 'jpeg' ? 'jpeg' : metadata.format;
      if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME.has(file.mimetype) || !hasKnownSignature(header, normalizedFormat)) {
        throw new Error('Uploaded file content does not match an allowed image format');
      }
      if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
        throw new Error(`Image dimensions must not exceed ${MAX_DIMENSION}x${MAX_DIMENSION}`);
      }
    }
    next();
  } catch (err) {
    await removeUploadedFiles(files);
    err.statusCode = 400;
    next(err);
  }
}

module.exports = upload;
module.exports.validateUploadedImages = validateUploadedImages;
module.exports.removeUploadedFiles = removeUploadedFiles;
