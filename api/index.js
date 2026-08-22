// Vercel serverless function entrypoint. Vercel auto-detects any file under
// /api as a function and routes matching request paths to it; exporting the
// Express app directly works because Express instances are callable as
// (req, res) handlers.
module.exports = require('../lib/expressApp');
