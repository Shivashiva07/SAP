/**
 * One-time setup script: walks you through the Google OAuth2 consent screen
 * and prints a refresh token to paste into .env as GOOGLE_REFRESH_TOKEN.
 *
 * Usage:  npm run get-token
 */
require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { getOAuth2Client, SCOPES } = require('../lib/googleAuth');

const redirectUri = process.env.GOOGLE_REDIRECT_URI;
if (!redirectUri) {
  console.error('Set GOOGLE_REDIRECT_URI in .env first (see .env.example).');
  process.exit(1);
}

let port;
try {
  port = Number(new URL(redirectUri).port) || 80;
} catch {
  console.error(`GOOGLE_REDIRECT_URI is not a valid URL: ${redirectUri}`);
  process.exit(1);
}

const oAuth2Client = getOAuth2Client();
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces a refresh_token to be issued even on repeat runs
  scope: SCOPES,
});

console.log('\n1. Open this URL in a browser and sign in with the Google account');
console.log('   that has edit access to your target Sheet:\n');
console.log(authUrl + '\n');
console.log('2. Approve access. You will be redirected back to localhost and this\n   script will pick it up automatically.\n');

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, redirectUri);
    const code = reqUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Missing ?code= in redirect.');
      return;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Success — you can close this tab and return to the terminal.</h2>');

    console.log('✅ Received tokens.\n');
    if (tokens.refresh_token) {
      console.log('Add this line to your .env file:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    } else {
      console.log('⚠️  No refresh_token was returned. This usually means the account already');
      console.log('   granted consent before. Revoke access at https://myaccount.google.com/permissions');
      console.log('   and re-run this script.');
    }

    server.close(() => process.exit(0));
  } catch (err) {
    console.error('Token exchange failed:', err.message);
    res.writeHead(500).end('Token exchange failed — check the terminal.');
    server.close(() => process.exit(1));
  }
});

server.listen(port, () => {
  console.log(`(Waiting for the OAuth redirect on port ${port}...)\n`);
});
