import { json, error } from '../_helpers.js';

const API_BASE = 'https://www.shelterluv.com/api/v1';

function formatAge(months) {
  if (!months || months < 0) return 'Unknown';
  if (months < 12) return months + ' mo';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? '1 yr' : years + ' yrs';
  return years + ' yr ' + rem + ' mo';
}

export async function onRequestPost(context) {
  const { env } = context;

  try {
    // Fetch from ShelterLuv
    const res = await fetch(`${API_BASE}/animals?status_type=publishable&limit=100`, {
      headers: { 'X-Api-Key': env.SHELTERLUV_API_KEY, 'Accept': 'application/json' },
    });

    if (!res.ok) {
      await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (0, ?)')
        .bind('error: ShelterLuv ' + res.status).run();
      return error('ShelterLuv returned ' + res.status);
    }

    const data = await res.json();
    const animals = data.animals || [];

    // Clear synced animals only (preserve manual pets and their hidden flags)
    await env.DB.prepare('DELETE FROM animals WHERE is_manual = 0 OR is_manual IS NULL').run();

    if (animals.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO animals (id,shelterluv_id,name,type,breed,sex,age,age_display,size,weight,color,altered,microchipped,description,cover_photo,photos,attributes,adoption_fee,adoption_fee_name,in_foster,status,last_updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`
      );

      const batch = animals.map(raw => {
        const attrs = (raw.Attributes || []).filter(a => a.Publish === 'Yes').map(a => a.AttributeName);
        const fee = raw.AdoptionFeeGroup || {};
        const micros = raw.Microchips || [];
        return stmt.bind(
          raw['Internal-ID'], raw.ID || '', raw.Name || '', raw.Type || '', raw.Breed || '',
          raw.Sex || '', raw.Age || 0, formatAge(raw.Age || 0), raw.Size || '',
          raw.CurrentWeightPounds || '', raw.Color || '', raw.Altered || '',
          micros.length > 0 ? 1 : 0, raw.Description || '',
          raw.CoverPhoto || '', JSON.stringify(raw.Photos || []), JSON.stringify(attrs),
          fee.Price != null ? fee.Price : null, fee.Name || '',
          raw.InFoster ? 1 : 0, raw.Status || ''
        );
      });
      await env.DB.batch(batch);
    }

    await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (?, ?)')
      .bind(animals.length, 'success').run();

    return json({ ok: true, count: animals.length });
  } catch (e) {
    await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (0, ?)')
      .bind('error: ' + e.message).run();
    return error(e.message);
  }
}
