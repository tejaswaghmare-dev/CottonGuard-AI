const fs = require('fs');
const path = require('path');
const googleMeetService = require('../services/googleMeet.service');

const TOKEN_PATH = path.join(__dirname, '../../google-oauth-token.json');

function startGoogleAuth(req, res) {
  try {
    const url = googleMeetService.getAuthorizationUrl();
    return res.redirect(url);
  } catch (error) {
    console.error('Google auth start error:', error);

    return res.status(error.status || 500).json({
      message: error.message || 'Unable to start Google authorization',
    });
  }
}

async function googleOAuthCallback(req, res) {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).json({
        message: `Google authorization failed: ${error}`,
      });
    }

    if (!code) {
      return res.status(400).json({
        message: 'Authorization code missing',
      });
    }

    const tokens = await googleMeetService.exchangeCodeForTokens(code);

    /*
     * Store only the OAuth token response locally.
     *
     * This file is excluded by .gitignore.
     */
    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify(tokens, null, 2),
      {
        encoding: 'utf8',
        mode: 0o600,
      }
    );

    console.log('Google OAuth successful.');
    console.log('Google credentials saved locally.');
    console.log('Refresh token received:', Boolean(tokens.refresh_token));

    return res.json({
      message: 'Google authorization successful',
      credentialsSaved: true,
      hasAccessToken: Boolean(tokens.access_token),
      hasRefreshToken: Boolean(tokens.refresh_token),
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);

    return res.status(error.status || 500).json({
      message: error.message || 'Google OAuth failed',
    });
  }
}
async function createTestMeet(req, res) {
  try {
    const meeting = await googleMeetService.createMeetSpace();

    return res.json({
      message: 'Google Meet created successfully',
      meeting,
    });
  } catch (error) {
    console.error('Google Meet creation error:', error);

    return res.status(error.status || 500).json({
      message: error.message || 'Unable to create Google Meet',
    });
  }
}

module.exports = {
  startGoogleAuth,
  googleOAuthCallback,
  createTestMeet,
};