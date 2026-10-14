import { json, error, hashPassword } from '../_helpers.js';

export async function onRequestGet(context) {
  // Only admins can view users
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const { results } = await context.env.DB.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY id'
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const body = await context.request.json().catch(() => null);
  if (!body || !body.username || !body.password || !body.role) {
    return error('Username, password, and role required');
  }
  if (body.password.length < 8) return error('Password must be at least 8 characters');
  if (!['admin', 'staff', 'foster'].includes(body.role)) return error('Role must be admin, staff, or foster');

  // Stored trimmed, and the collision check is case-insensitive to match how
  // login looks accounts up. An "Admin" alongside an "admin" would make the
  // login's NOCASE lookup ambiguous, and neither person could be told which
  // account they actually have.
  const username = String(body.username).trim();
  if (!username) return error('Username required');
  // Login tells anyone who types an '@' to use their username instead, so a
  // username can't be an email address.
  if (username.includes('@')) return error('Usernames can\'t contain @ — use a plain name like "jsmith"');

  const existing = await context.env.DB.prepare(
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE'
  ).bind(username).first();
  if (existing) return error('Username already exists');

  const hash = await hashPassword(body.password);
  await context.env.DB.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .bind(username, hash, body.role).run();

  return json({ ok: true });
}
