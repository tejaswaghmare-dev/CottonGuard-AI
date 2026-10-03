const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const ctrl = require('../controllers/consultation.controller');

const router = express.Router();

router.post('/', authenticate, requireRole(ROLES.FARMER), ctrl.book);
router.get('/', authenticate, ctrl.list);
router.get('/quota', authenticate, requireRole(ROLES.FARMER), ctrl.myQuota);
router.get('/:consultationId', authenticate, ctrl.getOne);
router.put('/:consultationId', authenticate, ctrl.update);

module.exports = router;
