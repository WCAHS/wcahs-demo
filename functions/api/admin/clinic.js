import { json, error, CLINIC_DEFAULT_CLOSED_MESSAGE } from '../_helpers.js';

const HOLDS_SPOT = ['applied', 'approved'];

// Every event that has a form attached, newest first. This is the index the
// admin "Event Forms" tab renders: one card per event, with its own
// applications, capacity and open/closed switch.
export async function onRequestGet(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const eventId = url.searchParams.get('event_id');

  const { results: events } = await db.prepare(
    `SELECT id, title, date, time, location, published, form_key, form_open,
            form_closed_message, cap_cats, cap_dogs
     FROM events WHERE form_key IS NOT NULL AND form_key != ''
     ORDER BY date DESC`
  ).all();

  // Counts for every form event in one pass, so the index doesn't fan out into
  // a query per event.
  const { results: counts } = await db.prepare(
    `SELECT event_id, status, COUNT(*) AS n,
            COALESCE(SUM(cat_count), 0) AS cats, COALESCE(SUM(dog_count), 0) AS dogs
     FROM clinic_registrations GROUP BY event_id, status`
  ).all();

  const summary = {};
  for (const row of counts || []) {
    const key = row.event_id == null ? 'unassigned' : row.event_id;
    if (!summary[key]) summary[key] = { total: 0, by_status: {}, used: { cats: 0, dogs: 0 } };
    summary[key].total += row.n;
    summary[key].by_status[row.status] = row.n;
    if (HOLDS_SPOT.includes(row.status)) {
      summary[key].used.cats += row.cats;
      summary[key].used.dogs += row.dogs;
    }
  }

  // Applications are only loaded when an event is actually opened, so the index
  // stays cheap however many clinics pile up over the years.
  let registrations = null;
  if (eventId) {
    const { results } = await db.prepare(
      'SELECT * FROM clinic_registrations WHERE event_id = ? ORDER BY created_at DESC'
    ).bind(eventId).all();
    registrations = results || [];
  }

  return json({
    events: events || [],
    summary,
    registrations,
    default_closed_message: CLINIC_DEFAULT_CLOSED_MESSAGE,
  });
}

// Per-event form settings: the open/closed switch, its message, and capacity.
// Lives here rather than under /api/admin/events so staff — who can reach
// /api/admin/clinic but not site settings — can run their own clinic.
export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.event_id) return error('event_id is required');

  const sets = [];
  const vals = [];

  for (const [field, col] of [['cap_cats', 'cap_cats'], ['cap_dogs', 'cap_dogs']]) {
    if (body[field] === undefined) continue;
    const n = parseInt(body[field], 10);
    if (isNaN(n) || n < 0) return error('Capacity must be zero or a positive number');
    sets.push(`${col}=?`); vals.push(n);
  }
  if (body.open !== undefined) { sets.push('form_open=?'); vals.push(body.open ? 1 : 0); }
  if (body.closed_message !== undefined) {
    sets.push('form_closed_message=?'); vals.push(String(body.closed_message).slice(0, 500));
  }
  if (body.form_key !== undefined) {
    sets.push('form_key=?'); vals.push(body.form_key ? String(body.form_key).slice(0, 40) : null);
  }
  if (sets.length === 0) return error('Nothing to update');

  sets.push("updated_at=datetime('now')");
  vals.push(body.event_id);

  await context.env.DB.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id=?`).bind(...vals).run();
  return json({ ok: true });
}
