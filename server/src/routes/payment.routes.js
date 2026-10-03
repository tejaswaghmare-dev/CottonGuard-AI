const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const ctrl = require('../controllers/chat.controller');

const router = express.Router();

router.post('/create', authenticate, requireRole(ROLES.FARMER), ctrl.createPayment);
router.post('/confirm', authenticate, requireRole(ROLES.FARMER), ctrl.confirmPayment);

module.exports = router;
