const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const { upload } = require('../middleware/upload');
const predCtrl = require('../controllers/prediction.controller');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requireRole(ROLES.FARMER),
  upload.single('image'),
  predCtrl.create
);

router.get('/:predictionId', authenticate, predCtrl.getOne);

router.post(
  '/ai/recommendation',
  authenticate,
  requireRole(ROLES.FARMER),
  predCtrl.recommendation
);

module.exports = router;
