import { json, error } from '../_helpers.js';

/* Bonded pairs.
 *
 * ShelterLuv only tells us THAT an animal is bonded (a "Bonded" attribute string),
 * never who with. Staff record the partner here.
 *
 * This lives in its own table rather than a column on `animals` on purpose: the
 * ShelterLuv sync does `DELETE FROM animals` and re-inserts every run, so anything
 * stored on that row is wiped unless the workflow explicitly saves and restores it
 * (the way it does for `hidden`). A separate table is untouched by the sync.
 */
async function migrate(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS bonded_pairs (
    animal_id TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  await migrate(db);
  const { results } = await db.prepare(
    `SELECT bp.animal_id, bp.partner_id, a.name AS partner_name, a.cover_photo AS partner_photo
       FROM bonded_pairs bp
       LEFT JOIN animals a ON a.id = bp.partner_id`
  ).all();
  return json({ pairs: results || [] });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  await migrate(db);

  const body = await context.request.json().catch(() => null);
  if (!body || !body.animal_id) return error('animal_id is required');

  const animalId = String(body.animal_id);

  // Clearing the pairing removes both directions.
  if (!body.partner_id) {
    const existing = await db.prepare('SELECT partner_id FROM bonded_pairs WHERE animal_id = ?').bind(animalId).first();
    await db.prepare('DELETE FROM bonded_pairs WHERE animal_id = ?').bind(animalId).run();
    if (existing && existing.partner_id) {
      await db.prepare('DELETE FROM bonded_pairs WHERE animal_id = ? AND partner_id = ?')
        .bind(existing.partner_id, animalId).run();
    }
    return json({ ok: true, cleared: true });
  }

  const partnerId = String(body.partner_id);
  if (partnerId === animalId) return error('A pet cannot be bonded to itself');

  const partner = await db.prepare('SELECT id FROM animals WHERE id = ?').bind(partnerId).first();
  if (!partner) return error('That pet was not found');

  // Both animals point at each other, so opening either page shows the link.
  // Drop any stale pairing the two were previously part of first.
  const prev = await db.prepare('SELECT partner_id FROM bonded_pairs WHERE animal_id = ?').bind(animalId).first();
  if (prev && prev.partner_id && prev.partner_id !== partnerId) {
    await db.prepare('DELETE FROM bonded_pairs WHERE animal_id = ?').bind(prev.partner_id).run();
  }

  await db.prepare(
    `INSERT INTO bonded_pairs (animal_id, partner_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(animal_id) DO UPDATE SET partner_id = excluded.partner_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(animalId, partnerId).run();

  await db.prepare(
    `INSERT INTO bonded_pairs (animal_id, partner_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(animal_id) DO UPDATE SET partner_id = excluded.partner_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(partnerId, animalId).run();

  return json({ ok: true, animal_id: animalId, partner_id: partnerId });
}
