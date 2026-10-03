const multer = require('multer');
const path = require('path');

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE = 8 * 1024 * 1024; // 8MB

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter,
});

module.exports = { upload, ALLOWED_MIME, MAX_SIZE };
