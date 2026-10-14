import { getSession } from './_helpers.js';

// Beacon endpoint for the admin page's own activity log (see the migration
// 2026-10-14-client-events.sql for why it exists). Unauthenticated on purpose:
// the events that matter most — the CAPTCHA never finishing, the login form
// showing up — happen before anyone is signed in. To keep an open write
// endpoint from becoming a dumping ground: known event names only, small
// payloads, a per-IP rate limit, and 30-day pruning.
const EVENTS = new Set([
  'page_load', 'auth_check', 'turnstile', 'login', 'nav', 'deep_link',
  'report_action', 'toast', 'session_expired', 'js_error',
]);
const PER_IP_PER_MINUTE = 60;

export async function onRequestPost(context) {
  const { env, request } = context;
  const ok = new Response(null, { status: 204 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || !EVENTS.has(body.event)) return ok;
    const ip = request.headers.get('CF-Connecting-IP') || null;

    const recent = await env.DB.prepare(
      "SELECT COUNT(*) n FROM client_events WHERE ip IS ? AND at > datetime('now', '-1 minute')"
    ).bind(ip).first();
    if (recent && recent.n >= PER_IP_PER_MINUTE) return ok;

    const session = await getSession(request, env.DB).catch(() => null);
    let detail = body.detail == null ? null : JSON.stringify(body.detail);
    if (detail && detail.length > 1000) detail = detail.slice(0, 1000);

    await env.DB.prepare(
      'INSERT INTO client_events (username, visit, event, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      session ? session.username : null,
      String(body.visit || '').slice(0, 16) || null,
      body.event,
      detail,
      ip,
      (request.headers.get('User-Agent') || '').slice(0, 200)
    ).run();

    // Prune now and then rather than on every write. login_attempts had no
    // pruning at all and holds email addresses people typed by mistake.
    if (Math.random() < 0.02) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM client_events WHERE at < datetime('now', '-30 days')"),
        env.DB.prepare("DELETE FROM login_attempts WHERE at < datetime('now', '-90 days')"),
      ]);
    }
  } catch (e) {
    console.error('client log failed:', e && e.message);
  }
  return ok;
}
