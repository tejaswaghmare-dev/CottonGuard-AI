const productService = require('../services/product.service');

async function list(req, res, next) {
  try {
    const { crop, disease, mine } = req.query;
    const ownerId = mine === 'true' ? req.user?.uid : undefined;
    const products = await productService.listProducts({ crop, disease, ownerId });
    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const product = await productService.getProduct(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const product = await productService.createProduct(
      req.user.uid,
      req.body,
      req.file?.buffer,
      req.file?.mimetype
    );
    res.status(201).json({ success: true, product });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const product = await productService.updateProduct(
      req.params.productId,
      req.user.uid,
      req.body,
      req.file?.buffer,
      req.file?.mimetype
    );
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await productService.deleteProduct(req.params.productId, req.user.uid);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove };
