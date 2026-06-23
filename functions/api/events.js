import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, title, date, time, location, description, badge, color
     FROM events WHERE published = 1 AND date >= date('now')
     ORDER BY date ASC`
  ).all();
  return json(results);
}
