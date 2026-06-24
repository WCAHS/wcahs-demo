import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, pet_name, pet_type, breed, photo_url, family_photo_url, adoption_date, description, created_at
     FROM happy_tails ORDER BY adoption_date DESC`
  ).all();
  return json(results);
}
