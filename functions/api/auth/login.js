import { json, error, verifyPassword, verifyTurnstile } from '../_helpers.js';

// Every attempt lands in login_attempts so a lockout can be diagnosed after the
// fact. The screen deliberately says the same thing for a bad username and a bad
// password — that's right for an attacker, useless for a volunteer on the phone
// with us, and this table is how we tell the two apart. Never records the
// password. Best-effort: a logging failure must never block a real login.
async function record(env, request, username, outcome) {
  try {
    await env.DB.prepare(
      'INSERT INTO login_attempts (username, outcome, ip, user_agent) VALUES (?, ?, ?, ?)'
    ).bind(
      (username || '').slice(0, 100),
      outcome,
      request.headers.get('CF-Connecting-IP') || null,
      (request.headers.get('User-Agent') || '').slice(0, 200)
    ).run();
  } catch (e) {
    console.error('login_attempts insert failed:', e && e.message);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password) {
    await record(env, request, body && body.username, 'malformed');
    return error('Username and password required');
  }

  // What the user typed, kept verbatim for the log — capitalisation is exactly
  // the evidence we need — and normalised separately for the lookup.
  const typed = String(body.username);

  // The CAPTCHA is the only brute-force protection on this login — there is no
  // rate limiting behind it. It used to run only `if (body.turnstile_token)`,
  // which meant omitting the field skipped the check entirely and left the
  // admin password open to unlimited scripted guessing.
  if (!body.turnstile_token) {
    await record(env, request, typed, 'captcha_missing');
    return error('CAPTCHA required', 403);
  }
  const captchaOk = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!captchaOk) {
    await record(env, request, typed, 'captcha_failed');
    return error('CAPTCHA verification failed', 403);
  }

  // Usernames are matched case-insensitively and without surrounding spaces.
  // Phone and tablet keyboards capitalise the first letter of a plain text
  // field by default, so "admin" arrives as "Admin"; with an exact match that
  // returns no row and reads on screen as a wrong password, which no amount of
  // password resetting will ever fix. Creation enforces the same rule, so this
  // can still only ever match one account.
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE username = ? COLLATE NOCASE'
  ).bind(typed.trim()).first();
  if (!user) {
    await record(env, request, typed, 'no_such_user');
    // Staff accounts have no email address, yet typing one is the single most
    // common lockout we've seen. Saying so leaks nothing — no account here is
    // an email address, so it can't confirm or deny one exists.
    if (typed.includes('@')) {
      return error('Use your username here, not your email address. Ask Riley if you\'re not sure what it is.', 401);
    }
    return error('Invalid credentials', 401);
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    await record(env, request, typed, 'bad_password');
    return error('Invalid credentials', 401);
  }

  // Create session
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, user.id, expiresAt).run();
  await record(env, request, typed, 'ok');

  return new Response(JSON.stringify({ ok: true, username: user.username, role: user.role }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `wcahs_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    },
  });
}
