import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "public", "teaching-images");
const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp"]);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const entries = fs.readdirSync(dir);
const files = entries
  .filter((f) => {
    if (f === "manifest.json") return false;
    return EXTS.has(path.extname(f).toLowerCase());
  })
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

const outPath = path.join(dir, "manifest.json");
fs.writeFileSync(outPath, `${JSON.stringify({ files }, null, 2)}\n`, "utf8");
console.log(`teaching-images: wrote ${files.length} entr(y/ies) to manifest.json`);
