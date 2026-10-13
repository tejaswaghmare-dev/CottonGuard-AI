const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const ctrl = require('../controllers/consultation.controller');

const router = express.Router();

router.post('/', authenticate, requireRole(ROLES.FARMER), ctrl.book);
router.get('/', authenticate, ctrl.list);
router.get('/quota', authenticate, requireRole(ROLES.FARMER), ctrl.myQuota);
router.get(
  '/:consultationId/report',
  authenticate,
  requireRole(ROLES.LEAF_DOCTOR),
  ctrl.doctorReport
);

router.get(
  '/:consultationId/report/pdf',
  authenticate,
  requireRole(ROLES.LEAF_DOCTOR),
  ctrl.downloadDoctorReport
);


router.get(
  '/:consultationId/treatment-plan',
  authenticate,
  requireRole(ROLES.FARMER, ROLES.LEAF_DOCTOR),
  ctrl.getTreatmentPlan
);

router.put(
  '/:consultationId/treatment-plan',
  authenticate,
  requireRole(ROLES.LEAF_DOCTOR),
  ctrl.saveTreatmentPlan
);

router.patch(
  '/:consultationId/treatment-plan/tasks/:taskId',
  authenticate,
  requireRole(ROLES.FARMER),
  ctrl.updateTreatmentTask
);


router.post(
  '/:consultationId/treatment-plan/generate',
  authenticate,
  requireRole(ROLES.LEAF_DOCTOR),
  ctrl.generateTreatmentPlan
);


router.get('/:consultationId', authenticate, ctrl.getOne);
router.put('/:consultationId', authenticate, ctrl.update);

module.exports = router;
