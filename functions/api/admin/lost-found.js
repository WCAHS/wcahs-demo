import { json } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM lost_found_reports ORDER BY created_at DESC'
  ).all();
  return json(results);
}
