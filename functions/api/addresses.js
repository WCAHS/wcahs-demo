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
  const out = (results || []).map(r => ({
    label: `${r.num} ${r.street}${r.city ? ', ' + r.city : ''}`, lat: r.lat, lng: r.lng,
  }));
  return new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  });
}
