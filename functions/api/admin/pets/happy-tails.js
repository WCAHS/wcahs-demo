import { json, error } from '../../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM happy_tails ORDER BY created_at DESC'
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  // Handle photo update for existing entry
  if (body._update_photo && body.id) {
    await context.env.DB.prepare(
      'UPDATE happy_tails SET family_photo_url = ? WHERE id = ?'
    ).bind(body.family_photo_url || '', body.id).run();
    return json({ ok: true });
  }

  if (!body.pet_name) return error('Pet name is required');

  await context.env.DB.prepare(
    `INSERT INTO happy_tails (pet_name, pet_type, breed, photo_url, family_photo_url, adoption_date, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.pet_name,
    body.pet_type || '',
    body.breed || '',
    body.photo_url || '',
    body.family_photo_url || '',
    body.adoption_date || '',
    body.description || ''
  ).run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return error('ID is required');

  await context.env.DB.prepare('DELETE FROM happy_tails WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
