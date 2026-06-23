import { json, error, verifyTurnstile } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, type, pet_name, species, breed, color, gender, location_details,
            description, photo_url, created_at
     FROM lost_found_reports WHERE status = 'approved'
     ORDER BY created_at DESC`
  ).all();
  return json(results);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  // Verify turnstile
  if (!body.turnstile_token) return error('CAPTCHA required');
  const valid = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!valid) return error('CAPTCHA verification failed', 403);

  if (!body.reporter_name || !body.species || !body.type) {
    return error('Name, species, and report type are required');
  }

  // Store photo URLs as JSON array if multiple, or single string
  const photoUrl = body.photo_urls ? JSON.stringify(body.photo_urls) : (body.photo_url || null);

  await env.DB.prepare(
    `INSERT INTO lost_found_reports (type, reporter_name, reporter_phone, reporter_email,
      pet_name, species, breed, color, gender, location_details, description, photo_url,
      collar_details, temperament, current_location, collar_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.type, body.reporter_name, body.reporter_phone || null, body.reporter_email || null,
    body.pet_name || null, body.species, body.breed || null, body.color || null,
    body.gender || null, body.location_details || null, body.description || null,
    photoUrl, body.collar_details || null, body.temperament || null,
    body.current_location || null, body.collar_status || null
  ).run();

  return json({ ok: true, message: 'Report submitted. It will appear after review.' });
}
