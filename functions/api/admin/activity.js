import { json, error } from '../_helpers.js';

// Admin > Activity. Merges the page's own events with login attempts into one
// timeline, so "it's being weird" can be answered by looking rather than
// guessing. Admin-only: the staff allowlist in _middleware.js doesn't list it.
const PROBLEMS = `(
  (event = 'js_error') OR (event = 'session_expired')
  OR (event = 'turnstile' AND json_extract(detail, '$.state') IN ('error','expired','timeout','slow'))
  OR (event = 'login' AND json_extract(detail, '$.ok') = 0)
  OR (event = 'deep_link' AND json_extract(detail, '$.outcome') IN ('timeout','deleted','not_permitted'))
  OR (event = 'report_action' AND json_extract(detail, '$.ok') = 0)
  OR (event = 'auth_check' AND json_extract(detail, '$.result') = 'error')
)`;

export async function onRequestGet(context) {
  const { env, request, data } = context;
  if (data.user.role !== 'admin') return error('Admins only', 403);
  const url = new URL(request.url);
  const user = url.searchParams.get('user') || '';
  const problems = url.searchParams.get('problems') === '1';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 300, 1000);

  // A signed-out visit has no username, so a person is matched by name OR by
  // an IP they've used while signed in — otherwise everything that went wrong
  // before she logged in would be invisible exactly when it matters.
  const userFilter = user
    ? `AND (username = ?1 COLLATE NOCASE OR (username IS NULL AND ip IN (
         SELECT DISTINCT ip FROM client_events WHERE username = ?1 COLLATE NOCASE
         UNION SELECT DISTINCT ip FROM login_attempts WHERE username = ?1 COLLATE NOCASE)))`
    : '';

  const events = await env.DB.prepare(
    `SELECT at, username, visit, event, detail, ip, user_agent, 'page' AS source
       FROM client_events WHERE 1=1 ${userFilter} ${problems ? 'AND ' + PROBLEMS : ''}
      ORDER BY at DESC, id DESC LIMIT ?2`
  ).bind(user, limit).all();

  const logins = await env.DB.prepare(
    `SELECT at, username, NULL AS visit, 'login_server' AS event,
            json_object('outcome', outcome) AS detail, ip, user_agent, 'server' AS source
       FROM login_attempts
      WHERE 1=1 ${user ? `AND (username = ?1 COLLATE NOCASE OR ip IN (SELECT DISTINCT ip FROM client_events WHERE username = ?1 COLLATE NOCASE))` : ''}
        ${problems ? "AND outcome != 'ok'" : ''}
      ORDER BY at DESC, id DESC LIMIT ?2`
  ).bind(user, limit).all();

  const rows = [...(events.results || []), ...(logins.results || [])]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);

  const users = await env.DB.prepare(
    `SELECT username FROM users ORDER BY username COLLATE NOCASE`
  ).all();

  return json({ rows, users: (users.results || []).map(u => u.username) });
}
