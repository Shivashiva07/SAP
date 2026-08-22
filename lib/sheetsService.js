const { google } = require('googleapis');
const { getAuthorizedClient } = require('./googleAuth');

const HEADERS = ['Student ID', 'Name', 'Date', 'Time', 'Status'];

let sheetsClient = null;
function sheets() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getAuthorizedClient() });
  }
  return sheetsClient;
}

function sheetId() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('Missing SHEET_ID in .env — see .env.example.');
  return id;
}

function tabName() {
  return process.env.SHEET_TAB_NAME || 'Attendance';
}

// `TZ` is a reserved env var name on some hosts (e.g. Vercel), so the app
// uses its own name and passes it explicitly rather than relying on the
// process's ambient timezone.
function appTimeZone() {
  return process.env.ATTENDANCE_TZ || 'UTC';
}

/** "2026-08-22" in the configured timezone, independent of locale. */
function todayString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: appTimeZone() }); // en-CA formats as YYYY-MM-DD
}

/** "14:05:32" in the configured timezone. */
function timeString(date = new Date()) {
  return date.toLocaleTimeString('en-GB', { timeZone: appTimeZone() }); // en-GB formats as HH:MM:SS (24h)
}

/**
 * Makes sure the target tab exists and its first row has the expected headers.
 * Safe to call on every server start.
 */
async function ensureSheetReady() {
  const api = sheets();
  const spreadsheetId = sheetId();
  const tab = tabName();

  const meta = await api.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === tab);

  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
  }

  const headerRes = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:E1`,
  });
  const currentHeader = headerRes.data.values && headerRes.data.values[0];
  const hasHeader = currentHeader && HEADERS.every((h, i) => currentHeader[i] === h);

  if (!hasHeader) {
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

/**
 * Reads all attendance rows and returns the set of Student IDs already
 * marked present today, plus today's total count.
 */
async function getTodayAttendance() {
  const api = sheets();
  const spreadsheetId = sheetId();
  const tab = tabName();
  const today = todayString();

  const res = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:E`,
  });
  const rows = res.data.values || [];

  const idsToday = new Set();
  for (const row of rows) {
    const [studentId, , date] = row;
    if (date === today && studentId) {
      idsToday.add(String(studentId).trim().toLowerCase());
    }
  }
  return { idsToday, count: idsToday.size, date: today };
}

/** Appends one attendance row: Student ID | Name | Date | Time | Status. */
async function appendAttendanceRow({ studentId, name }) {
  const api = sheets();
  const spreadsheetId = sheetId();
  const tab = tabName();
  const now = new Date();

  await api.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[studentId, name || '', todayString(now), timeString(now), 'Present']],
    },
  });

  return { date: todayString(now), time: timeString(now) };
}

module.exports = {
  ensureSheetReady,
  getTodayAttendance,
  appendAttendanceRow,
  todayString,
};
