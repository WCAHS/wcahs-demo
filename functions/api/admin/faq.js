import { json, error } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM faq ORDER BY section, sort_order'
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.section || !body.question || !body.answer) {
    return error('Section, question, and answer required');
  }

  const maxOrder = await context.env.DB.prepare(
    'SELECT MAX(sort_order) as m FROM faq WHERE section = ?'
  ).bind(body.section).first();

  const result = await context.env.DB.prepare(
    'INSERT INTO faq (section, question, answer, sort_order) VALUES (?, ?, ?, ?)'
  ).bind(body.section, body.question, body.answer, (maxOrder?.m || 0) + 1).run();

  return json({ ok: true, id: result.meta.last_row_id });
}
