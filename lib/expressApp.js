require('dotenv').config();
const path = require('path');
const express = require('express');
const { parseQrPayload } = require('../public/js/parseQr');
const {
  ensureSheetReady,
  getTodayAttendance,
  appendAttendanceRow,
  todayString,
} = require('./sheetsService');

const app = express();

app.use(express.json());
// Local dev only: on Vercel, files under /public are served directly by the
// platform's static hosting and never reach this function, so this
// middleware is a no-op there but keeps `npm start` working unchanged.
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── In-memory cache of today's marked student IDs, seeded from the sheet ──
// Avoids a Sheets read on every single scan while still being correct across
// server restarts. Refreshed when the calendar date rolls over OR when it's
// simply older than CACHE_TTL_MS — the TTL is what makes the cache
// self-correct after someone edits the sheet directly (deleting rows,
// fixing a typo'd ID, etc.), which a date-only check would never notice
// for the rest of the day on a warm instance.
//
// Serverless note: on Vercel this cache lives only as long as one function
// instance stays warm, and cold starts / concurrent instances don't share
// it. That's fine for correctness — a cold cache just means the very next
// request re-reads today's rows from the sheet before deciding — it only
// costs a bit of extra Sheets API traffic, never a wrong duplicate/success
// verdict from a single scan.
const CACHE_TTL_MS = 10_000;
let cache = { date: null, ids: new Set(), fetchedAt: 0 };

async function refreshCacheIfNeeded() {
  const today = todayString();
  const isStale = cache.date !== today || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (isStale) {
    const { idsToday } = await getTodayAttendance();
    cache = { date: today, ids: idsToday, fetchedAt: Date.now() };
  }
  return cache;
}

// Runs at most once per warm function instance (or once at local startup).
let sheetReadyPromise = null;
function ensureSheetReadyOnce() {
  if (!sheetReadyPromise) {
    sheetReadyPromise = ensureSheetReady().catch((err) => {
      console.error('⚠️  Could not verify the Google Sheet on startup:', err.message);
      sheetReadyPromise = null; // allow retrying on the next request
      throw err;
    });
  }
  return sheetReadyPromise;
}

app.get('/api/config', (req, res) => {
  res.json({ portalName: process.env.PORTAL_NAME || 'Student Attendance Portal' });
});

app.get('/api/count', async (req, res) => {
  try {
    await ensureSheetReadyOnce();
    const c = await refreshCacheIfNeeded();
    res.json({ count: c.ids.size, date: c.date });
  } catch (err) {
    console.error('GET /api/count failed:', err.message);
    res.status(500).json({ error: 'Could not read attendance count.' });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { raw } = req.body;
    const parsed = parseQrPayload(raw);

    if (!parsed) {
      return res.status(400).json({ status: 'invalid', message: 'Unrecognized QR code.' });
    }

    await ensureSheetReadyOnce();
    const { studentId, name } = parsed;
    const key = studentId.toLowerCase();
    const c = await refreshCacheIfNeeded();

    if (c.ids.has(key)) {
      return res.json({ status: 'duplicate', studentId, name });
    }

    const { time } = await appendAttendanceRow({ studentId, name });
    c.ids.add(key);

    res.json({ status: 'success', studentId, name, date: c.date, time, count: c.ids.size });
  } catch (err) {
    console.error('POST /api/attendance failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Could not record attendance.' });
  }
});

module.exports = app;
