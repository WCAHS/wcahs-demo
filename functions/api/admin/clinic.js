import { json, error } from '../_helpers.js';

const DEFAULT_CAPS = { cats: 25, dogs: 25 };
const HOLDS_SPOT = ['applied', 'approved'];

async function readCaps(db) {
  const { results } = await db.prepare(
    `SELECT key, value FROM site_settings WHERE key IN ('clinic_cap_cats','clinic_cap_dogs')`
  ).all();
  const caps = { ...DEFAULT_CAPS };
  for (const row of results || []) {
    const n = parseInt(row.value, 10);
    if (!isNaN(n) && n >= 0) {
      if (row.key === 'clinic_cap_cats') caps.cats = n;
      if (row.key === 'clinic_cap_dogs') caps.dogs = n;
    }
  }
  return caps;
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const { results } = await db.prepare(
    'SELECT * FROM clinic_registrations ORDER BY created_at DESC'
  ).all();

  const caps = await readCaps(db);
  const used = await db.prepare(
    `SELECT COALESCE(SUM(cat_count), 0) AS cats, COALESCE(SUM(dog_count), 0) AS dogs
     FROM clinic_registrations
     WHERE status IN (${HOLDS_SPOT.map(() => '?').join(',')})`
  ).bind(...HOLDS_SPOT).first();

  return json({
    registrations: results || [],
    caps,
    used: { cats: used?.cats || 0, dogs: used?.dogs || 0 },
  });
}

// Capacity lives here rather than in site settings so staff (who can reach
// /api/admin/clinic but not /api/admin/settings) can change it themselves.
export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const updates = [];
  for (const [field, key] of [['cap_cats', 'clinic_cap_cats'], ['cap_dogs', 'clinic_cap_dogs']]) {
    if (body[field] === undefined) continue;
    const n = parseInt(body[field], 10);
    if (isNaN(n) || n < 0) return error('Capacity must be zero or a positive number');
    updates.push([key, String(n)]);
  }
  if (updates.length === 0) return error('Nothing to update');

  const stmt = context.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  await context.env.DB.batch(updates.map(([k, v]) => stmt.bind(k, v)));

  return json({ ok: true, caps: await readCaps(context.env.DB) });
}
