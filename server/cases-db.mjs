/** เลเยอร์ DB แบบรับ client โดยตรง — ใช้ร่วม Node API และ Cloudflare Worker */

/** @libsql/client คืน rows เป็น Array ของค่า — map กับ columns */
function rowObject(row, columns) {
  if (!row || !columns?.length) return null;
  const o = {};
  for (let i = 0; i < columns.length; i++) {
    o[columns[i]] = row[i];
  }
  return o;
}

export async function migrate(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      pattern TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      narrative TEXT NOT NULL DEFAULT '',
      teaching_point TEXT NOT NULL DEFAULT '',
      image_key TEXT NOT NULL,
      lesion_x REAL NOT NULL,
      lesion_y REAL NOT NULL,
      lesion_r REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const alters = [
    "ALTER TABLE cases ADD COLUMN image_key_2 TEXT",
    "ALTER TABLE cases ADD COLUMN image_key_3 TEXT",
  ];
  for (const sql of alters) {
    try {
      await db.execute(sql);
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/duplicate column/i.test(msg)) throw e;
    }
  }
}

function rowKeysForPurge(row) {
  if (!row) return [];
  const k1 = row.image_key;
  const k2 = row.image_key_2;
  const k3 = row.image_key_3;
  return [k1, k2, k3].filter((k) => k != null && k !== "");
}

function rowToCase(row, publicBase) {
  let tags = [];
  try {
    tags = JSON.parse(row.tags_json || "[]");
  } catch {
    tags = [];
  }
  const key = row.image_key;
  const imageUrl = key
    ? `${publicBase.replace(/\/$/, "")}/${encodeURI(key).replace(/%2F/g, "/")}`
    : "";
  return {
    id: row.id,
    title: row.title,
    pattern: row.pattern,
    tags: Array.isArray(tags) ? tags : [],
    description: row.description ?? "",
    narrative: row.narrative ?? "",
    teachingPoint: row.teaching_point ?? "",
    imageUrl,
    imageKey: key,
    lesion: {
      x: row.lesion_x,
      y: row.lesion_y,
      r: row.lesion_r,
    },
  };
}

export async function countCases(db) {
  const rs = await db.execute({ sql: `SELECT COUNT(*) AS c FROM cases`, args: [] });
  const row = rowObject(rs.rows?.[0], rs.columns || []);
  const c = row?.c;
  const n = typeof c === "number" ? c : Number(c);
  return Number.isFinite(n) ? n : 0;
}

export async function listCases(db, publicBase) {
  const rs = await db.execute({
    sql: `SELECT id, title, pattern, tags_json, description, narrative, teaching_point, image_key, lesion_x, lesion_y, lesion_r, created_at
          FROM cases ORDER BY created_at DESC`,
    args: [],
  });
  const cols = rs.columns || [];
  return (rs.rows || []).map((r) => rowToCase(rowObject(r, cols), publicBase));
}

export async function getCaseById(db, id, publicBase) {
  const rs = await db.execute({
    sql: `SELECT id, title, pattern, tags_json, description, narrative, teaching_point, image_key, lesion_x, lesion_y, lesion_r
          FROM cases WHERE id = ?`,
    args: [id],
  });
  const row = rowObject(rs.rows?.[0], rs.columns || []);
  if (!row) return null;
  return rowToCase(row, publicBase);
}

export async function insertCase(db, payload) {
  await db.execute({
    sql: `INSERT INTO cases (id, title, pattern, tags_json, description, narrative, teaching_point, image_key, lesion_x, lesion_y, lesion_r)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      payload.id,
      payload.title,
      payload.pattern,
      JSON.stringify(payload.tags),
      payload.description,
      payload.narrative,
      payload.teachingPoint,
      payload.imageKey,
      payload.lesion.x,
      payload.lesion.y,
      payload.lesion.r,
    ],
  });
}

export async function updateCase(db, id, payload) {
  await db.execute({
    sql: `UPDATE cases SET
          title = ?, pattern = ?, tags_json = ?, description = ?, narrative = ?, teaching_point = ?,
          image_key = COALESCE(?, image_key),
          lesion_x = ?, lesion_y = ?, lesion_r = ?
          WHERE id = ?`,
    args: [
      payload.title,
      payload.pattern,
      JSON.stringify(payload.tags),
      payload.description,
      payload.narrative,
      payload.teachingPoint,
      payload.imageKey ?? null,
      payload.lesion.x,
      payload.lesion.y,
      payload.lesion.r,
      id,
    ],
  });
}

export async function deleteCaseRow(db, id) {
  const rs = await db.execute({
    sql: `SELECT image_key, image_key_2, image_key_3 FROM cases WHERE id = ?`,
    args: [id],
  });
  const row = rowObject(rs.rows?.[0], rs.columns || []);
  await db.execute({ sql: `DELETE FROM cases WHERE id = ?`, args: [id] });
  if (!row) return [];
  return rowKeysForPurge(row);
}
