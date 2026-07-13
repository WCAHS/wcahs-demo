import { json } from './_helpers.js';

// Statuses that should NOT appear on the public site
const INACTIVE_STATUSES = ['Deceased', 'On Hold In-Shelter', 'On Hold In-Foster', 'Adopted', 'Transferred', 'Reclaimed'];

function parseAnimal(a) {
  return {
    ...a,
    photos: JSON.parse(a.photos || '[]'),
    videos: JSON.parse(a.videos || '[]'),
    attributes: JSON.parse(a.attributes || '[]'),
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const animal = await context.env.DB.prepare('SELECT * FROM animals WHERE id = ?').bind(id).first();
    if (!animal) return json({ error: 'Animal not found' }, 404);
    // Don't show hidden or inactive pets publicly (unless manual)
    if (animal.hidden === 1) return json({ error: 'Animal not found' }, 404);
    if (!animal.is_manual && INACTIVE_STATUSES.includes(animal.status)) return json({ error: 'Animal not found' }, 404);

    const parsed = parseAnimal(animal);

    // Include events for this animal
    try {
      const { results: events } = await context.env.DB.prepare(
        'SELECT event_type, event_subtype, event_time FROM animal_events WHERE animal_id = ? ORDER BY event_time DESC'
      ).bind(id).all();
      parsed.events = events || [];
    } catch(e) { parsed.events = []; }

    // Include litter siblings if part of a litter group
    if (animal.litter_group_id) {
      try {
        const { results: siblings } = await context.env.DB.prepare(
          'SELECT id, name, type, breed, sex, age_display, cover_photo FROM animals WHERE litter_group_id = ? AND id != ? AND (hidden = 0 OR hidden IS NULL)'
        ).bind(animal.litter_group_id, id).all();
        parsed.siblings = (siblings || []).filter(s => !INACTIVE_STATUSES.includes(s.status));
      } catch(e) { parsed.siblings = []; }
    }

    return json(parsed);
  }

  // All visible animals: not hidden, and either manual or not inactive status
  const { results } = await context.env.DB.prepare('SELECT * FROM animals WHERE (hidden = 0 OR hidden IS NULL) ORDER BY name').all();
  const animals = results
    .filter(a => a.is_manual || !INACTIVE_STATUSES.includes(a.status))
    .map(parseAnimal);
  return json({ animals, count: animals.length });
}
