import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  migrate,
  countCases,
  listCases,
  insertCase,
  updateCase,
  deleteCaseRow,
  getCaseById,
} from "./db.mjs";
import {
  LIMITS,
  MAX_IMAGE_BYTES,
  getMaxCases,
  clipText,
  parseTagsFromString,
  assertImageType,
  extFromMime,
} from "./limits.mjs";

const app = new Hono();

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const extra = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  "/*",
  cors({
    origin: [...defaultOrigins, ...extra],
    allowHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

let s3client;
let s3bucket;

function getR2() {
  if (s3client) return { client: s3client, bucket: s3bucket };
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("ตั้งค่า R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME");
  }
  s3client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  s3bucket = bucket;
  return { client: s3client, bucket: s3bucket };
}

function getPublicBase() {
  const b = process.env.R2_PUBLIC_BASE_URL;
  if (!b) throw new Error("ตั้งค่า R2_PUBLIC_BASE_URL (URL สาธารณะของบัคเก็ต เช่น https://xxxx.r2.dev)");
  return b.replace(/\/$/, "");
}

function adminAuth(c, next) {
  const auth = c.req.header("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const headerKey = c.req.header("x-admin-key");
  const key = bearer || headerKey || "";
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || key !== expected) {
    return c.json({ error: "ไม่มีสิทธิ์แก้ไข — ต้องล็อกอินผู้ดูแลใหม่" }, 401);
  }
  return next();
}

function webLoginOk(password) {
  const p = process.env.ADMIN_WEB_PASSWORD || "neuro";
  return String(password || "") === p;
}

function payloadFromFields(body) {
  const lesionRaw = body.lesion;
  let lesion;
  try {
    lesion = typeof lesionRaw === "string" ? JSON.parse(lesionRaw || "{}") : lesionRaw || {};
  } catch {
    throw new Error("รูปแบบ lesion ไม่ถูกต้อง");
  }
  const title = clipText(body.title, LIMITS.title);
  const pattern = clipText(body.pattern, LIMITS.pattern);
  if (!title || !pattern) throw new Error("ต้องมีชื่อเคสและกลุ่ม/pattern");
  return {
    title,
    pattern,
    tags: parseTagsFromString(typeof body.tags === "string" ? body.tags : ""),
    description: clipText(body.description, LIMITS.description),
    narrative: clipText(body.narrative, LIMITS.narrative),
    teachingPoint: clipText(body.teachingPoint, LIMITS.teachingPoint),
    lesion: {
      x: Number(lesion.x) || 50,
      y: Number(lesion.y) || 50,
      r: Number(lesion.r) || 10,
    },
  };
}

async function uploadToR2(id, file) {
  const ab = await file.arrayBuffer();
  if (ab.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`ไฟล์ใหญ่เกิน ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`);
  }
  const ct = assertImageType(file.type);
  const ext = extFromMime(ct);
  const key = `cases/${id}.${ext}`;
  const { client, bucket } = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(ab),
      ContentType: ct,
    })
  );
  return key;
}

async function deleteR2Object(key) {
  if (!key) return;
  try {
    const { client, bucket } = getR2();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.error("ลบอ็อบเจ็กต์ R2 ไม่สำเร็จ", key, err);
  }
}

function stripCaseKeys(row) {
  const { imageKey, ...safe } = row;
  return safe;
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/limits", (c) =>
  c.json({
    limits: LIMITS,
    maxImageMB: MAX_IMAGE_BYTES / (1024 * 1024),
    maxCases: getMaxCases(),
  })
);

app.post("/api/auth/login", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON ไม่ถูกต้อง" }, 400);
  }
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return c.json({ error: "เซิร์ฟเวอร์ยังไม่ตั้ง ADMIN_API_KEY" }, 503);
  }
  if (!webLoginOk(body.password)) {
    return c.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);
  }
  return c.json({ apiKey });
});

app.get("/api/cases", async (c) => {
  try {
    const publicBase = getPublicBase();
    const list = await listCases(publicBase);
    const out = list.map(stripCaseKeys);
    return c.json(out);
  } catch (e) {
    console.error(e);
    return c.json({ error: String(e.message || e) }, 500);
  }
});

app.post("/api/cases", adminAuth, async (c) => {
  try {
    const publicBase = getPublicBase();
    const maxCases = getMaxCases();
    if (maxCases != null) {
      const n = await countCases();
      if (n >= maxCases) {
        return c.json(
          {
            error: `จำนวนเคสถึงขีดจำกัด (${maxCases} เคส; แต่ละเคส 1 รูปใน R2) — ลบเคสเก่าก่อน หรือเพิ่ม MAX_CASES`,
          },
          403
        );
      }
    }
    const body = await c.req.parseBody({ all: true });
    const file = body.image;
    if (!file || typeof file.arrayBuffer !== "function") {
      return c.json({ error: "ต้องแนบรูป (ฟิลด์ image) — แต่ละเคส 1 รูป" }, 400);
    }
    const payload = payloadFromFields(body);
    const id = randomUUID();
    const imageKey = await uploadToR2(id, file);
    await insertCase({
      id,
      ...payload,
      imageKey,
    });
    const row = await getCaseById(id, publicBase);
    return c.json(stripCaseKeys(row));
  } catch (e) {
    console.error(e);
    const msg = String(e.message || e);
    const status = e.code === "BAD_TYPE" ? 400 : 500;
    return c.json({ error: msg }, status);
  }
});

app.patch("/api/cases/:id", adminAuth, async (c) => {
  try {
    const publicBase = getPublicBase();
    const id = c.req.param("id");
    const existing = await getCaseById(id, publicBase);
    if (!existing) return c.json({ error: "ไม่พบเคส" }, 404);

    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const body = await c.req.parseBody({ all: true });
      const file = body.image;
      const payload = payloadFromFields(body);
      let newKey = null;
      if (file && typeof file.arrayBuffer === "function") {
        newKey = await uploadToR2(id, file);
      }
      await updateCase(id, {
        ...payload,
        imageKey: newKey,
      });
      if (newKey && existing.imageKey && existing.imageKey !== newKey) {
        await deleteR2Object(existing.imageKey);
      }
    } else {
      const json = await c.req.json();
      const payload = payloadFromFields({
        title: json.title,
        pattern: json.pattern,
        tags: Array.isArray(json.tags) ? json.tags.join(",") : json.tags || "",
        description: json.description,
        narrative: json.narrative,
        teachingPoint: json.teachingPoint,
        lesion: JSON.stringify(json.lesion || {}),
      });
      await updateCase(id, { ...payload, imageKey: null });
    }

    const row = await getCaseById(id, publicBase);
    return c.json(stripCaseKeys(row));
  } catch (e) {
    console.error(e);
    return c.json({ error: String(e.message || e) }, 500);
  }
});

app.delete("/api/cases/:id", adminAuth, async (c) => {
  try {
    const publicBase = getPublicBase();
    const id = c.req.param("id");
    const existing = await getCaseById(id, publicBase);
    if (!existing) return c.json({ error: "ไม่พบเคส" }, 404);

    const oldKeys = await deleteCaseRow(id);
    for (const key of oldKeys) {
      await deleteR2Object(key);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error(e);
    return c.json({ error: String(e.message || e) }, 500);
  }
});

const port = Number(process.env.PORT || 8787);

migrate()
  .then(() => {
    console.log(`CT trainer API: http://127.0.0.1:${port}`);
    serve({ fetch: app.fetch, port });
  })
  .catch((e) => {
    console.error("migrate failed:", e);
    process.exit(1);
  });
