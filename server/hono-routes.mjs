import { Hono } from "hono";
import { cors } from "hono/cors";
import * as casesDb from "./cases-db.mjs";
import {
  LIMITS,
  MAX_IMAGE_BYTES,
  clipText,
  parseTagsFromString,
  assertImageType,
  extFromMime,
} from "./limits.mjs";

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/**
 * @typedef {{
 *   db: import("@libsql/client").Client;
 *   r2: { put: (key: string, body: ArrayBuffer, opts: { contentType: string }) => Promise<void>; delete: (key: string) => Promise<void> };
 *   publicBase: string;
 *   adminApiKey: string;
 *   adminWebPassword: string;
 *   maxCases: number | null;
 *   corsExtras: string[];
 * }} CaseApiCtx
 */

/**
 * @param {(c: import("hono").Context) => CaseApiCtx | Promise<CaseApiCtx>} getCtx
 */
export function createCaseApp(getCtx) {
  const app = new Hono();

  app.use("/*", async (c, next) => {
    const ctx = await getCtx(c);
    const origins = [...defaultOrigins, ...(ctx.corsExtras || [])];
    const mw = cors({
      origin: origins,
      allowHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    });
    return mw(c, next);
  });

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

  async function uploadToR2(ctx, id, file) {
    const ab = await file.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`ไฟล์ใหญ่เกิน ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`);
    }
    const ct = assertImageType(file.type);
    const ext = extFromMime(ct);
    const key = `cases/${id}.${ext}`;
    await ctx.r2.put(key, ab, { contentType: ct });
    return key;
  }

  async function deleteR2Object(ctx, key) {
    if (!key) return;
    try {
      await ctx.r2.delete(key);
    } catch (err) {
      console.error("ลบอ็อบเจ็กต์ R2 ไม่สำเร็จ", key, err);
    }
  }

  function stripCaseKeys(row) {
    const { imageKey, ...safe } = row;
    return safe;
  }

  async function adminAuth(c, next) {
    const ctx = await getCtx(c);
    const auth = c.req.header("authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    const headerKey = c.req.header("x-admin-key");
    const key = bearer || headerKey || "";
    if (!ctx.adminApiKey || key !== ctx.adminApiKey) {
      return c.json({ error: "ไม่มีสิทธิ์แก้ไข — ต้องล็อกอินผู้ดูแลใหม่" }, 401);
    }
    return next();
  }

  function webLoginOk(ctx, password) {
    const p = ctx.adminWebPassword || "neuro";
    return String(password || "") === p;
  }

  /** พอร์ต Node API ไม่มี SPA — ช่วยไม่ให้เข้า / แล้วงงว่า 404 */
  app.get("/", (c) =>
    c.json({
      ok: true,
      service: "CT trainer API",
      hint: "หน้าเว็บให้รัน npm run dev (มักเป็น http://localhost:5173) หรือ npm run dev:full",
      health: "/api/health",
    })
  );

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/limits", async (c) => {
    const ctx = await getCtx(c);
    return c.json({
      limits: LIMITS,
      maxImageMB: MAX_IMAGE_BYTES / (1024 * 1024),
      maxCases: ctx.maxCases,
    });
  });

  app.post("/api/auth/login", async (c) => {
    const ctx = await getCtx(c);
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON ไม่ถูกต้อง" }, 400);
    }
    if (!ctx.adminApiKey) {
      return c.json({ error: "เซิร์ฟเวอร์ยังไม่ตั้ง ADMIN_API_KEY" }, 503);
    }
    if (!webLoginOk(ctx, body.password)) {
      return c.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, 401);
    }
    return c.json({ apiKey: ctx.adminApiKey });
  });

  app.get("/api/cases", async (c) => {
    try {
      const ctx = await getCtx(c);
      const list = await casesDb.listCases(ctx.db, ctx.publicBase);
      const out = list.map(stripCaseKeys);
      return c.json(out);
    } catch (e) {
      console.error(e);
      return c.json({ error: String(e.message || e) }, 500);
    }
  });

  app.post("/api/cases", adminAuth, async (c) => {
    try {
      const ctx = await getCtx(c);
      const maxCases = ctx.maxCases;
      if (maxCases != null) {
        const n = await casesDb.countCases(ctx.db);
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
      const id = crypto.randomUUID();
      const imageKey = await uploadToR2(ctx, id, file);
      await casesDb.insertCase(ctx.db, {
        id,
        ...payload,
        imageKey,
      });
      const row = await casesDb.getCaseById(ctx.db, id, ctx.publicBase);
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
      const ctx = await getCtx(c);
      const id = c.req.param("id");
      const existing = await casesDb.getCaseById(ctx.db, id, ctx.publicBase);
      if (!existing) return c.json({ error: "ไม่พบเคส" }, 404);

      const contentType = c.req.header("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        const body = await c.req.parseBody({ all: true });
        const file = body.image;
        const payload = payloadFromFields(body);
        let newKey = null;
        if (file && typeof file.arrayBuffer === "function") {
          newKey = await uploadToR2(ctx, id, file);
        }
        await casesDb.updateCase(ctx.db, id, {
          ...payload,
          imageKey: newKey,
        });
        if (newKey && existing.imageKey && existing.imageKey !== newKey) {
          await deleteR2Object(ctx, existing.imageKey);
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
        await casesDb.updateCase(ctx.db, id, { ...payload, imageKey: null });
      }

      const row = await casesDb.getCaseById(ctx.db, id, ctx.publicBase);
      return c.json(stripCaseKeys(row));
    } catch (e) {
      console.error(e);
      return c.json({ error: String(e.message || e) }, 500);
    }
  });

  app.delete("/api/cases/:id", adminAuth, async (c) => {
    try {
      const ctx = await getCtx(c);
      const id = c.req.param("id");
      const existing = await casesDb.getCaseById(ctx.db, id, ctx.publicBase);
      if (!existing) return c.json({ error: "ไม่พบเคส" }, 404);

      const oldKeys = await casesDb.deleteCaseRow(ctx.db, id);
      for (const key of oldKeys) {
        await deleteR2Object(ctx, key);
      }
      return c.json({ ok: true });
    } catch (e) {
      console.error(e);
      return c.json({ error: String(e.message || e) }, 500);
    }
  });

  return app;
}
