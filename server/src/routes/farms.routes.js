const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/farm.controller');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.FARMER));

router.post(
  '/',
  [body('farmName').isString().trim().notEmpty().withMessage('farmName required')],
  validate,
  ctrl.create
);

router.get('/', ctrl.list);
router.get('/:farmId', ctrl.getOne);
router.put('/:farmId', ctrl.update);
router.delete('/:farmId', ctrl.remove);

module.exports = router;
