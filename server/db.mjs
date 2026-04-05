import { createClient } from "@libsql/client";
import * as casesDb from "./cases-db.mjs";

let _client;

export function getDb() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("ตั้งค่า TURSO_DATABASE_URL ใน .env");
  _client = createClient({ url, authToken: authToken || undefined });
  return _client;
}

export async function migrate() {
  return casesDb.migrate(getDb());
}

export async function countCases() {
  return casesDb.countCases(getDb());
}

export async function listCases(publicBase) {
  return casesDb.listCases(getDb(), publicBase);
}

export async function getCaseById(id, publicBase) {
  return casesDb.getCaseById(getDb(), id, publicBase);
}

export async function insertCase(payload) {
  return casesDb.insertCase(getDb(), payload);
}

export async function updateCase(id, payload) {
  return casesDb.updateCase(getDb(), id, payload);
}

export async function deleteCaseRow(id) {
  return casesDb.deleteCaseRow(getDb(), id);
}
