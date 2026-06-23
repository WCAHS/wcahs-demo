import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, title, date, end_date, time, location, description, badge, color
     FROM events WHERE published = 1 AND (end_date >= date('now') OR (end_date IS NULL AND date >= date('now')))
     ORDER BY date ASC`
  ).all();
  return json(results);
}
