const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const ctrl = require('../controllers/consultation.controller');

const router = express.Router();

router.get('/', authenticate, ctrl.listDoctors);
router.post('/availability', authenticate, requireRole(ROLES.LEAF_DOCTOR), ctrl.setAvailability);
router.put('/profile', authenticate, requireRole(ROLES.LEAF_DOCTOR), ctrl.updateDoctorProfile);
router.get(
  '/farmer/:farmerId/history',
  authenticate,
  requireRole(ROLES.LEAF_DOCTOR),
  ctrl.farmerHistory
);
router.get('/:doctorId', authenticate, ctrl.getDoctor);

module.exports = router;
