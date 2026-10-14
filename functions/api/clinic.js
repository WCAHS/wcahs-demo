import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience, CLINIC_FORM_STATES, CLINIC_NO_EVENT, notificationReplyTo } from './_helpers.js';

// Residents of these four communities are what WCAHS sponsored the clinic for.
// Anything else still submits — staff decide case by case — but it is sorted
// into Ineligible for review rather than taking a spot automatically.
const ELIGIBLE_CITIES = ['Elysian', 'Janesville', 'Waseca', 'Waterville'];

// Which applications hold a surgery slot: anything approved, plus applications
// still awaiting a decision that weren't waitlisted. Ineligible, cancelled and
// waitlisted ones do not — that's the whole point of the waitlist flag.
const HOLDS_SPOT_SQL = `(status = 'approved' OR (status = 'applied' AND waitlisted = 0))`;

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

// The clinic form belongs to an event, not to the site. "Which clinic is /snap
// collecting for right now" is answered by the soonest published, not-yet-past
// event carrying form_key='clinic' — so running another one next year means
// creating an event, not editing code.
async function getActiveClinicEvent(db) {
  return await db.prepare(
    `SELECT id, title, date, time, location, form_state, cap_cats, cap_dogs, notify_emails
     FROM events
     WHERE form_key = 'clinic' AND published = 1
       AND (end_date >= date('now') OR (end_date IS NULL AND date >= date('now')))
     ORDER BY date ASC
     LIMIT 1`
  ).first();
}

async function usedSpots(db, eventId) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(cat_count), 0) AS cats, COALESCE(SUM(dog_count), 0) AS dogs
     FROM clinic_registrations
     WHERE event_id = ? AND ${HOLDS_SPOT_SQL}`
  ).bind(eventId).first();
  return { cats: row?.cats || 0, dogs: row?.dogs || 0 };
}

// Public read — no personal data. Says which state the clinic form is in and
// whether spots remain, and carries the wording so the page never hardcodes a
// heading that could go stale (e.g. "not open YET" after the clinic happened).
export async function onRequestGet(context) {
  const db = context.env.DB;
  const ev = await getActiveClinicEvent(db);

  if (!ev) {
    return json({
      open: false,
      state: 'none',
      event: null,
      heading: CLINIC_NO_EVENT.heading,
      closed_message: CLINIC_NO_EVENT.message,
      cats: { cap: 0, used: 0, full: true },
      dogs: { cap: 0, used: 0, full: true },
    });
  }

  const state = CLINIC_FORM_STATES[ev.form_state] ? ev.form_state : 'closed';
  const open = state === 'open';
  const used = await usedSpots(db, ev.id);

  return json({
    open,
    state,
    event: { id: ev.id, title: ev.title, date: ev.date },
    heading: open ? null : CLINIC_FORM_STATES[state].heading,
    closed_message: open ? null : CLINIC_FORM_STATES[state].message,
    cats: { cap: ev.cap_cats, used: used.cats, full: used.cats >= ev.cap_cats },
    dogs: { cap: ev.cap_dogs, used: used.dogs, full: used.dogs >= ev.cap_dogs },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const ev = await getActiveClinicEvent(env.DB);
  if (!ev) {
    return error(CLINIC_NO_EVENT.message, 403);
  }
  const state = CLINIC_FORM_STATES[ev.form_state] ? ev.form_state : 'closed';
  if (state !== 'open') {
    return error(CLINIC_FORM_STATES[state].message, 403);
  }

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
  let waitlisted = 0;
  const reasons = [];

  if (pets.length === 1) reasons.push('Only one animal in the household');
  if (!cityEligible) reasons.push(`Outside the sponsored communities (${city || 'no city given'})`);

  const used = await usedSpots(env.DB, ev.id);
  const caps = { cats: ev.cap_cats, dogs: ev.cap_dogs };

  if (reasons.length > 0) {
    status = 'ineligible';
  } else {
    // A spot has to exist for every animal on the application, or the whole
    // application goes on the waiting list — one application, one outcome.
    const catsWontFit = catCount > 0 && used.cats + catCount > caps.cats;
    const dogsWontFit = dogCount > 0 && used.dogs + dogCount > caps.dogs;
    if (catsWontFit || dogsWontFit) {
      waitlisted = 1;
      if (catsWontFit) reasons.push(`Applied after cat spots filled (${used.cats}/${caps.cats})`);
      if (dogsWontFit) reasons.push(`Applied after dog spots filled (${used.dogs}/${caps.dogs})`);
    }
  }

  const autoReason = reasons.length ? reasons.join('; ') : null;

  const result = await env.DB.prepare(
    `INSERT INTO clinic_registrations
       (event_id, owner_first, owner_last, owner_name, email, phone_cell, phone_home,
        address, city, state, zip,
        pets, pet_count, cat_count, dog_count,
        reason, income_eligible, hardship, notes, status, waitlisted, auto_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ev.id,
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
    body.reason ? String(body.reason).slice(0, 1000) : null,
    ['yes', 'no', 'unsure'].includes(body.income_eligible) ? body.income_eligible : null,
    body.hardship ? String(body.hardship).slice(0, 1000) : null,
    body.notes || null,
    status,
    waitlisted,
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

  const statusBanner = status === 'ineligible'
    ? { bg: '#fef3c7', border: '#fde68a', fg: '#92400e', text: 'Sorted into <strong>Ineligible</strong> — needs a case-by-case decision.' }
    : waitlisted
      ? { bg: '#fef3c7', border: '#fde68a', fg: '#92400e', text: '<strong>Applied</strong>, but on the <strong>waiting list</strong> — the spots were already full. Contact if one opens.' }
      : { bg: '#e8ebe3', border: '#d2d8c8', fg: '#3b4434', text: 'Sorted into <strong>Applied</strong> — spots are available.' };

  // Recipients live on the event, so a clinic run by one volunteer doesn't have
  // to route every other form through them too. Falls back to site settings,
  // then to the shelter mailboxes.
  let clinicRecipients = null;
  try {
    if (ev.notify_emails) {
      const parsed = JSON.parse(ev.notify_emails);
      if (Array.isArray(parsed) && parsed.length) clinicRecipients = parsed;
    }
  } catch (e) {
    console.error('event notify_emails is not valid JSON:', e && e.message);
  }

  await sendNotification(env, {
    type: 'clinic',
    to: clinicRecipients,
    replyTo: await notificationReplyTo(env, 'clinic', regId, body.email),
    subject: `Clinic ${status === 'ineligible' ? 'Registration (NEEDS REVIEW)' : waitlisted ? 'Registration (WAITLIST)' : 'Registration'}: ${ownerName} — ${pets.length} pet${pets.length === 1 ? '' : 's'}`,
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
        ${body.reason ? `<tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Their situation</td><td style="padding:8px 12px;white-space:pre-wrap">${esc(body.reason)}</td></tr>` : ''}
        ${body.income_eligible ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px">Income guidelines</td><td style="padding:8px 12px">${({ yes: 'Meets them', no: 'Does not meet them', unsure: 'Not sure' })[body.income_eligible] || ''}</td></tr>` : ''}
        ${body.hardship ? `<tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">If spots run short</td><td style="padding:8px 12px;white-space:pre-wrap">${esc(body.hardship)}</td></tr>` : ''}
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
      <div style="margin-top:28px;text-align:center">
        <p style="color:#888;font-size:12px;margin:0 0 10px">These open the admin panel with this application already in view. Nothing changes until you confirm there.</p>
        <a href="https://wcahs.org/admin/#clinic-reg-${ev.id}-${regId}-approve" style="display:inline-block;background:#3f7a46;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;margin:0 4px 8px">Approve</a>
        <a href="https://wcahs.org/admin/#clinic-reg-${ev.id}-${regId}-ineligible" style="display:inline-block;background:#8a8a8a;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;margin:0 4px 8px">Needs review</a>
        <a href="https://wcahs.org/admin/#clinic-reg-${ev.id}-${regId}" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;margin:0 4px 8px">View</a>
      </div>`,
  });

  // People are counting on a date, so they get proof it went through. The
  // wording never promises a spot — staff confirm every one by phone.
  const waitNote = status === 'ineligible'
    ? `Because of how your application came in, a WCAHS volunteer will review it personally before we schedule. We look at every application individually, so please don't assume this is a no.`
    : waitlisted
      ? `The clinic is currently full, so you're on our waiting list. If someone cancels or can't make it, we'll call you — this does happen, so please keep an eye on your phone.`
      : `A WCAHS volunteer will contact you to confirm your appointment time and go over what to bring.`;

  await sendAutoReply(env, {
    to: body.email,
    subject: 'We received your spay/neuter clinic request',
    bodyHtml: `<h2 style="color:#3b4434;margin:0 0 12px;font-family:Georgia,serif">Thanks, ${esc(ownerFirst)}!</h2>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px">
        We've received your request for the ${esc(CLINIC.name)} and have you down for
        <strong>${pets.length} pet${pets.length === 1 ? '' : 's'}</strong>.
        ${waitNote} <strong>Your spot isn't confirmed until we reach out</strong>, so please
        watch your phone and email.
      </p>
      <table style="border-collapse:collapse;width:100%;background:#f6f7f4;border-radius:10px">
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Date</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.date)}</td></tr>
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Time</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">${esc(CLINIC.time)}</td></tr>
        <tr><td style="padding:10px 16px;color:#93a27e;font-size:12px;font-weight:700;text-transform:uppercase">Check-in</td><td style="padding:10px 16px;font-weight:600;color:#3b4434">Dogs 9:00 AM &bull; Cats 9:30 AM</td></tr>
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
    waitlisted: !!waitlisted,
    message: status === 'ineligible'
      ? "Application received. A WCAHS volunteer will review it personally and get back to you."
      : waitlisted
        ? "Application received. The clinic is full right now, so you're on our waiting list — we'll call you if a spot opens."
        : "Request received. We'll contact you to confirm your spot and appointment time.",
  });
}
