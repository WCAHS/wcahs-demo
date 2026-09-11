import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience } from './_helpers.js';

// Residents of these four communities are eligible. Anything else still
// submits — staff decide — but the form warns before they send it.
const ELIGIBLE_CITIES = ['Elysian', 'Janesville', 'Waseca', 'Waterville'];

const CLINIC = {
  name: 'MNSNAP Spay & Neuter Clinic',
  date: 'Sunday, October 4, 2026',
  time: '8:00 AM – 4:00 PM',
  address: '20547 490th St, Waterville, MN 56096',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  if (!body.turnstile_token) return error('CAPTCHA required');
  const valid = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!valid) return error('CAPTCHA verification failed', 403);

  if (!body.owner_name || !body.email || !body.phone) {
    return error('Name, email, and phone are required');
  }
  if (!body.acknowledged_tnr) {
    return error('Please confirm this registration is not for trapped/TNR cats');
  }

  // Keep only pets with at least a species — blank rows from "add another pet"
  // would otherwise land in the roster MNSNAP receives.
  const pets = Array.isArray(body.pets)
    ? body.pets
        .filter(p => p && p.species)
        .map(p => ({
          name: String(p.name || '').trim().slice(0, 60),
          species: String(p.species || '').trim().slice(0, 10),
          sex: String(p.sex || '').trim().slice(0, 10),
          age: String(p.age || '').trim().slice(0, 30),
          weight: String(p.weight || '').trim().slice(0, 30),
          breed: String(p.breed || '').trim().slice(0, 80),
        }))
    : [];

  if (pets.length === 0) return error('Please add at least one pet');

  const result = await env.DB.prepare(
    `INSERT INTO clinic_registrations
       (event_id, owner_name, email, phone, address, city, zip, pets, pet_count, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.event_id || null,
    body.owner_name,
    body.email,
    body.phone,
    body.address || null,
    body.city || null,
    body.zip || null,
    JSON.stringify(pets),
    pets.length,
    body.notes || null
  ).run();

  const regId = result.meta?.last_row_id || '';
  const eligible = ELIGIBLE_CITIES.some(c => c.toLowerCase() === String(body.city || '').trim().toLowerCase());

  if (body.subscribe) {
    const nameParts = String(body.owner_name).split(' ');
    await addToAudience(env, {
      email: body.email,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    });
  }

  const petRows = pets.map(p => `<tr>
      <td style="padding:6px 12px;border-top:1px solid #eee">${esc(p.name) || '<em style="color:#aaa">unnamed</em>'}</td>
      <td style="padding:6px 12px;border-top:1px solid #eee">${esc(p.species)}</td>
      <td style="padding:6px 12px;border-top:1px solid #eee">${esc(p.sex)}</td>
      <td style="padding:6px 12px;border-top:1px solid #eee">${esc(p.age)}</td>
      <td style="padding:6px 12px;border-top:1px solid #eee">${esc(p.weight)}</td>
      <td style="padding:6px 12px;border-top:1px solid #eee">${esc(p.breed)}</td>
    </tr>`).join('');

  await sendNotification(env, {
    subject: `Clinic Registration: ${body.owner_name} — ${pets.length} pet${pets.length === 1 ? '' : 's'}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New Spay/Neuter Clinic Registration</h2>
      ${eligible ? '' : `<p style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:10px 14px;border-radius:8px;font-size:13px;margin:0 0 16px"><strong>Outside the four eligible communities.</strong> City given: ${esc(body.city) || '(none)'} — confirm eligibility before scheduling.</p>`}
      <table style="border-collapse:collapse;width:100%;max-width:560px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Name</td><td style="padding:8px 12px;font-weight:600">${esc(body.owner_name)}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px">Email</td><td style="padding:8px 12px"><a href="mailto:${esc(body.email)}">${esc(body.email)}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px">Phone</td><td style="padding:8px 12px"><a href="tel:${esc(body.phone)}">${esc(body.phone)}</a></td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Address</td><td style="padding:8px 12px">${esc(body.address)}<br>${esc(body.city)}${body.zip ? ', MN ' + esc(body.zip) : ''}</td></tr>
        ${body.notes ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Notes</td><td style="padding:8px 12px;white-space:pre-wrap">${esc(body.notes)}</td></tr>` : ''}
      </table>
      <h3 style="color:#5c6b4e;margin:24px 0 8px;font-size:15px">Pets (${pets.length})</h3>
      <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:13px">
        <tr style="background:#f9f9f6;text-align:left">
          <th style="padding:6px 12px;color:#888;font-weight:600">Name</th>
          <th style="padding:6px 12px;color:#888;font-weight:600">Species</th>
          <th style="padding:6px 12px;color:#888;font-weight:600">Sex</th>
          <th style="padding:6px 12px;color:#888;font-weight:600">Age</th>
          <th style="padding:6px 12px;color:#888;font-weight:600">Weight</th>
          <th style="padding:6px 12px;color:#888;font-weight:600">Breed/Color</th>
        </tr>
        ${petRows}
      </table>
      <div style="margin-top:24px;text-align:center"><a href="https://wcahs.org/admin/#clinic-reg-${regId}" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">View in Admin &rarr;</a></div>`,
  });

  // People need proof this went through — unlike the contact form, there is a
  // date they are counting on.
  await sendAutoReply(env, {
    to: body.email,
    subject: 'We received your spay/neuter clinic registration',
    bodyHtml: `<h2 style="color:#3b4434;margin:0 0 12px;font-family:Georgia,serif">Thanks, ${esc(String(body.owner_name).split(' ')[0])}!</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px">
        We've received your registration for the ${esc(CLINIC.name)} and have you down for
        <strong>${pets.length} pet${pets.length === 1 ? '' : 's'}</strong>.
        A WCAHS volunteer will contact you to confirm your appointment time and go over
        what to bring. <strong>Your spot isn't confirmed until we reach out</strong>, so
        please watch your phone and email.
      </p>
      <table style="border-collapse:collapse;width:100%;background:#f6f7f4;border-radius:10px">
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Date</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.date)}</td></tr>
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Time</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.time)}</td></tr>
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Location</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.address)}</td></tr>
      </table>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:20px 0 0">
        Please note this clinic is not for trapped (TNR) cats. If anything changes, or you
        have questions, just reply to this email or call us at (507) 201-7287.
      </p>`,
  });

  return json({ ok: true, message: "Registration received! We'll contact you to confirm your appointment time." });
}
