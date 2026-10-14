import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience, cleanLFPlace, publicLFPlace, notificationReplyTo } from './_helpers.js';

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
            description, photo_url, created_at, seen_date, address, lat, lng
     FROM lost_found_reports WHERE status = 'approved'
     AND created_at > datetime('now', '-30 days')
     ORDER BY created_at DESC`
  ).all();
  return json(results.map(publicLFPlace));
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

  const place = cleanLFPlace(body);
  const result = await env.DB.prepare(
    `INSERT INTO lost_found_reports (type, reporter_name, reporter_phone, reporter_email,
      pet_name, species, breed, color, gender, location_details, description, photo_url,
      collar_details, temperament, current_location, collar_status, seen_date, address, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.type, body.reporter_name, body.reporter_phone || null, body.reporter_email || null,
    body.pet_name || null, body.species, body.breed || null, body.color || null,
    body.gender || null, body.location_details || null, body.description || null,
    photoUrl, body.collar_details || null, body.temperament || null,
    body.current_location || null, body.collar_status || null,
    place.seen_date, place.address, place.lat, place.lng
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
  // Everything in this table came from a stranger's browser — escape all of it.
  const row = (label, value, shade) => value ? `<tr${shade ? ' style="background:#f9f9f6"' : ''}><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">${label}</td><td style="padding:8px 12px">${h(value)}</td></tr>` : '';
  const seenLabel = body.type === 'lost' ? 'Last seen' : 'Found';
  const seenDate = place.seen_date
    ? new Date(place.seen_date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : '';
  const mapLink = place.lat != null
    ? ` <a href="https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}" style="color:#48543e">map</a>` : '';
  await sendNotification(env, {
    type: 'lost_found',
    replyTo: await notificationReplyTo(env, 'lf', reportId, body.reporter_email),
    subject: `New ${typeLabel} Report — ${body.pet_name || body.species}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New ${typeLabel} Report</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        ${row('Type', typeLabel)}
        ${row('Species', body.species, true)}
        ${row('Pet Name', body.pet_name)}
        ${row('Breed', body.breed, true)}
        ${row(seenLabel + ' on', seenDate)}
        ${place.address ? `<tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">${seenLabel} at</td><td style="padding:8px 12px">${h(place.address)}${mapLink}</td></tr>` : ''}
        ${row('Details', body.location_details)}
        ${row('Reporter', body.reporter_name + (body.reporter_email ? ' <' + body.reporter_email + '>' : ''), true)}
      </table>
      <div style="margin-top:24px;text-align:center"><a href="https://wcahs.org/admin/#inbox-lf-${reportId}" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Open this report &rarr;</a></div>
      <p style="margin:14px 0 0;text-align:center;color:#888;font-size:12px">It's waiting under <b>Lost &amp; Found &rsaquo; Needs review</b> in the admin. Approving it puts it on the website. There's nothing to reply to here.</p>`,
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
