import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (id) {
    // Single animal (respect hidden flag for public API)
    const animal = await context.env.DB.prepare('SELECT * FROM animals WHERE id = ? AND (hidden = 0 OR hidden IS NULL)').bind(id).first();
    if (!animal) return json({ error: 'Animal not found' }, 404);
    // Parse JSON fields
    animal.photos = JSON.parse(animal.photos || '[]');
    animal.attributes = JSON.parse(animal.attributes || '[]');
    return json(animal);
  }

  // All animals (exclude hidden)
  const { results } = await context.env.DB.prepare('SELECT * FROM animals WHERE hidden = 0 OR hidden IS NULL ORDER BY name').all();
  const animals = results.map(a => ({
    ...a,
    photos: JSON.parse(a.photos || '[]'),
    attributes: JSON.parse(a.attributes || '[]'),
  }));
  return json({ animals, count: animals.length });
}
