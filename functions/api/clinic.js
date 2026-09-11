import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience } from './_helpers.js';

// Residents of these four communities are what WCAHS sponsored the clinic for.
// Anything else still submits — staff decide case by case — but it is sorted
// into Ineligible for review rather than taking a spot automatically.
const ELIGIBLE_CITIES = ['Elysian', 'Janesville', 'Waseca', 'Waterville'];

const DEFAULT_CAPS = { cats: 25, dogs: 25 };

// Statuses that hold a surgery slot. Overflow, ineligible and cancelled do not.
const HOLDS_SPOT = ['applied', 'approved'];

const CLINIC = {
  name: 'MNSNAP Spay & Neuter Clinic',
  date: 'Sunday, October 4, 2026',
  time: '8:00 AM – 4:00 PM',
  address: '20547 490th St, Waterville, MN 56096',
};

function ageLabel(p) {
  const y = p.age_years, m = p.age_months;
  const parts = [];
  if (y !== '' && y != null) parts.push(`${y}y`);
  if (m !== '' && m != null) parts.push(`${m}m`);
  return parts.join(' ');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getCapacity(db) {
  const { results } = await db.prepare(
    `SELECT key, value FROM site_settings WHERE key IN ('clinic_cap_cats','clinic_cap_dogs')`
  ).all();
  const caps = { ...DEFAULT_CAPS };
  for (const row of results || []) {
    const n = parseInt(row.value, 10);
    if (!isNaN(n) && n >= 0) {
      if (row.key === 'clinic_cap_cats') caps.cats = n;
      if (row.key === 'clinic_cap_dogs') caps.dogs = n;
    }
  }

  const used = await db.prepare(
    `SELECT COALESCE(SUM(cat_count), 0) AS cats, COALESCE(SUM(dog_count), 0) AS dogs
     FROM clinic_registrations
     WHERE status IN (${HOLDS_SPOT.map(() => '?').join(',')})`
  ).bind(...HOLDS_SPOT).first();

  return {
    caps,
    used: { cats: used?.cats || 0, dogs: used?.dogs || 0 },
  };
}

// Public capacity read — no personal data, just whether spots remain. The page
// uses it to show the "applications are full" notice while still accepting.
export async function onRequestGet(context) {
  const { caps, used } = await getCapacity(context.env.DB);
  return json({
    cats: { cap: caps.cats, used: used.cats, full: used.cats >= caps.cats },
    dogs: { cap: caps.dogs, used: used.dogs, full: used.dogs >= caps.dogs },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  if (!body.turnstile_token) return error('CAPTCHA required');
  const valid = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!valid) return error('CAPTCHA verification failed', 403);

  if (!body.owner_first || !body.owner_last || !body.email || !body.phone_cell) {
    return error('First name, last name, email, and cell phone are required');
  }
  if (!body.acknowledged_household) {
    return error('Please confirm these are your own household pets');
  }

  const ownerFirst = String(body.owner_first).trim().slice(0, 60);
  const ownerLast = String(body.owner_last).trim().slice(0, 60);
  const ownerName = `${ownerFirst} ${ownerLast}`.trim();

  // Keep only pets with a species — blank rows from "add another pet" would
  // otherwise land in the roster MNSNAP receives.
  const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  // Ages and weights go onto MNSNAP's sheet as numbers, so coerce here rather
  // than letting "about 2" through to a spreadsheet cell.
  const num = (v, max) => {
    const n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) || n < 0 || n > max ? '' : n;
  };

  const pets = Array.isArray(body.pets)
    ? body.pets
        .filter(p => p && p.species)
        .map(p => ({
          name: clean(p.name, 60),
          species: clean(p.species, 10),
          sex: clean(p.sex, 10),
          breed: clean(p.breed, 80),
          color1: clean(p.color1, 40),
          color2: clean(p.color2, 40),
          age_years: num(p.age_years, 40),
          age_months: num(p.age_months, 11),
          weight: num(p.weight, 300),
          shots: clean(p.shots, 20),
          health: clean(p.health, 500),
          services: Array.isArray(p.services)
            ? p.services.slice(0, 12).map(x => clean(x, 60))
            : [],
        }))
    : [];

  if (pets.length === 0) return error('Please add at least one pet');

  const catCount = pets.filter(p => p.species.toLowerCase() === 'cat').length;
  const dogCount = pets.filter(p => p.species.toLowerCase() === 'dog').length;
  const city = String(body.city || '').trim();
  const cityEligible = ELIGIBLE_CITIES.some(c => c.toLowerCase() === city.toLowerCase());

  // ── Triage ───────────────────────────────────────────────────────────────
  // Ineligible is a sorting bin, never a rejection: staff approve these case by
  // case, which is why the form asks people to explain their situation.
  let status = 'applied';
  const reasons = [];

  if (pets.length === 1) reasons.push('Only one animal in the household');
  if (!cityEligible) reasons.push(`Outside the sponsored communities (${city || 'no city given'})`);

  const { caps, used } = await getCapacity(env.DB);

  if (reasons.length > 0) {
    status = 'ineligible';
  } else {
    // A spot has to exist for every animal on the application, or the whole
    // application goes to overflow — one application, one status.
    const catsWontFit = catCount > 0 && used.cats + catCount > caps.cats;
    const dogsWontFit = dogCount > 0 && used.dogs + dogCount > caps.dogs;
    if (catsWontFit || dogsWontFit) {
      status = 'overflow';
      if (catsWontFit) reasons.push(`Cat spots full (${used.cats}/${caps.cats})`);
      if (dogsWontFit) reasons.push(`Dog spots full (${used.dogs}/${caps.dogs})`);
    }
  }

  const autoReason = reasons.length ? reasons.join('; ') : null;

  const result = await env.DB.prepare(
    `INSERT INTO clinic_registrations
       (event_id, owner_first, owner_last, owner_name, email, phone_cell, phone_home,
        address, city, state, zip,
        pets, pet_count, cat_count, dog_count, hardship, notes, status, auto_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.event_id || null,
    ownerFirst,
    ownerLast,
    ownerName,
    body.email,
    body.phone_cell,
    body.phone_home || null,
    body.address || null,
    city || null,
    body.state || 'MN',
    body.zip || null,
    JSON.stringify(pets),
    pets.length,
    catCount,
    dogCount,
    body.hardship || null,
    body.notes || null,
    status,
    autoReason
  ).run();

  const regId = result.meta?.last_row_id || '';

  if (body.subscribe) {
    await addToAudience(env, { email: body.email, firstName: ownerFirst, lastName: ownerLast });
  }

  const petRows = pets.map(p => `<tr>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(p.name) || '<em style="color:#aaa">unnamed</em>'}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(p.species)}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(p.sex)}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(p.breed)}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc([p.color1, p.color2].filter(Boolean).join(' / '))}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(ageLabel(p))}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(p.weight)}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc(p.shots)}</td>
      <td style="padding:6px 10px;border-top:1px solid #eee">${esc((p.services || []).join(', '))}</td>
    </tr>`).join('');

  const statusBanner = {
    applied:    { bg: '#e8ebe3', border: '#d2d8c8', fg: '#3b4434', text: 'Sorted into <strong>Applied</strong> — spots are available.' },
    overflow:   { bg: '#fef3c7', border: '#fde68a', fg: '#92400e', text: 'Sorted into <strong>Overflow</strong> — the clinic is full for this species. Contact if a spot opens.' },
    ineligible: { bg: '#fef3c7', border: '#fde68a', fg: '#92400e', text: 'Sorted into <strong>Ineligible</strong> — needs a case-by-case decision.' },
  }[status];

  await sendNotification(env, {
    subject: `Clinic ${status === 'applied' ? 'Registration' : status === 'overflow' ? 'Registration (OVERFLOW)' : 'Registration (NEEDS REVIEW)'}: ${ownerName} — ${pets.length} pet${pets.length === 1 ? '' : 's'}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New Spay/Neuter Clinic Registration</h2>
      <p style="background:${statusBanner.bg};border:1px solid ${statusBanner.border};color:${statusBanner.fg};padding:10px 14px;border-radius:8px;font-size:13px;margin:0 0 16px">
        ${statusBanner.text}${autoReason ? `<br><span style="opacity:.85">${esc(autoReason)}</span>` : ''}
      </p>
      <table style="border-collapse:collapse;width:100%;max-width:620px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Name</td><td style="padding:8px 12px;font-weight:600">${esc(ownerName)}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px">Email</td><td style="padding:8px 12px"><a href="mailto:${esc(body.email)}">${esc(body.email)}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px">Phone</td><td style="padding:8px 12px"><a href="tel:${esc(body.phone_cell)}">${esc(body.phone_cell)}</a> (cell)${body.phone_home ? `<br><a href="tel:${esc(body.phone_home)}">${esc(body.phone_home)}</a> (home)` : ''}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Address</td><td style="padding:8px 12px">${esc(body.address)}<br>${esc(city)}, ${esc(body.state || 'MN')} ${esc(body.zip)}</td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px">Animals</td><td style="padding:8px 12px">${catCount} cat${catCount === 1 ? '' : 's'}, ${dogCount} dog${dogCount === 1 ? '' : 's'}</td></tr>
        ${body.hardship ? `<tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Their situation</td><td style="padding:8px 12px;white-space:pre-wrap">${esc(body.hardship)}</td></tr>` : ''}
        ${body.notes ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Notes</td><td style="padding:8px 12px;white-space:pre-wrap">${esc(body.notes)}</td></tr>` : ''}
      </table>
      <h3 style="color:#5c6b4e;margin:24px 0 8px;font-size:15px">Pets (${pets.length})</h3>
      <table style="border-collapse:collapse;width:100%;max-width:620px;font-size:12px">
        <tr style="background:#f9f9f6;text-align:left">
          <th style="padding:6px 10px;color:#888">Name</th><th style="padding:6px 10px;color:#888">Species</th>
          <th style="padding:6px 10px;color:#888">Sex</th><th style="padding:6px 10px;color:#888">Breed</th>
          <th style="padding:6px 10px;color:#888">Color</th>
          <th style="padding:6px 10px;color:#888">Age</th><th style="padding:6px 10px;color:#888">Weight</th>
          <th style="padding:6px 10px;color:#888">Shots</th><th style="padding:6px 10px;color:#888">Services</th>
        </tr>
        ${petRows}
      </table>
      <div style="margin-top:24px;text-align:center"><a href="https://wcahs.org/admin/#clinic-reg-${regId}" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">View in Admin &rarr;</a></div>`,
  });

  // People are counting on a date, so they get proof it went through. The
  // wording never promises a spot — staff confirm every one by phone.
  const waitNote = status === 'applied'
    ? `A WCAHS volunteer will contact you to confirm your appointment time and go over what to bring.`
    : status === 'overflow'
      ? `The clinic is currently full, so you're on our waiting list. If someone cancels or can't make it, we'll call you — this does happen, so please keep an eye on your phone.`
      : `Because of how your application came in, a WCAHS volunteer will review it personally before we schedule. We look at every application individually, so please don't assume this is a no.`;

  await sendAutoReply(env, {
    to: body.email,
    subject: 'We received your spay/neuter clinic registration',
    bodyHtml: `<h2 style="color:#3b4434;margin:0 0 12px;font-family:Georgia,serif">Thanks, ${esc(ownerFirst)}!</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px">
        We've received your registration for the ${esc(CLINIC.name)} and have you down for
        <strong>${pets.length} pet${pets.length === 1 ? '' : 's'}</strong>.
        ${waitNote} <strong>Your spot isn't confirmed until we reach out</strong>, so please
        watch your phone and email.
      </p>
      <table style="border-collapse:collapse;width:100%;background:#f6f7f4;border-radius:10px">
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Date</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.date)}</td></tr>
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Time</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.time)}</td></tr>
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Location</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.address)}</td></tr>
      </table>
      <p style="color:#777;font-size:13px;line-height:1.7;margin:20px 0 0">
        This clinic is for pets living in your home &mdash; not trapped (TNR) or community cats.
        If anything changes, or you have questions, just reply to this email or call us at (507) 201-7287.
      </p>`,
  });

  return json({
    ok: true,
    status,
    message: status === 'overflow'
      ? "Application received. The clinic is full right now, so you're on our waiting list — we'll call you if a spot opens."
      : status === 'ineligible'
        ? "Application received. A WCAHS volunteer will review it personally and get back to you."
        : "Registration received! We'll contact you to confirm your appointment time.",
  });
}
