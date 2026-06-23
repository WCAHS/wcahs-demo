import { json, error } from '../../_helpers.js';

export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return error('items array required');

  const stmt = context.env.DB.prepare('UPDATE faq SET sort_order = ? WHERE id = ?');
  const batch = body.items.map((item, i) => stmt.bind(i, item.id));
  await context.env.DB.batch(batch);

  return json({ ok: true });
}
