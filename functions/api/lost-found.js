import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience } from './_helpers.js';

// Reporter-supplied text goes into an HTML email. There's no DOM out here, so
// escape it by hand rather than trusting a name field not to contain a tag.
function h(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

  const result = await env.DB.prepare(
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

  const reportId = result.meta?.last_row_id || '';

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
    type: 'lost_found',
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
      <div style="margin-top:24px;text-align:center"><a href="https://wcahs.org/admin/#inbox-lf-${reportId}" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Open this report &rarr;</a></div>`,
  });

  // Every report used to vanish into the inbox without a word back, which left
  // the reporter with nothing to go on and the shelter answering the same "did
  // you get this?" by hand. This fires once, here, for a report that was just
  // created — there is no path that replays it over an existing row.
  if (body.reporter_email) {
    const isLost = body.type === 'lost';
    await sendAutoReply(env, {
      to: body.reporter_email,
      subject: isLost
        ? 'We got your lost pet report — WCAHS'
        : 'Thank you for reporting a found pet — WCAHS',
      bodyHtml: `
        <h2 style="color:#5c6b4e;margin:0 0 16px;font-family:Georgia,serif">Thank you, ${h(body.reporter_name)}</h2>
        <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
          We've received your report about ${isLost ? 'your missing' : 'the'}
          ${h(String(body.species || 'pet').toLowerCase())}${body.pet_name ? ', ' + h(body.pet_name) + ',' : ''}
          and a volunteer will review it shortly. Once it's approved it goes up on our
          public <a href="https://wcahs.org/lost-found" style="color:#5c6b4e">Lost &amp; Found page</a>.
        </p>
        <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
          <strong>Please note:</strong> we're a volunteer-run shelter, so reviews aren't instant.
          ${isLost
            ? 'In the meantime, the first 24 hours matter most &mdash; search your own property thoroughly, and post to the local Facebook lost-pet groups listed on our page.'
            : 'In the meantime, please keep the animal safe where it is if you can, and check it for a collar or tag. Our page explains how to get a free microchip scan.'}
        </p>
        <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">
          If this is urgent &mdash; an injured animal, or a pet in immediate danger &mdash; please don't wait
          on this email. Call us at <a href="tel:5072017287" style="color:#5c6b4e">(507) 201-7287</a>.
        </p>
        <p style="color:#888;font-size:13px;line-height:1.6;margin:24px 0 0">
          You don't need to reply to this message &mdash; but if you have more details or a photo to add,
          replying is the easiest way to send them along.
        </p>`,
    });
  }

  return json({ ok: true, message: 'Report submitted. It will appear after review.' });
}
