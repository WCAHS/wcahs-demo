import { json, error } from '../_helpers.js';

async function runMigrations(db) {
  // Add hidden column if missing
  try { await db.prepare("ALTER TABLE animals ADD COLUMN hidden INTEGER DEFAULT 0").run(); } catch(e) {}
  // Add is_manual column if missing
  try { await db.prepare("ALTER TABLE animals ADD COLUMN is_manual INTEGER DEFAULT 0").run(); } catch(e) {}
  // Create happy_tails table
  await db.prepare(`CREATE TABLE IF NOT EXISTS happy_tails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pet_name TEXT NOT NULL,
    pet_type TEXT,
    breed TEXT,
    photo_url TEXT,
    family_photo_url TEXT,
    adoption_date TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function onRequestGet(context) {
  await runMigrations(context.env.DB);
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM animals ORDER BY name'
  ).all();
  const animals = results.map(a => ({
    ...a,
    photos: JSON.parse(a.photos || '[]'),
    attributes: JSON.parse(a.attributes || '[]'),
    hidden: a.hidden || 0,
    is_manual: a.is_manual || 0,
  }));
  return json({ animals, count: animals.length });
}

export async function onRequestPost(context) {
  await runMigrations(context.env.DB);
  const body = await context.request.json().catch(() => null);
  if (!body || !body.name) return error('Pet name is required');

  const id = 'manual-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  const ageMonths = parseInt(body.age) || 0;
  let ageDisplay = 'Unknown';
  if (ageMonths > 0) {
    if (ageMonths < 12) ageDisplay = ageMonths + ' mo';
    else {
      const y = Math.floor(ageMonths / 12);
      const m = ageMonths % 12;
      ageDisplay = m === 0 ? y + ' yr' : y + ' yr ' + m + ' mo';
    }
  }

  await context.env.DB.prepare(
    `INSERT INTO animals (id, shelterluv_id, name, type, breed, sex, age, age_display, size, weight, color, altered, microchipped, description, cover_photo, photos, attributes, adoption_fee, adoption_fee_name, in_foster, status, last_updated, hidden, is_manual)
     VALUES (?, '', ?, ?, ?, ?, ?, ?, '', '', '', '', 0, ?, ?, '[]', '[]', null, '', 0, 'Available', datetime('now'), 0, 1)`
  ).bind(
    id,
    body.name,
    body.type || '',
    body.breed || '',
    body.sex || '',
    ageMonths,
    ageDisplay,
    body.description || '',
    body.cover_photo || ''
  ).run();

  return json({ ok: true, id });
}

export async function onRequestPut(context) {
  await runMigrations(context.env.DB);
  const body = await context.request.json().catch(() => null);
  if (!body || !body.id) return error('Pet ID is required');

  const updates = [];
  const values = [];

  if (body.hidden !== undefined) {
    updates.push('hidden = ?');
    values.push(body.hidden ? 1 : 0);
  }
  if (body.cover_photo !== undefined) {
    updates.push('cover_photo = ?');
    values.push(body.cover_photo);
  }

  if (updates.length === 0) return error('No fields to update');

  values.push(body.id);
  await context.env.DB.prepare(
    `UPDATE animals SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await runMigrations(context.env.DB);
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return error('Pet ID is required');

  // Only allow deleting manual pets
  const pet = await context.env.DB.prepare('SELECT is_manual FROM animals WHERE id = ?').bind(id).first();
  if (!pet) return error('Pet not found', 404);
  if (!pet.is_manual) return error('Cannot delete synced pets — use hide instead', 403);

  await context.env.DB.prepare('DELETE FROM animals WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
