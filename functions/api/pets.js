import { json } from './_helpers.js';

// Statuses that should NOT appear on the public site
const INACTIVE_STATUSES = ['Deceased', 'On Hold In-Shelter', 'On Hold In-Foster', 'Adopted', 'Transferred', 'Reclaimed'];

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const animal = await context.env.DB.prepare('SELECT * FROM animals WHERE id = ?').bind(id).first();
    if (!animal) return json({ error: 'Animal not found' }, 404);
    // Don't show hidden or inactive pets publicly (unless manual)
    if (animal.hidden === 1) return json({ error: 'Animal not found' }, 404);
    if (!animal.is_manual && INACTIVE_STATUSES.includes(animal.status)) return json({ error: 'Animal not found' }, 404);
    animal.photos = JSON.parse(animal.photos || '[]');
    animal.attributes = JSON.parse(animal.attributes || '[]');
    return json(animal);
  }

  // All visible animals: not hidden, and either manual or not inactive status
  const { results } = await context.env.DB.prepare('SELECT * FROM animals WHERE (hidden = 0 OR hidden IS NULL) ORDER BY name').all();
  const animals = results
    .filter(a => a.is_manual || !INACTIVE_STATUSES.includes(a.status))
    .map(a => ({
      ...a,
      photos: JSON.parse(a.photos || '[]'),
      attributes: JSON.parse(a.attributes || '[]'),
    }));
  return json({ animals, count: animals.length });
}
