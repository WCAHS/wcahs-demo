import { json, error } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM gallery_photos ORDER BY page, sort_order'
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.url) return error('URL required');

  const maxOrder = await context.env.DB.prepare(
    'SELECT MAX(sort_order) as m FROM gallery_photos WHERE page = ?'
  ).bind(body.page || 'about').first();

  const result = await context.env.DB.prepare(
    'INSERT INTO gallery_photos (url, alt_text, sort_order, page) VALUES (?, ?, ?, ?)'
  ).bind(body.url, body.alt_text || null, (maxOrder?.m || 0) + 1, body.page || 'about').run();

  return json({ ok: true, id: result.meta.last_row_id });
}
