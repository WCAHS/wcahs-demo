import { json, error, hashPassword, verifyPassword } from '../_helpers.js';

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.current_password || !body.new_password) {
    return error('Current and new password required');
  }
  if (body.new_password.length < 8) return error('New password must be at least 8 characters');

  const user = await context.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(context.data.user.user_id).first();
  if (!user) return error('User not found', 404);

  const valid = await verifyPassword(body.current_password, user.password_hash);
  if (!valid) return error('Current password is incorrect', 401);

  const hash = await hashPassword(body.new_password);
  await context.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(hash, user.id).run();

  return json({ ok: true, message: 'Password changed' });
}
