import { json, error, verifyPassword, verifyTurnstile } from '../_helpers.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password) {
    return error('Username and password required');
  }

  // Verify turnstile if token provided
  if (body.turnstile_token) {
    const valid = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
    if (!valid) return error('CAPTCHA verification failed', 403);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(body.username).first();
  if (!user) return error('Invalid credentials', 401);

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return error('Invalid credentials', 401);

  // Create session
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, user.id, expiresAt).run();

  return new Response(JSON.stringify({ ok: true, username: user.username, role: user.role }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `wcahs_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`,
    },
  });
}
