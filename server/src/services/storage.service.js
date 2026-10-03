const { v4: uuidv4 } = require('uuid');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary.
 */
async function uploadBuffer(buffer, destPath, contentType = 'image/jpeg') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid image buffer');
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error('Cloudinary environment variables are not configured');
  }

  const folder = destPath.substring(0, destPath.lastIndexOf('/'));
  const filename = destPath.substring(
    destPath.lastIndexOf('/') + 1,
    destPath.lastIndexOf('.')
  );

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: 'image',
        format: contentType === 'image/png'
          ? 'png'
          : contentType === 'image/webp'
            ? 'webp'
            : 'jpg',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve({
          url: result.secure_url,
          path: result.public_id,
          storageUnavailable: false,
          provider: 'cloudinary',
        });
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
}

async function uploadLeafImage(buffer, farmerId, farmId, mimetype) {
  const ext =
    mimetype === 'image/png'
      ? 'png'
      : mimetype === 'image/webp'
        ? 'webp'
        : 'jpg';

  const dest = `leaves/${farmerId}/${farmId}/${uuidv4()}.${ext}`;

  return uploadBuffer(buffer, dest, mimetype);
}

async function uploadGradCamImage(buffer, farmerId, farmId, predictionId) {
  const dest = `gradcam/${farmerId}/${farmId}/${predictionId}.png`;

  return uploadBuffer(buffer, dest, 'image/png');
}

async function uploadProductImage(buffer, ownerId, mimetype) {
  const ext = mimetype === 'image/png' ? 'png' : 'jpg';

  const dest = `products/${ownerId}/${uuidv4()}.${ext}`;

  return uploadBuffer(buffer, dest, mimetype);
}

module.exports = {
  uploadBuffer,
  uploadLeafImage,
  uploadGradCamImage,
  uploadProductImage,
};