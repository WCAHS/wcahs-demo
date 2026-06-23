import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  await context.env.DB.prepare(
    `UPDATE events SET title=?, date=?, time=?, location=?, description=?, badge=?, color=?, published=?, updated_at=datetime('now')
     WHERE id=?`
  ).bind(
    body.title, body.date, body.time || null, body.location || null,
    body.description || null, body.badge || null, body.color || 'sage',
    body.published ? 1 : 0, id
  ).run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(context.params.id).run();
  return json({ ok: true });
}
