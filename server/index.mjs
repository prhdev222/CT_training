import { Buffer } from "node:buffer";
import { serve } from "@hono/node-server";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { migrate, getDb } from "./db.mjs";
import { createCaseApp } from "./hono-routes.mjs";
import { parseMaxCases } from "./limits.mjs";

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

const nodeR2 = {
  async put(key, body, { contentType }) {
    const { client, bucket } = getR2();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(body),
        ContentType: contentType,
      })
    );
  },
  async delete(key) {
    if (!key) return;
    try {
      const { client, bucket } = getR2();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      console.error("ลบอ็อบเจ็กต์ R2 ไม่สำเร็จ", key, err);
    }
  },
};

function nodeCtx() {
  const extra = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    db: getDb(),
    r2: nodeR2,
    publicBase: getPublicBase(),
    adminApiKey: process.env.ADMIN_API_KEY || "",
    adminWebPassword: process.env.ADMIN_WEB_PASSWORD || "neuro",
    maxCases: parseMaxCases(process.env.MAX_CASES),
    corsExtras: extra,
  };
}

const app = createCaseApp(() => nodeCtx());

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
