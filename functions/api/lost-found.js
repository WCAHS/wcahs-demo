import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience } from './_helpers.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT id, type, pet_name, species, breed, color, gender, location_details,
            description, photo_url, created_at
     FROM lost_found_reports WHERE status = 'approved'
     AND created_at > datetime('now', '-30 days')
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

  // Add to newsletter audience if opted in
  if (body.subscribe && body.reporter_email) {
    const nameParts = (body.reporter_name || '').split(' ');
    await addToAudience(env, {
      email: body.reporter_email,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    });
  }

  const typeLabel = body.type === 'lost' ? 'Lost Pet' : 'Found Pet';
  await sendNotification(env, {
    subject: `New ${typeLabel} Report — ${body.pet_name || body.species}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New ${typeLabel} Report</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Type</td><td style="padding:8px 12px;font-weight:600">${typeLabel}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Species</td><td style="padding:8px 12px">${body.species}</td></tr>
        ${body.pet_name ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Pet Name</td><td style="padding:8px 12px">${body.pet_name}</td></tr>` : ''}
        ${body.breed ? `<tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Breed</td><td style="padding:8px 12px">${body.breed}</td></tr>` : ''}
        ${body.location_details ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Location</td><td style="padding:8px 12px">${body.location_details}</td></tr>` : ''}
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Reporter</td><td style="padding:8px 12px">${body.reporter_name}${body.reporter_email ? ' &lt;' + body.reporter_email + '&gt;' : ''}</td></tr>
      </table>
      <div style="margin-top:24px;text-align:center"><a href="https://wcahs.org/admin/#inbox-lf" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Review in Admin &rarr;</a></div>`,
  });

  // Auto-reply to submitter disabled for now
  // if (body.reporter_email) { await sendAutoReply(env, { ... }); }

  return json({ ok: true, message: 'Report submitted. It will appear after review.' });
}
