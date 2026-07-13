import { json, error } from '../_helpers.js';

const API_BASE = 'https://new.shelterluv.com/api/v1';

function formatAge(months) {
  if (!months || months < 0) return 'Unknown';
  if (months < 12) return months + ' mo';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? '1 yr' : years + ' yrs';
  return years + ' yr ' + rem + ' mo';
}

function unixToISO(ts) {
  if (!ts) return null;
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  return isNaN(n) ? null : new Date(n * 1000).toISOString();
}

function extractFosterName(assoc) {
  if (!assoc) return '';
  const people = Array.isArray(assoc) ? assoc : [assoc];
  const foster = people.find(p => p && p.RelationshipType === 'foster');
  if (!foster) return '';
  return [foster.FirstName, foster.LastName].filter(Boolean).join(' ').trim();
}

async function fetchAllPages(url, key, listKey) {
  const results = [];
  let offset = 0;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}limit=100&offset=${offset}`, {
      headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' },
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = data[listKey] || [];
    results.push(...items);
    if (!data.has_more || items.length === 0) break;
    offset += items.length;
  }
  return results;
}

export async function onRequestPost(context) {
  const { env } = context;

  try {
    // Fetch all animals from ShelterLuv
    const animals = await fetchAllPages(`${API_BASE}/animals`, env.SHELTERLUV_API_KEY, 'animals');

    // Save hidden IDs before clearing
    const { results: hiddenRows } = await env.DB.prepare(
      'SELECT id FROM animals WHERE hidden = 1'
    ).all();
    const hiddenIds = new Set((hiddenRows || []).map(r => r.id));

    // Clear synced animals only (preserve manual pets)
    await env.DB.prepare('DELETE FROM animals WHERE is_manual = 0 OR is_manual IS NULL').run();

    if (animals.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO animals (id, shelterluv_id, name, type, breed, sex, age, age_display, size, weight, color, pattern, altered, microchipped, description, cover_photo, photos, videos, attributes, adoption_fee, adoption_fee_name, in_foster, foster_name, status, dob, campus, location, location_tier2, litter_group_id, intake_date, last_sl_update, last_updated, hidden, is_manual)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,0)`
      );

      const batch = animals.map(raw => {
        const attrs = (raw.Attributes || []).filter(a => a.Publish === 'Yes').map(a => a.AttributeName);
        const fee = raw.AdoptionFeeGroup || {};
        const micros = raw.Microchips || [];
        const loc = raw.CurrentLocation || {};
        const id = raw['Internal-ID'];

        return stmt.bind(
          id,
          raw.ID || '',
          raw.Name || '',
          raw.Type || '',
          raw.Breed || '',
          raw.Sex || '',
          raw.Age || 0,
          formatAge(raw.Age || 0),
          raw.Size || '',
          raw.CurrentWeightPounds || '',
          raw.Color || '',
          raw.Pattern || '',
          raw.Altered || '',
          micros.length > 0 ? 1 : 0,
          raw.Description || '',
          raw.CoverPhoto || '',
          JSON.stringify(raw.Photos || []),
          JSON.stringify(raw.Videos || []),
          JSON.stringify(attrs),
          fee.Price != null ? fee.Price : null,
          fee.Name || '',
          raw.InFoster ? 1 : 0,
          extractFosterName(raw.AssociatedPerson),
          raw.Status || '',
          unixToISO(raw.DOBUnixTime),
          raw.Campus || '',
          loc.Tier1 || '',
          loc.Tier2 || '',
          raw.LitterGroupId != null ? String(raw.LitterGroupId) : '',
          unixToISO(raw.LastIntakeUnixTime),
          unixToISO(raw.LastUpdatedUnixTime),
          hiddenIds.has(id) ? 1 : 0
        );
      });
      await env.DB.batch(batch);
    }

    // Sync events for each animal
    await env.DB.prepare('DELETE FROM animal_events').run();
    const eventBatches = [];
    const evtStmt = env.DB.prepare(
      `INSERT INTO animal_events (animal_id, event_type, event_subtype, event_time, user, associated_records, jurisdiction)
       VALUES (?,?,?,?,?,?,?)`
    );
    for (const animal of animals) {
      const id = animal['Internal-ID'];
      const events = await fetchAllPages(`${API_BASE}/animals/${id}/events`, env.SHELTERLUV_API_KEY, 'events');
      for (const evt of events) {
        eventBatches.push(evtStmt.bind(
          id,
          evt.Type || '',
          evt.Subtype || '',
          unixToISO(evt.Time),
          evt.User || '',
          JSON.stringify(evt.AssociatedRecords || []),
          evt.Jurisdiction ? JSON.stringify(evt.Jurisdiction) : ''
        ));
      }
    }
    if (eventBatches.length > 0) {
      // D1 batch limit is 500 statements
      for (let i = 0; i < eventBatches.length; i += 500) {
        await env.DB.batch(eventBatches.slice(i, i + 500));
      }
    }

    await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (?, ?)')
      .bind(animals.length, 'success').run();

    return json({ ok: true, count: animals.length, events: eventBatches.length });
  } catch (e) {
    await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (0, ?)')
      .bind('error: ' + e.message).run();
    return error(e.message);
  }
}
