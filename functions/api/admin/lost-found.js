import { json, error, cleanLFPlace, attachReplies } from '../_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM lost_found_reports ORDER BY created_at DESC'
  ).all();
  return json(await attachReplies(context.env, 'lf', results));
}

// Staff entering a report themselves — someone rings the shelter to say they've
// found a cat on their porch, and until now there was no way to get that onto
// the website at all short of filling in the public form on their behalf.
//
// Deliberately silent: no staff notification (they're the ones typing it) and no
// auto-reply (the "reporter" here is whoever called, who is on the phone already
// and never asked us to email them). The public POST in ../lost-found.js is the
// only path that sends anything.
export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const type = body.type === 'found' ? 'found' : body.type === 'lost' ? 'lost' : null;
  if (!type) return error('Choose whether this is a lost or a found pet');
  if (!body.species) return error('Species is required');
  // The public form gets a name from the browser; a phone-in has whoever took
  // the call. Falling back keeps NOT NULL satisfied without a silent empty row.
  const reporterName = (body.reporter_name || '').trim() || 'Added by shelter staff';

  // Staff are the reviewers, so what they enter is live unless they say otherwise.
  const status = body.status === 'pending' ? 'pending' : 'approved';

  const photoUrl = Array.isArray(body.photo_urls) && body.photo_urls.length
    ? JSON.stringify(body.photo_urls)
    : (body.photo_url || null);

  const place = cleanLFPlace(body);
  const result = await env.DB.prepare(
    `INSERT INTO lost_found_reports (type, status, reporter_name, reporter_phone, reporter_email,
      pet_name, species, breed, color, gender, location_details, description, photo_url,
      collar_details, temperament, current_location, collar_status, seen_date, address, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    type, status, reporterName, body.reporter_phone || null, body.reporter_email || null,
    body.pet_name || null, body.species, body.breed || null, body.color || null,
    body.gender || null, body.location_details || null, body.description || null,
    photoUrl, body.collar_details || null, body.temperament || null,
    body.current_location || null, body.collar_status || null,
    place.seen_date, place.address, place.lat, place.lng
  ).run();

  return json({ ok: true, id: result.meta?.last_row_id || null, status });
}
