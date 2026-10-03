const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const predCtrl = require('../controllers/prediction.controller');

const router = express.Router();

router.get(
  '/:farmId/predictions',
  authenticate,
  requireRole(ROLES.FARMER),
  predCtrl.listByFarm
);

router.get(
  '/:farmId/spread',
  authenticate,
  requireRole(ROLES.FARMER),
  predCtrl.farmSpread
);

module.exports = router;
