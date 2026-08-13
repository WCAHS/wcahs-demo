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
  const db = context.env.DB;

  // Remove the foster's content along with the account. Previously only the user
  // row went, leaving their assignments orphaned and their testimonials/photos
  // still public with no owner and no way to remove them from the UI.
  let photosDeleted = 0, updatesDeleted = 0, assignmentsDeleted = 0;
  try {
    const { results: updates } = await db.prepare(
      'SELECT id, photo_url FROM foster_updates WHERE user_id = ?'
    ).bind(id).all();

    for (const u of (updates || [])) {
      const stored = u.photo_url || '';
      if (stored.startsWith('/api/images/')) {
        const key = stored.replace(/^\/api\/images\//, '').split('?')[0];
        if (key) {
          try { await context.env.UPLOADS.delete(key); photosDeleted++; }
          catch (e) { console.error('R2 delete failed for', key, e && e.message); }
        }
      }
    }

    const delUpdates = await db.prepare('DELETE FROM foster_updates WHERE user_id = ?').bind(id).run();
    updatesDeleted = delUpdates.meta ? delUpdates.meta.changes : 0;

    const delAssign = await db.prepare('DELETE FROM foster_assignments WHERE user_id = ?').bind(id).run();
    assignmentsDeleted = delAssign.meta ? delAssign.meta.changes : 0;
  } catch (e) {
    console.error('foster cleanup failed for user', id, e && e.message);
  }

  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ ok: true, photosDeleted, updatesDeleted, assignmentsDeleted });
}
