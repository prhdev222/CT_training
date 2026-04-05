/** จำกัดความยาวเพื่อลดขนาดแถวใน Turso / ค่าใช้จ่าย — ปรับได้ที่นี่และใน src/lib/fieldLimits.js ให้ตรงกัน */
export const LIMITS = {
  title: 120,
  pattern: 80,
  tagsJoined: 200,
  description: 400,
  narrative: 2000,
  teachingPoint: 700,
};

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** จำนวนเคสสูงสุด — ใช้ใน Worker ที่ไม่มี process.env */
export function parseMaxCases(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** จำนวนเคสสูงสุดใน DB (แต่ละเคสมีรูป 1 ไฟล์) — ตั้งผ่าน MAX_CASES; ไม่ตั้งหรือค่าไม่ถูกต้อง = ไม่จำกัด */
export function getMaxCases() {
  return parseMaxCases(process.env.MAX_CASES);
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function clipText(s, max) {
  if (s == null || s === '') return '';
  const str = String(s);
  return [...str].slice(0, max).join('');
}

export function parseTagsFromString(s, maxJoined = LIMITS.tagsJoined) {
  const clipped = clipText(s, maxJoined);
  return clipped
    .split(',')
    .map((t) => clipText(t.trim(), 40))
    .filter(Boolean)
    .slice(0, 24);
}

export function assertImageType(contentType) {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(ct)) {
    const err = new Error(`ชนิดไฟล์ไม่รองรับ (ใช้ได้แค่ JPEG, PNG, WebP, GIF)`);
    err.code = "BAD_TYPE";
    throw err;
  }
  return ct;
}

export function extFromMime(ct) {
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  if (ct === "image/gif") return "gif";
  return "img";
}
