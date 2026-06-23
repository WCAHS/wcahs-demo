import { json, error } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  for (const row of results) {
    // Try to parse JSON values (like partners array)
    try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
  }
  return json(settings);
}
