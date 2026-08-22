/**
 * Parses raw QR code text into { studentId, name }, or returns null if the
 * text doesn't match any recognized format. `name` is omitted when the QR
 * only encodes an ID.
 *
 * Recognized formats (checked in this order):
 *   1. JSON object:      {"id":"21CS045","name":"Asha Rao"}
 *                         (accepts id | rollNo | roll | studentId as the ID key;
 *                         name is optional)
 *   2. Pipe-delimited:    21CS045|Asha Rao
 *   3. Comma-delimited:   21CS045,Asha Rao
 *   4. Bare ID:           21CS045
 *                         (the current format — the QR encodes only the
 *                         student ID, no name)
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
      if (studentId) {
        const result = { studentId: String(studentId).trim() };
        if (name) result.name = String(name).trim();
        return result;
      }
    } catch (e) {
      // fall through to delimiter parsing
    }
    return null;
  }

  // 2 & 3. Delimited "id|name" or "id,name"
  const delimiter = text.includes('|') ? '|' : text.includes(',') ? ',' : null;
  if (delimiter) {
    const parts = text.split(delimiter).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const [studentId, name] = parts;
    if (!studentId || !name) return null;
    return { studentId, name };
  }

  // 4. Bare ID — no delimiter, the whole string is the student ID.
  return { studentId: text };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseQrPayload };
}
