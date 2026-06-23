import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const page = url.searchParams.get('page') || 'about';
  const { results } = await context.env.DB.prepare(
    'SELECT id, url, alt_text, sort_order FROM gallery_photos WHERE page = ? ORDER BY sort_order'
  ).bind(page).all();
  return json(results);
}
