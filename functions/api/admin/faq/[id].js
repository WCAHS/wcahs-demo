import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  await context.env.DB.prepare(
    `UPDATE faq SET section=?, question=?, answer=?, sort_order=?, updated_at=datetime('now') WHERE id=?`
  ).bind(body.section, body.question, body.answer, body.sort_order || 0, id).run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare('DELETE FROM faq WHERE id = ?').bind(context.params.id).run();
  return json({ ok: true });
}
