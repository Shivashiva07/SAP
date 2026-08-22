/**
 * Parses raw QR code text into { studentId, name }, or returns null if the
 * text doesn't match any recognized format.
 *
 * Recognized formats (checked in this order):
 *   1. JSON object:      {"id":"21CS045","name":"Asha Rao"}
 *                         (accepts id | rollNo | roll | studentId as the ID key)
 *   2. Pipe-delimited:    21CS045|Asha Rao
 *   3. Comma-delimited:   21CS045,Asha Rao
 *
 * Runs identically in the browser and in Node (no environment-specific APIs).
 */
function parseQrPayload(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // 1. JSON
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      const studentId = obj.id || obj.rollNo || obj.roll || obj.studentId;
      const name = obj.name;
      if (studentId && name) {
        return { studentId: String(studentId).trim(), name: String(name).trim() };
      }
    } catch (e) {
      // fall through to delimiter parsing
    }
    return null;
  }

  // 2 & 3. Delimited "id|name" or "id,name"
  const delimiter = text.includes('|') ? '|' : text.includes(',') ? ',' : null;
  if (!delimiter) return null;

  const parts = text.split(delimiter).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const [studentId, name] = parts;
  if (!studentId || !name) return null;

  return { studentId, name };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseQrPayload };
}
