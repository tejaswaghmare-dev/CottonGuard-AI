const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { env } = require('../config/env');

const TOKEN_PATH = path.join(__dirname, '../../google-oauth-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
];

function createOAuthClient() {
  if (!env.google.clientId || !env.google.clientSecret) {
    throw Object.assign(
      new Error('Google OAuth credentials are not configured'),
      { status: 500 }
    );
  }

  return new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );
}


function saveTokens(tokens) {
  let existingTokens = {};

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      existingTokens = JSON.parse(
        fs.readFileSync(TOKEN_PATH, 'utf8')
      );
    } catch {
      existingTokens = {};
    }
  }

  // Google may omit refresh_token on subsequent authorizations.
  const mergedTokens = {
    ...existingTokens,
    ...tokens,
    refresh_token:
      tokens.refresh_token || existingTokens.refresh_token,
  };

  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify(mergedTokens, null, 2),
    { mode: 0o600 }
  );

  return mergedTokens;
}


function getAuthorizationUrl() {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}


async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    const error = new Error(
      'Google did not return a refresh token. Reauthorize the doctor account.'
    );
    error.status = 500;
    throw error;
  }

  saveTokens(tokens);

  return tokens;
}


function getAuthorizedClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw Object.assign(
      new Error(
        'Google account is not connected. Open /api/google/auth first.'
      ),
      { status: 401 }
    );
  }

  const tokenData = JSON.parse(
    fs.readFileSync(TOKEN_PATH, 'utf8')
  );

  const oauth2Client = createOAuthClient();

  oauth2Client.setCredentials(tokenData);

  return oauth2Client;
}

async function createMeetSpace() {
  const auth = getAuthorizedClient();

  const meet = google.meet({
    version: 'v2',
    auth,
  });

  const response = await meet.spaces.create({
    requestBody: {},
  });

  return {
    name: response.data.name,
    meetingUri: response.data.meetingUri,
    meetingCode: response.data.meetingCode,
  };
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  createMeetSpace,
};