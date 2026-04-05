/**
 * ตัดรูปจาก <img> ตาม PixelCrop ของ react-image-crop (พิกัดเทียบขนาดแสดงบนหน้าจอ)
 * สเกลไป naturalWidth/Height ก่อนวาดลง canvas
 */
export function getDataUrlFromPixelCrop(img, pixelCrop, mime = "image/jpeg", quality = 0.92) {
  if (!img?.complete || !img.naturalWidth) {
    throw new Error("รูปยังโหลดไม่เสร็จ");
  }
  if (!pixelCrop?.width || !pixelCrop?.height) {
    throw new Error("กรอบตัดไม่ถูกต้อง");
  }

  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const sx = pixelCrop.x * scaleX;
  const sy = pixelCrop.y * scaleY;
  const sw = pixelCrop.width * scaleX;
  const sh = pixelCrop.height * scaleY;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถสร้างภาพได้");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const outMime = mime === "image/png" ? "image/png" : "image/jpeg";
  const q = outMime === "image/jpeg" ? quality : undefined;
  return canvas.toDataURL(outMime, q);
}
