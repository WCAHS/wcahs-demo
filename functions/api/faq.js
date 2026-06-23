import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT id, section, question, answer, sort_order FROM faq ORDER BY section, sort_order'
  ).all();
  // Group by section
  const grouped = {};
  for (const row of results) {
    if (!grouped[row.section]) grouped[row.section] = [];
    grouped[row.section].push(row);
  }
  return json(grouped);
}
