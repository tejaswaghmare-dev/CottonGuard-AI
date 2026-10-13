
const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/mandiPrice.controller');

const router = express.Router();

// Only logged-in users can access this endpoint.
router.get('/', authenticate, controller.list);

module.exports = router;
