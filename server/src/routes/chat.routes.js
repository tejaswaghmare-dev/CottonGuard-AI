const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, ROLES } = require('../middleware/roles');
const ctrl = require('../controllers/chat.controller');

const router = express.Router();

router.post('/', authenticate, requireRole(ROLES.FARMER), ctrl.chat);
router.post('/voice', authenticate, requireRole(ROLES.FARMER), ctrl.chatVoice);

module.exports = router;
