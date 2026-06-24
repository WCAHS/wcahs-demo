import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const sets = [];
  const vals = [];
  if (body.status) { sets.push('status=?'); vals.push(body.status); }
  if (body.resolved_note !== undefined) { sets.push('resolved_note=?'); vals.push(body.resolved_note); }
  if (body.pet_name !== undefined) { sets.push('pet_name=?'); vals.push(body.pet_name); }
  if (body.breed !== undefined) { sets.push('breed=?'); vals.push(body.breed); }
  if (body.color !== undefined) { sets.push('color=?'); vals.push(body.color); }
  if (body.description !== undefined) { sets.push('description=?'); vals.push(body.description); }
  if (body.location_details !== undefined) { sets.push('location_details=?'); vals.push(body.location_details); }
  if (sets.length === 0) return error('Nothing to update');

  sets.push("updated_at=datetime('now')");
  vals.push(id);

  await context.env.DB.prepare(
    `UPDATE lost_found_reports SET ${sets.join(', ')} WHERE id=?`
  ).bind(...vals).run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await context.env.DB.prepare('DELETE FROM lost_found_reports WHERE id = ?').bind(context.params.id).run();
  return json({ ok: true });
}
