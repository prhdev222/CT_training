/**
 * สร้างรูปใหม่จากพิกเซลอย่างเดียว (วาดลง canvas แล้ว toBlob)
 * เพื่อตัด EXIF / IPTC / XMP และข้อความอื่นใน metadata ที่อาจมีชื่อผู้ป่วย
 *
 * ไม่แตะพิกเซลของภาพ CT เอง — แค่ลบชั้นข้อมูลแนบในไฟล์
 * ไฟล์ DICOM (.dcm) ไม่รองรับในเบราว์เซอร์ — ให้ export เป็น JPG/PNG จาก viewer ก่อน
 */

const MAX_PIXELS = 40_000_000;

function outputMimeFor(file) {
  if (file.type === "image/png") return "image/png";
  return "image/jpeg";
}

export async function stripImageToCleanDataUrl(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("ไม่ใช่ไฟล์รูป");
  }

  let bitmap;
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }

    const w = bitmap.width;
    const h = bitmap.height;
    if (!w || !h) throw new Error("ขนาดรูปไม่ถูกต้อง");
    if (w * h > MAX_PIXELS) {
      throw new Error("รูปใหญ่เกินขีดจำกัดของเบราว์เซอร์ — ลดความละเอียดก่อนอัปโหลด");
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ไม่สามารถประมวลผลรูปได้");
    ctx.drawImage(bitmap, 0, 0);

    const mime = outputMimeFor(file);
    const quality = mime === "image/jpeg" ? 0.92 : undefined;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("ส่งออกรูปไม่สำเร็จ"))),
        mime,
        quality
      );
    });

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("อ่านรูปไม่สำเร็จ"));
      reader.readAsDataURL(blob);
    });
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      try {
        bitmap.close();
      } catch {
        /* ignore */
      }
    }
  }
}
