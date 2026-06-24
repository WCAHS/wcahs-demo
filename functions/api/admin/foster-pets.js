import { json, error } from '../_helpers.js';

async function runMigrations(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS foster_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    animal_id TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, animal_id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS foster_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    animal_id TEXT NOT NULL,
    update_type TEXT DEFAULT 'note',
    content TEXT,
    photo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const user = context.data.user;
  await runMigrations(db);

  // Get pets assigned to this foster user
  const { results: assignments } = await db.prepare(
    `SELECT fa.id as assignment_id, fa.animal_id, fa.assigned_at,
            a.name, a.type, a.breed, a.sex, a.age_display, a.cover_photo, a.status, a.description
     FROM foster_assignments fa
     LEFT JOIN animals a ON fa.animal_id = a.id
     WHERE fa.user_id = ?
     ORDER BY fa.assigned_at DESC`
  ).bind(user.user_id).all();

  // Get updates for all assigned pets
  const { results: updates } = await db.prepare(
    `SELECT fu.* FROM foster_updates fu
     INNER JOIN foster_assignments fa ON fu.assignment_id = fa.id
     WHERE fa.user_id = ?
     ORDER BY fu.created_at DESC`
  ).bind(user.user_id).all();

  // Group updates by animal_id
  const updatesByAnimal = {};
  for (const u of updates) {
    if (!updatesByAnimal[u.animal_id]) updatesByAnimal[u.animal_id] = [];
    updatesByAnimal[u.animal_id].push(u);
  }

  const pets = assignments.map(a => ({
    ...a,
    updates: updatesByAnimal[a.animal_id] || [],
  }));

  return json({ pets });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  const user = context.data.user;
  await runMigrations(db);

  const body = await context.request.json().catch(() => null);
  if (!body || !body.animal_id) return error('animal_id is required');

  // Verify the pet is assigned to this user
  const assignment = await db.prepare(
    'SELECT id FROM foster_assignments WHERE user_id = ? AND animal_id = ?'
  ).bind(user.user_id, body.animal_id).first();

  if (!assignment) return error('This pet is not assigned to you', 403);

  const updateType = body.update_type || 'note';
  const content = body.content || '';
  const photoUrl = body.photo_url || '';

  if (!content && !photoUrl) return error('Content or photo is required');

  await db.prepare(
    `INSERT INTO foster_updates (assignment_id, user_id, animal_id, update_type, content, photo_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(assignment.id, user.user_id, body.animal_id, updateType, content, photoUrl).run();

  return json({ ok: true });
}
