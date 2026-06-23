import { json } from '../_helpers.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type');
  let query = 'SELECT * FROM form_submissions';
  const params = [];
  if (type) { query += ' WHERE type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC';

  const { results } = params.length
    ? await context.env.DB.prepare(query).bind(...params).all()
    : await context.env.DB.prepare(query).all();
  return json(results);
}
