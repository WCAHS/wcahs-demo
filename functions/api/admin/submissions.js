import { json } from '../_helpers.js';

// Read messages leave the Inbox on their own after this long. Archived, not
// deleted: they stay under the Archive tab.
const AUTO_ARCHIVE_DAYS = 30;

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const archived = url.searchParams.get('archived') === '1';

  await env.DB.prepare(
    `UPDATE form_submissions SET archived_at = datetime('now')
      WHERE archived_at IS NULL AND is_read = 1 AND created_at < datetime('now', ?)`
  ).bind(`-${AUTO_ARCHIVE_DAYS} days`).run();

  let query = `SELECT * FROM form_submissions WHERE archived_at IS ${archived ? 'NOT ' : ''}NULL`;
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY created_at DESC';
  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json(results);
}
