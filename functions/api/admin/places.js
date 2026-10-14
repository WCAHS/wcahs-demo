import { json, error } from '../_helpers.js';

// Shelter landmarks for the Lost & Found "Where" box — the places people
// actually say ("near Goose Lake Park") that OpenStreetMap doesn't have.
export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare('SELECT * FROM places ORDER BY name COLLATE NOCASE').all();
  return json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const name = body && String(body.name || '').trim().slice(0, 100);
  const lat = Number(body && body.lat), lng = Number(body && body.lng);
  if (!name) return error('Give the place a name');
  if (!(lat > 43 && lat < 45.5 && lng > -95.5 && lng < -92)) return error('Drop a pin on the map for it');
  const res = await context.env.DB.prepare(
    'INSERT INTO places (name, lat, lng, note, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, lat, lng, (body.note || '').trim().slice(0, 200) || null, context.data.user?.username || null).run();
  return json({ ok: true, id: res.meta?.last_row_id || null });
}

export async function onRequestDelete(context) {
  const id = Number(new URL(context.request.url).searchParams.get('id'));
  if (!id) return error('Which place?');
  await context.env.DB.prepare('DELETE FROM places WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
