const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Builds an OAuth2 client from env vars and (if present) a stored refresh token.
 * Throws a clear error at call time if required env vars are missing, rather
 * than at require-time, so `npm run get-token` can still import this file
 * before GOOGLE_REFRESH_TOKEN exists.
 */
function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env — see .env.example.'
    );
  }

  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function getAuthorizedClient() {
  const client = getOAuth2Client();
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Missing GOOGLE_REFRESH_TOKEN in .env — run `npm run get-token` once to obtain it.'
    );
  }
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

module.exports = { getOAuth2Client, getAuthorizedClient, SCOPES };
