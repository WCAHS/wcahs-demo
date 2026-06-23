import { json, error, verifyTurnstile, sendNotification, sendAutoReply } from './_helpers.js';

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
      <p style="margin-top:20px;font-size:12px;color:#999">Review this report at <a href="https://wcahs.org/admin/">wcahs.org/admin</a></p>`,
  });

  if (body.reporter_email) {
    const isLost = body.type === 'lost';
    await sendAutoReply(env, {
      to: body.reporter_email,
      subject: isLost ? 'We received your lost pet report' : 'We received your found pet report',
      bodyHtml: `<h2 style="color:#48543e;margin:0 0 16px;font-family:Georgia,serif">${isLost ? 'We\'re here to help find your pet' : 'Thank you for reporting a found pet'}!</h2>
        <p style="color:#666;font-size:15px;line-height:1.6">${isLost
          ? 'We received your lost pet report and it will be posted on our website after a quick review. We know this is a stressful time — hang in there!'
          : 'We received your found pet report and it will be posted on our website after a quick review. Thank you for looking out for this animal!'
        }</p>
        <h3 style="color:#48543e;font-size:15px;margin:24px 0 12px">${isLost ? 'Tips while searching' : 'What to do next'}</h3>
        <ul style="color:#666;font-size:14px;line-height:1.8;padding-left:20px">
          ${isLost
            ? '<li>Check our <a href="https://wcahs.org/lost-found.html" style="color:#5c6b4e;font-weight:700">Lost & Found page</a> for found pet reports</li><li>Post on local Facebook groups and Nextdoor</li><li>Contact local vets and shelters</li><li>Leave food and familiar items outside</li>'
            : '<li>Keep the pet safe and contained if possible</li><li>Check for a collar, tag, or microchip</li><li>Check our <a href="https://wcahs.org/lost-found.html" style="color:#5c6b4e;font-weight:700">Lost & Found page</a> for matching lost reports</li><li>Contact us at (507) 201-7287 if you need help</li>'
          }
        </ul>
        <p style="color:#999;font-size:13px;margin-top:24px">— The WCAHS Team</p>`,
    });
  }

  return json({ ok: true, message: 'Report submitted. It will appear after review.' });
}
