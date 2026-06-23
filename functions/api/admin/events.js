import { json, error } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM events ORDER BY date DESC'
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.title || !body.date) return error('Title and date required');

  const result = await context.env.DB.prepare(
    `INSERT INTO events (title, date, time, location, description, badge, color, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.title, body.date, body.time || null, body.location || null,
    body.description || null, body.badge || null, body.color || 'sage',
    body.published !== undefined ? (body.published ? 1 : 0) : 1
  ).run();

  return json({ ok: true, id: result.meta.last_row_id });
}
