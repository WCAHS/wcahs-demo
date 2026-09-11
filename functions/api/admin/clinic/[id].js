import { json, error } from '../../_helpers.js';

const STATUSES = ['applied', 'approved', 'ineligible', 'cancelled'];

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const sets = [];
  const vals = [];
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return error('Unknown status');
    sets.push('status=?'); vals.push(body.status);
  }
  if (body.staff_notes !== undefined) { sets.push('staff_notes=?'); vals.push(body.staff_notes); }
  if (sets.length === 0) return error('Nothing to update');

  sets.push("updated_at=datetime('now')");
  vals.push(id);

  await context.env.DB.prepare(
    `UPDATE clinic_registrations SET ${sets.join(', ')} WHERE id=?`
  ).bind(...vals).run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare('DELETE FROM clinic_registrations WHERE id = ?').bind(context.params.id).run();
  return json({ ok: true });
}
