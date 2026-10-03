const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const { optionalAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const ctrl = require('../controllers/product.controller');

const router = express.Router();

router.get('/', optionalAuth, ctrl.list);
router.get('/:productId', ctrl.getOne);

router.post(
  '/',
  authenticate,
  requireRole(ROLES.PESTICIDE_OWNER),
  upload.single('image'),
  ctrl.create
);

router.put(
  '/:productId',
  authenticate,
  requireRole(ROLES.PESTICIDE_OWNER),
  upload.single('image'),
  ctrl.update
);

router.delete(
  '/:productId',
  authenticate,
  requireRole(ROLES.PESTICIDE_OWNER),
  ctrl.remove
);

module.exports = router;
