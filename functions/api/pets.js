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

    // Foster-contributed content. Testimonials are the public voice of the foster;
    // their photos are appended to the ShelterLuv gallery so adopters see the pet
    // at home, not just in a kennel. Both are live the moment the foster saves.
    try {
      const { results: fu } = await context.env.DB.prepare(
        `SELECT fu.id, fu.update_type, fu.content, fu.photo_url, fu.created_at, u.name AS foster_name
           FROM foster_updates fu
           LEFT JOIN users u ON u.id = fu.user_id
          WHERE fu.animal_id = ?
          ORDER BY fu.created_at DESC`
      ).bind(id).all();

      const rows = fu || [];
      const testimonials = rows.filter(r => r.update_type === 'testimonial' && (r.content || '').trim());

      parsed.foster_testimonials = testimonials.map(r => ({
        id: r.id, content: r.content, by: r.foster_name || null, created_at: r.created_at
      }));
      // Back-compat with the note section on the pet page.
      parsed.foster_note = testimonials.length ? testimonials[0].content : null;
      parsed.foster_note_by = testimonials.length ? (testimonials[0].foster_name || null) : null;

      const fosterPhotos = rows.map(r => r.photo_url).filter(Boolean);
      if (fosterPhotos.length) {
        const seen = new Set(parsed.photos || []);
        parsed.foster_photos = fosterPhotos.filter(u => !seen.has(u));
        parsed.photos = (parsed.photos || []).concat(parsed.foster_photos);
      } else {
        parsed.foster_photos = [];
      }
    } catch (e) {
      parsed.foster_testimonials = []; parsed.foster_photos = [];
      parsed.foster_note = null; parsed.foster_note_by = null;
    }


    // Bonded partner — ShelterLuv only says THAT a pet is bonded, staff record who with.
    try {
      const bp = await context.env.DB.prepare(
        `SELECT a.id, a.name, a.cover_photo, a.age_display, a.sex, a.breed, a.status, a.hidden
           FROM bonded_pairs bp JOIN animals a ON a.id = bp.partner_id
          WHERE bp.animal_id = ?`
      ).bind(id).first();
      parsed.bonded_partner = (bp && bp.hidden !== 1 && !INACTIVE_STATUSES.includes(bp.status)) ? bp : null;
    } catch (e) { parsed.bonded_partner = null; }

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
