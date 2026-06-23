/**
 * ShelterLuv → D1 sync worker
 * Runs on a cron schedule, fetches publishable animals and stores in D1.
 * Photos are downloaded to R2 so the site doesn't depend on ShelterLuv CDN.
 */

const API_BASE = 'https://www.shelterluv.com/api/v1';

function formatAge(months) {
  if (!months || months < 0) return 'Unknown';
  if (months < 12) return months + ' mo';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? '1 yr' : years + ' yrs';
  return years + ' yr ' + rem + ' mo';
}

async function fetchAnimals(apiKey) {
  const all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${API_BASE}/animals?status_type=publishable&limit=${limit}&offset=${offset}`;
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, {
        headers: {
          'X-Api-Key': apiKey,
          'User-Agent': 'Mozilla/5.0 (compatible; WCAHS-Sync/2.0)',
          'Accept': 'application/json',
        },
        redirect: 'follow',
      });
      if (res.ok) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
    if (!res.ok) throw new Error(`ShelterLuv API error: ${res.status} after 3 attempts`);
    const data = await res.json();
    const animals = data.animals || [];
    if (animals.length === 0) break;
    all.push(...animals);
    if (animals.length < limit) break;
    offset += limit;
  }

  return all;
}

async function downloadPhoto(url, animalId, bucket) {
  if (!url) return '';

  // Generate stable key from URL
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12);
  const ext = url.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const key = `pets/${animalId}_${hashHex}.${ext}`;

  // Check if already exists in R2
  const existing = await bucket.head(key);
  if (existing) return `/api/images/${key}`;

  // Download and store
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'WCAHS-Sync/2.0' } });
    if (!res.ok) return url; // fallback to remote URL
    const contentType = res.headers.get('content-type') || (ext === 'png' ? 'image/png' : 'image/jpeg');
    await bucket.put(key, res.body, { httpMetadata: { contentType } });
    return `/api/images/${key}`;
  } catch (e) {
    return url; // fallback to remote URL on error
  }
}

function processAnimal(raw, photos) {
  const attributes = (raw.Attributes || [])
    .filter(a => a.Publish === 'Yes')
    .map(a => a.AttributeName);

  const feeGroup = raw.AdoptionFeeGroup || {};
  const microchips = raw.Microchips || [];

  return {
    id: raw['Internal-ID'],
    shelterluv_id: raw.ID || '',
    name: raw.Name || '',
    type: raw.Type || '',
    breed: raw.Breed || '',
    sex: raw.Sex || '',
    age: raw.Age || 0,
    age_display: formatAge(raw.Age || 0),
    size: raw.Size || '',
    weight: raw.CurrentWeightPounds || '',
    color: raw.Color || '',
    altered: raw.Altered || '',
    microchipped: microchips.length > 0 ? 1 : 0,
    description: raw.Description || '',
    cover_photo: photos.cover,
    photos: JSON.stringify(photos.all),
    attributes: JSON.stringify(attributes),
    adoption_fee: feeGroup.Price != null ? feeGroup.Price : null,
    adoption_fee_name: feeGroup.Name || '',
    in_foster: raw.InFoster ? 1 : 0,
    status: raw.Status || '',
  };
}

export default {
  async scheduled(event, env, ctx) {
    const apiKey = env.SHELTERLUV_API_KEY;
    if (!apiKey) {
      console.error('SHELTERLUV_API_KEY not configured');
      return;
    }

    try {
      const rawAnimals = await fetchAnimals(apiKey);
      console.log(`Fetched ${rawAnimals.length} publishable animals`);

      // Process each animal — download photos to R2
      const processed = [];
      for (const raw of rawAnimals) {
        const cover = raw.CoverPhoto || '';
        const photosRaw = raw.Photos || [];

        let coverLocal = '';
        let photosLocal = [];

        if (env.UPLOADS) {
          coverLocal = await downloadPhoto(cover, raw['Internal-ID'], env.UPLOADS);
          photosLocal = [];
          for (const p of photosRaw) {
            photosLocal.push(await downloadPhoto(p, raw['Internal-ID'], env.UPLOADS));
          }
          if (coverLocal && !photosLocal.includes(coverLocal)) {
            photosLocal.unshift(coverLocal);
          }
        } else {
          // No R2 — use remote URLs
          coverLocal = cover;
          photosLocal = photosRaw;
        }

        processed.push(processAnimal(raw, { cover: coverLocal, all: photosLocal }));
      }

      // Clear old animals and insert new ones
      await env.DB.prepare('DELETE FROM animals').run();

      if (processed.length > 0) {
        const stmt = env.DB.prepare(
          `INSERT INTO animals (id, shelterluv_id, name, type, breed, sex, age, age_display, size, weight, color, altered, microchipped, description, cover_photo, photos, attributes, adoption_fee, adoption_fee_name, in_foster, status, last_updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );

        // D1 batch max is 100 statements
        const batch = processed.map(a => stmt.bind(
          a.id, a.shelterluv_id, a.name, a.type, a.breed, a.sex, a.age, a.age_display,
          a.size, a.weight, a.color, a.altered, a.microchipped, a.description,
          a.cover_photo, a.photos, a.attributes, a.adoption_fee, a.adoption_fee_name,
          a.in_foster, a.status
        ));
        await env.DB.batch(batch);
      }

      // Log the sync
      await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (?, ?)')
        .bind(processed.length, 'success').run();

      console.log(`Sync complete: ${processed.length} animals stored in D1`);
    } catch (e) {
      console.error('Sync failed:', e.message);
      await env.DB.prepare('INSERT INTO sync_log (animal_count, status) VALUES (?, ?)')
        .bind(0, 'error: ' + e.message).run();
    }
  },

  // Also handle HTTP requests for manual trigger
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger' && request.method === 'POST') {
      // Manual sync trigger (could add auth here)
      await this.scheduled({}, env, {});
      return new Response(JSON.stringify({ ok: true, message: 'Sync triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('ShelterLuv sync worker', { status: 200 });
  },
};
