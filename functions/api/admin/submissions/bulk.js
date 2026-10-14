import { json, error } from '../../_helpers.js';

// Act on several inbox messages at once: archive, unarchive, mark read or
// unread, or delete. One statement per action, so a half-applied batch
// can't happen.
const ACTIONS = {
  archive:   "UPDATE form_submissions SET archived_at = datetime('now'), is_read = 1 WHERE id IN",
  unarchive: 'UPDATE form_submissions SET archived_at = NULL WHERE id IN',
  read:      'UPDATE form_submissions SET is_read = 1 WHERE id IN',
  unread:    'UPDATE form_submissions SET is_read = 0 WHERE id IN',
  delete:    'DELETE FROM form_submissions WHERE id IN',
};

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const sql = body && ACTIONS[body.action];
  if (!sql) return error('Unknown action');
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500) : [];
  if (!ids.length) return error('Nothing selected');
  const res = await context.env.DB.prepare(`${sql} (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  return json({ ok: true, changed: res.meta?.changes ?? null });
}
