const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/profile',
  authenticate,
  [
    body('role').isIn(['farmer', 'pesticide_owner', 'leaf_doctor']).withMessage('Valid role required'),
    body('displayName').optional().isString().trim().isLength({ min: 1, max: 100 }),
  ],
  validate,
  ctrl.upsertProfile
);

router.get('/me', authenticate, ctrl.getMe);

module.exports = router;
