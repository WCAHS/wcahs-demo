import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body || body.is_read === undefined) return error('is_read required');

  await context.env.DB.prepare('UPDATE form_submissions SET is_read = ? WHERE id = ?')
    .bind(body.is_read ? 1 : 0, id).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare('DELETE FROM form_submissions WHERE id = ?').bind(context.params.id).run();
  return json({ ok: true });
}
