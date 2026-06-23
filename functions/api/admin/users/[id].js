import { json, error, hashPassword } from '../../_helpers.js';

export async function onRequestPut(context) {
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const id = context.params.id;
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  if (body.password) {
    if (body.password.length < 8) return error('Password must be at least 8 characters');
    const hash = await hashPassword(body.password);
    await context.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, id).run();
  }
  if (body.role && ['admin', 'staff'].includes(body.role)) {
    await context.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id).run();
  }

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const id = context.params.id;
  // Don't let them delete themselves
  if (parseInt(id) === context.data.user.user_id) return error("Can't delete your own account");
  await context.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await context.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
