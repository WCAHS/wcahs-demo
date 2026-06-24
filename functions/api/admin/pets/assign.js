import { json, error } from '../../_helpers.js';

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS foster_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    animal_id TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, animal_id)
  )`).run();
}

export async function onRequestGet(context) {
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const db = context.env.DB;
  await ensureTables(db);

  const { results } = await db.prepare(
    `SELECT fa.id, fa.user_id, fa.animal_id, fa.assigned_at,
            u.username, a.name as pet_name
     FROM foster_assignments fa
     LEFT JOIN users u ON fa.user_id = u.id
     LEFT JOIN animals a ON fa.animal_id = a.id
     ORDER BY fa.assigned_at DESC`
  ).all();

  return json(results);
}

export async function onRequestPost(context) {
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const db = context.env.DB;
  await ensureTables(db);

  const body = await context.request.json().catch(() => null);
  if (!body || !body.animal_id || !body.user_id) return error('animal_id and user_id are required');

  // Verify user exists and is a foster
  const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(body.user_id).first();
  if (!user) return error('User not found', 404);
  if (user.role !== 'foster') return error('User is not a foster', 400);

  // Verify animal exists
  const animal = await db.prepare('SELECT id FROM animals WHERE id = ?').bind(body.animal_id).first();
  if (!animal) return error('Pet not found', 404);

  try {
    await db.prepare(
      'INSERT INTO foster_assignments (user_id, animal_id) VALUES (?, ?)'
    ).bind(body.user_id, body.animal_id).run();
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return error('This pet is already assigned to this foster');
    throw e;
  }

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  if (context.data.user.role !== 'admin') return error('Forbidden', 403);
  const db = context.env.DB;
  await ensureTables(db);

  const body = await context.request.json().catch(() => null);
  if (!body || !body.animal_id || !body.user_id) return error('animal_id and user_id are required');

  await db.prepare(
    'DELETE FROM foster_assignments WHERE user_id = ? AND animal_id = ?'
  ).bind(body.user_id, body.animal_id).run();

  return json({ ok: true });
}
