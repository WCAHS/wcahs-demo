import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const sets = [];
  const vals = [];
  if (body.status) { sets.push('status=?'); vals.push(body.status); }
  if (body.resolved_note !== undefined) { sets.push('resolved_note=?'); vals.push(body.resolved_note); }
  if (body.renew) { sets.push("created_at=datetime('now')"); }

  // Everything a report holds that a person could get wrong on a phone keyboard,
  // or that staff learn after the fact ("it does have a collar"). Only the five
  // the poster happened to send were editable before, and only through the
  // poster — there was no way to correct a report from the admin at all.
  const EDITABLE = ['type', 'pet_name', 'species', 'breed', 'color', 'gender',
    'location_details', 'description', 'collar_details', 'collar_status',
    'temperament', 'current_location', 'reporter_name', 'reporter_phone',
    'reporter_email', 'photo_url'];
  for (const field of EDITABLE) {
    if (body[field] === undefined) continue;
    // type, species and reporter_name are NOT NULL; blanking one would either
    // fail the write or render as an empty card rather than fail loudly.
    if ((field === 'type' || field === 'species' || field === 'reporter_name') && !body[field]) continue;
    if (field === 'type' && body.type !== 'lost' && body.type !== 'found') continue;
    sets.push(`${field}=?`);
    vals.push(body[field] === '' ? null : body[field]);
  }

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
