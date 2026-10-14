import { json } from './_helpers.js';

// Address type-ahead for the Lost & Found form. Searches our own copy of
// Minnesota's open address points (see migration 2026-10-14b), so what people
// type never leaves wcahs.org unless this comes back short and the page falls
// back to Photon. Every word typed must appear; "309 elm wa" finds
// "309 N Elm Ave, Waseca".
export async function onRequestGet(context) {
  const q = (new URL(context.request.url).searchParams.get('q') || '').toLowerCase().trim();
  const words = q.split(/[\s,]+/).filter(Boolean).slice(0, 5);
  if (q.length < 3 || !words.length) return json([]);
  // A leading house number anchors to the start, which is both what people
  // mean and much faster than a substring scan.
  const conds = [], binds = [];
  words.forEach((w, i) => {
    if (i === 0 && /^\d+[a-z]?$/.test(w)) { conds.push('search LIKE ?'); binds.push(w + ' %'); }
    else { conds.push('search LIKE ?'); binds.push('%' + w.replace(/[%_]/g, '') + '%'); }
  });
  const { results } = await context.env.DB.prepare(
    `SELECT num, street, city, lat, lng FROM addresses WHERE ${conds.join(' AND ')}
      ORDER BY CASE WHEN city = 'Waseca' THEN 0 ELSE 1 END, length(search) LIMIT 8`
  ).bind(...binds).all();
  // Shelter-added landmarks first: they're the places people actually name.
  let places = [];
  try {
    const pc = words.map(() => 'lower(name) LIKE ?');
    places = (await context.env.DB.prepare(
      `SELECT name, lat, lng, note FROM places WHERE ${pc.join(' AND ')} LIMIT 5`
    ).bind(...words.map(w => '%' + w.replace(/[%_]/g, '') + '%')).all()).results || [];
  } catch (e) { /* table not there yet */ }
  const out = places.map(p => ({ label: p.name, lat: p.lat, lng: p.lng, kind: 'place', note: p.note || '' }))
    .concat((results || []).map(r => ({
      label: `${r.num} ${r.street}${r.city ? ', ' + r.city : ''}`, lat: r.lat, lng: r.lng,
    }))).slice(0, 8);
  return new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}
