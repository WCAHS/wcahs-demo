import { json } from './_helpers.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (id) {
    // Single animal
    const animal = await context.env.DB.prepare('SELECT * FROM animals WHERE id = ?').bind(id).first();
    if (!animal) return json({ error: 'Animal not found' }, 404);
    // Parse JSON fields
    animal.photos = JSON.parse(animal.photos || '[]');
    animal.attributes = JSON.parse(animal.attributes || '[]');
    return json(animal);
  }

  // All animals
  const { results } = await context.env.DB.prepare('SELECT * FROM animals ORDER BY name').all();
  const animals = results.map(a => ({
    ...a,
    photos: JSON.parse(a.photos || '[]'),
    attributes: JSON.parse(a.attributes || '[]'),
  }));
  return json({ animals, count: animals.length });
}
