import { createClient } from "@libsql/client/web";
import * as casesDb from "../server/cases-db.mjs";
import { createCaseApp } from "../server/hono-routes.mjs";
import { parseMaxCases } from "../server/limits.mjs";

/** @type {import("@libsql/client").Client | null} */
let turso = null;

function getDb(env) {
  if (!turso) {
    const url = env.TURSO_DATABASE_URL;
    const authToken = env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error("ตั้งค่า TURSO_DATABASE_URL ในตัวแปร/secret ของ Worker");
    turso = createClient({ url, authToken: authToken || undefined });
  }
  return turso;
}

let migratePromise = null;
async function ensureMigrate(db) {
  if (!migratePromise) migratePromise = casesDb.migrate(db);
  await migratePromise;
}

function corsExtrasFromEnv(env) {
  return (env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function publicBaseFromEnv(env) {
  const b = env.R2_PUBLIC_BASE_URL;
  if (!b || !String(b).trim()) {
    throw new Error("ตั้งค่า R2_PUBLIC_BASE_URL ใน vars ของ Worker");
  }
  return String(b).replace(/\/$/, "");
}

function workerCtx(env) {
  return {
    db: getDb(env),
    r2: {
      put: (key, body, { contentType }) =>
        env.R2_BUCKET.put(key, body, { httpMetadata: { contentType } }),
      delete: (key) => env.R2_BUCKET.delete(key),
    },
    publicBase: publicBaseFromEnv(env),
    adminApiKey: env.ADMIN_API_KEY || "",
    adminWebPassword: env.ADMIN_WEB_PASSWORD || "neuro",
    maxCases: parseMaxCases(env.MAX_CASES),
    corsExtras: corsExtrasFromEnv(env),
  };
}

const apiApp = createCaseApp((c) => workerCtx(c.env));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname !== "/api/health") {
        try {
          await ensureMigrate(getDb(env));
        } catch (e) {
          console.error("migrate failed:", e);
          return new Response(JSON.stringify({ error: String(e.message || e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return apiApp.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
