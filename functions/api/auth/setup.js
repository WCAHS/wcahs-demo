import { json, error, hashPassword } from '../_helpers.js';

// First-run setup — only works when zero users exist
export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || !body.username || !body.password) {
    return error('Username and password required');
  }
  if (body.password.length < 8) {
    return error('Password must be at least 8 characters');
  }

  const count = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
  if (count.c > 0) return error('Setup already completed', 403);

  const hash = await hashPassword(body.password);
  await env.DB.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .bind(body.username, hash, 'admin').run();

  return json({ ok: true, message: 'Admin account created' });
}
