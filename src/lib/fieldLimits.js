/** ต้องสอดคล้องกับ server/limits.mjs — ใช้นับตัวอักษรในฟอร์ม (รวม emoji/ไทย) */
export const FIELD_LIMITS = {
  title: 120,
  pattern: 80,
  tagsJoined: 200,
  description: 400,
  narrative: 2000,
  teachingPoint: 700,
  lesionLabel: 80,
};

export function countChars(s) {
  return [...String(s ?? "")].length;
}
