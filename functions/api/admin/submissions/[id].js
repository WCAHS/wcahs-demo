import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const sets = [];
  const vals = [];
  if (body.is_read !== undefined) { sets.push('is_read=?'); vals.push(body.is_read ? 1 : 0); }
  if (body.status) { sets.push('status=?'); vals.push(body.status); }
  if (sets.length === 0) return error('Nothing to update');

  vals.push(id);
  await context.env.DB.prepare(`UPDATE form_submissions SET ${sets.join(', ')} WHERE id=?`)
    .bind(...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare('DELETE FROM form_submissions WHERE id = ?').bind(context.params.id).run();
  return json({ ok: true });
}
