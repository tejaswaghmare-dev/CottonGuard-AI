const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { uploadProductImage } = require('./storage.service');

async function createProduct(ownerId, data, imageBuffer, mimetype) {
  const db = getDb();
  const productId = uuidv4();
  const now = new Date().toISOString();

  let imageUrl = data.imageUrl || '';
  if (imageBuffer) {
    const up = await uploadProductImage(imageBuffer, ownerId, mimetype || 'image/jpeg');
    imageUrl = up.url;
  }

  const product = {
    productId,
    ownerId,
    productName: data.productName,
    manufacturer: data.manufacturer || '',
    activeIngredient: data.activeIngredient || '',
    targetDisease: data.targetDisease || '',
    crop: data.crop || 'Cotton',
    usageInformation: data.usageInformation || '',
    price: Number(data.price) || 0,
    stock: Number(data.stock) || 0,
    imageUrl,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('products').doc(productId).set(product);
  return product;
}

async function updateProduct(productId, ownerId, data, imageBuffer, mimetype) {
  const db = getDb();
  const ref = db.collection('products').doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Product not found'), { status: 404 });
  const existing = snap.data();
  if (existing.ownerId !== ownerId) {
    throw Object.assign(new Error('You can only edit your own products'), { status: 403 });
  }

  // Owners cannot alter AI prediction results — this collection is products only
  const updates = { updatedAt: new Date().toISOString() };
  [
    'productName',
    'manufacturer',
    'activeIngredient',
    'targetDisease',
    'crop',
    'usageInformation',
    'price',
    'stock',
  ].forEach((k) => {
    if (data[k] !== undefined) updates[k] = k === 'price' || k === 'stock' ? Number(data[k]) : data[k];
  });

  if (imageBuffer) {
    const up = await uploadProductImage(imageBuffer, ownerId, mimetype || 'image/jpeg');
    updates.imageUrl = up.url;
  }

  await ref.update(updates);
  return { ...existing, ...updates };
}

async function deleteProduct(productId, ownerId) {
  const db = getDb();
  const ref = db.collection('products').doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Product not found'), { status: 404 });
  if (snap.data().ownerId !== ownerId) {
    throw Object.assign(new Error('You can only delete your own products'), { status: 403 });
  }
  await ref.delete();
  return { productId, deleted: true };
}

async function listProducts({ crop, disease, ownerId } = {}) {
  const db = getDb();
  let query = db.collection('products');
  if (ownerId) {
    query = query.where('ownerId', '==', ownerId);
  }
  const snap = await query.get();
  let products = snap.docs.map((d) => d.data());

  if (crop) {
    products = products.filter((p) => (p.crop || '').toLowerCase() === crop.toLowerCase());
  }
  if (disease) {
    const d = disease.toLowerCase();
    products = products.filter((p) => {
      const targets = Array.isArray(p.targetDisease) ? p.targetDisease : [p.targetDisease || ''];
      return targets.some((t) => String(t).toLowerCase().includes(d) || d.includes(String(t).toLowerCase()));
    });
  }

  products.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return products;
}

async function getProduct(productId) {
  const db = getDb();
  const snap = await db.collection('products').doc(productId).get();
  if (!snap.exists) return null;
  return snap.data();
}

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  listProducts,
  getProduct,
};
