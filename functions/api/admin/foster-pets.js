import { json, error } from '../_helpers.js';

async function runMigrations(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS foster_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    animal_id TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, animal_id)
  )`).run();
  // public_note: one short note per foster/pet shown on the public pet page.
  // Separate from foster_updates, which is the internal running timeline.
  try { await db.prepare('ALTER TABLE foster_assignments ADD COLUMN public_note TEXT').run(); } catch (e) {}
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
    `SELECT fa.id as assignment_id, fa.animal_id, fa.assigned_at, fa.public_note,
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

  // Saving the public note replaces the single note rather than appending to the
  // timeline, so it's handled before the normal update path.
  if (body.public_note !== undefined) {
    await db.prepare('UPDATE foster_assignments SET public_note = ? WHERE id = ?')
      .bind(String(body.public_note).slice(0, 600), assignment.id).run();
    return json({ ok: true, public_note: String(body.public_note).slice(0, 600) });
  }

  const updateType = body.update_type || 'note';
  const content = body.content || '';
  const photoUrl = body.photo_url || '';

  if (!content && !photoUrl) return error('Content or photo is required');

  // One testimonial per pet. It's the pet's public blurb, not a running feed, so
  // saving a new one replaces whatever was there — including one written by a
  // different foster, which is why this is not scoped to the current user.
  if (updateType === 'testimonial') {
    await db.prepare("DELETE FROM foster_updates WHERE animal_id = ? AND update_type = 'testimonial'")
      .bind(body.animal_id).run();
  }

  await db.prepare(
    `INSERT INTO foster_updates (assignment_id, user_id, animal_id, update_type, content, photo_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(assignment.id, user.user_id, body.animal_id, updateType, content, photoUrl).run();

  return json({ ok: true });
}

/* Delete a foster update. Fosters may remove their own; admins may remove any.
 * Testimonials and photos are publicly visible, so staff need a way to take
 * something down without asking the foster to do it. */
export async function onRequestDelete(context) {
  const db = context.env.DB;
  const user = context.data.user;
  await runMigrations(db);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return error('id is required');

  const row = await db.prepare('SELECT id, user_id, photo_url FROM foster_updates WHERE id = ?').bind(id).first();
  if (!row) return error('Update not found', 404);

  if (user.role !== 'admin' && row.user_id !== user.user_id) {
    return error('You can only remove your own updates', 403);
  }

  // Destroy the underlying R2 object too. Dropping only the DB row would leave the
  // file reachable at its direct /api/images/... URL to anyone who saved the link.
  // Only our own uploads are touched — ShelterLuv photos are absolute URLs on their
  // S3 and are not ours to delete (and would come back on the next sync anyway).
  let photoDeleted = false;
  const storedPhoto = row.photo_url || '';
  if (storedPhoto.startsWith('/api/images/')) {
    const key = storedPhoto.replace(/^\/api\/images\//, '').split('?')[0];
    if (key) {
      try { await context.env.UPLOADS.delete(key); photoDeleted = true; }
      catch (e) { console.error('R2 delete failed for', key, e && e.message); }
    }
  }

  await db.prepare('DELETE FROM foster_updates WHERE id = ?').bind(id).run();
  return json({ ok: true, deleted: Number(id), photoDeleted });
}
