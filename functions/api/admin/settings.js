import { json, error } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  for (const row of results) {
    try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
  }
  return json(settings);
}

export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const stmt = context.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const batch = Object.entries(body).map(([key, value]) => {
    const val = typeof value === 'string' ? value : JSON.stringify(value);
    return stmt.bind(key, val);
  });
  await context.env.DB.batch(batch);

  return json({ ok: true });
}
