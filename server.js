// Local dev entrypoint. On Vercel, api/index.js exports the same Express
// app (lib/expressApp.js) as a serverless function instead of calling listen().
const app = require('./lib/expressApp');
const { ensureSheetReady } = require('./lib/sheetsService');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await ensureSheetReady();
    console.log('Google Sheet connection OK.');
  } catch (err) {
    console.error('⚠️  Could not verify the Google Sheet on startup:', err.message);
    console.error('   The server will still start, but scans will fail until this is fixed.');
  }

  app.listen(PORT, () => {
    console.log(`QR Attendance Portal running at http://localhost:${PORT}`);
  });
}

start();
