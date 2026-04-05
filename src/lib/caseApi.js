export const useCloudCases =
  import.meta.env.VITE_USE_CLOUD === "true" || import.meta.env.VITE_USE_CLOUD === "1";

const API_KEY_STORAGE = "ct-remote-admin-key";

export function apiUrl(path) {
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base) return `${base}${p}`;
  return p;
}

export function getStoredApiKey() {
  try {
    return sessionStorage.getItem(API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setStoredApiKey(k) {
  sessionStorage.setItem(API_KEY_STORAGE, k);
}

export function clearStoredApiKey() {
  try {
    sessionStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export async function fetchCasesRemote() {
  const res = await fetch(apiUrl("/api/cases"));
  const text = await res.text();
  if (!res.ok) throw new Error(text || "โหลดเคสไม่สำเร็จ");
  return JSON.parse(text);
}

export async function loginRemote(password) {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = JSON.parse(await res.text().catch(() => "{}"));
  if (!res.ok) throw new Error(data.error || "ล็อกอิน API ไม่สำเร็จ");
  if (data.apiKey) setStoredApiKey(data.apiKey);
  return data;
}

export function buildCaseFormData(editor) {
  const fd = new FormData();
  fd.append("title", editor.title ?? "");
  fd.append("pattern", editor.pattern ?? "");
  fd.append("tags", editor.tags ?? "");
  fd.append("description", editor.description ?? "");
  fd.append("narrative", editor.narrative ?? "");
  fd.append("teachingPoint", editor.teachingPoint ?? "");
  fd.append("lesion", JSON.stringify(editor.lesion ?? { x: 50, y: 50, r: 10 }));
  return fd;
}

export async function createCaseRemote(formData) {
  const key = getStoredApiKey();
  const res = await fetch(apiUrl("/api/cases"), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "สร้างเคสไม่สำเร็จ");
  return JSON.parse(text);
}

export async function patchCaseRemoteJson(id, body) {
  const key = getStoredApiKey();
  const res = await fetch(apiUrl(`/api/cases/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "บันทึกไม่สำเร็จ");
  return JSON.parse(text);
}

export async function patchCaseRemoteMultipart(id, formData) {
  const key = getStoredApiKey();
  const res = await fetch(apiUrl(`/api/cases/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "บันทึกไม่สำเร็จ");
  return JSON.parse(text);
}

export async function deleteCaseRemote(id) {
  const key = getStoredApiKey();
  const res = await fetch(apiUrl(`/api/cases/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "ลบไม่สำเร็จ");
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function imageUrlToUploadableFile(imageUrl, fallbackName = "image.jpg") {
  if (!imageUrl) return null;
  const r = await fetch(imageUrl);
  if (!r.ok) return null;
  const blob = await r.blob();
  const type = r.headers.get("content-type") || blob.type || "image/jpeg";
  return new File([blob], fallbackName, { type });
}
