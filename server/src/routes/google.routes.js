const express = require('express');
const controller = require('../controllers/google.controller');

const router = express.Router();

router.get('/auth', controller.startGoogleAuth);
router.get('/oauth2callback', controller.googleOAuthCallback);
router.get('/test-meet', controller.createTestMeet);

module.exports = router;