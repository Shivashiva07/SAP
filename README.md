# QR Student Attendance Portal

A lightweight web app that continuously scans student QR codes with the
device camera and marks attendance in a Google Sheet in real time — no
manual "scan" button, no database, no build step.

## How it works

- **Frontend** (`public/`) is plain HTML/CSS/JS. It uses the
  [html5-qrcode](https://github.com/mebjas/html5-qrcode) library to keep the
  camera open and auto-detect QR codes every frame.
- **Backend** (`server.js`) is a small Express app. It's the only thing that
  talks to Google Sheets, so no credentials ever reach the browser.
- **Google Sheets** stores every attendance record with columns:
  `Student ID | Name | Date | Time | Status`.

### QR code format

Each student's QR code must encode their **roll number and name** in one of:

```
21CS045|Asha Rao        (pipe-delimited — recommended)
21CS045,Asha Rao        (comma-delimited)
{"id":"21CS045","name":"Asha Rao"}   (JSON)
```

Any other content is treated as an **invalid QR** and rejected with an
on-screen red error — there is no roster lookup, so whatever ID/name the QR
contains is what gets written to the sheet.

### Duplicate prevention

On startup, and once per new calendar day, the server reads that day's rows
from the sheet into an in-memory cache of already-scanned IDs. Every scan is
checked against this cache before writing, so re-scanning the same student
on the same day shows an "Already marked present today" message instead of
creating a second row.

## 1. Create the Google Sheet

1. Create a new Google Sheet (or use an existing one).
2. Copy its ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.
3. You don't need to add headers yourself — the server creates the tab and
   header row automatically on first run if they're missing.

## 2. Create OAuth2 credentials

This app uses OAuth2 (a Google account you sign in with once), not a service
account.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) →
   create or select a project.
2. Enable the **Google Sheets API** (APIs & Services → Library).
3. Configure the **OAuth consent screen** (External is fine for personal
   use; add your own Google account as a test user if the app stays in
   "Testing" mode).
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client
   ID**, application type **Web application**.
5. Under **Authorized redirect URIs**, add:
   `http://localhost:5000/oauth2callback`
   (match the port to `PORT` in your `.env` if you change it).
6. Save, then copy the generated **Client ID** and **Client Secret**.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — from step 2.
- `SHEET_ID` — from step 1.
- `SHEET_TAB_NAME` — defaults to `Attendance`.
- `PORTAL_NAME` — shown in the app header.
- `TZ` — IANA timezone used for the Date/Time columns (e.g. `Asia/Kolkata`).

Leave `GOOGLE_REFRESH_TOKEN` blank for now — the next step generates it.

## 4. Install dependencies and authorize once

```bash
npm install
npm run get-token
```

This opens a URL for you to visit in a browser, sign in with the Google
account that has edit access to the sheet, and approve access. The script
then prints a `GOOGLE_REFRESH_TOKEN` value — paste it into `.env`.

You only need to do this once; the server uses the refresh token to get new
access tokens automatically after that.

## 5. Run the app

```bash
npm start
```

Open `http://localhost:5000`:

- On a **phone**, open it in the mobile browser to use its camera for
  scanning (grant camera permission when prompted). For camera access to
  work on a phone over your local network, serve the app over **HTTPS** or
  use `localhost`/a tunnel (e.g. `ngrok http 5000`) — most mobile browsers
  block camera access on plain HTTP for non-localhost origins.
- On a **desktop**, open it to monitor the live "Present today" count.

## Project structure

```
server.js               Express server — API routes, Sheets sync
lib/googleAuth.js        OAuth2 client setup
lib/sheetsService.js     Sheet read/write + duplicate-check helpers
scripts/get-refresh-token.js   One-time OAuth consent flow
public/index.html        App shell
public/styles.css        Styling
public/app.js             Camera loop, scan handling, sound/visual feedback
public/js/parseQr.js      QR payload parser (shared by client + server)
```

## Troubleshooting

- **"Could not verify the Google Sheet on startup"** — check `SHEET_ID`,
  that the signed-in Google account has edit access to that sheet, and that
  `GOOGLE_REFRESH_TOKEN` is set.
- **Camera won't start** — check browser permissions, and that you're on
  `localhost` or HTTPS (see step 5).
- **"No refresh_token was returned" during `npm run get-token`** — the
  account already granted consent previously. Revoke access at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
  and re-run the script.
