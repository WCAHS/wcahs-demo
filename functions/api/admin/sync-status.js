import { json } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results: logs } = await context.env.DB.prepare(
    'SELECT * FROM sync_log ORDER BY id DESC LIMIT 10'
  ).all();

  const animalCount = await context.env.DB.prepare(
    'SELECT COUNT(*) as count FROM animals'
  ).first();

  const lastSuccess = await context.env.DB.prepare(
    "SELECT * FROM sync_log WHERE status = 'success' ORDER BY id DESC LIMIT 1"
  ).first();

  return json({
    current_animals: animalCount?.count || 0,
    last_success: lastSuccess?.synced_at || null,
    last_success_count: lastSuccess?.animal_count || 0,
    recent_syncs: logs,
  });
}
