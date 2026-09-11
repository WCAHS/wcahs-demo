// Trackable short links.
//
// This is a catch-all route, which on Cloudflare Pages runs BEFORE static
// assets and would otherwise swallow the whole site — /pets, /events, even
// /admin. Everything that isn't a known short link therefore falls through
// with context.next(), which hands the request back to the asset server.
//
// The lookup happens BEFORE next() rather than only on a 404. Checking the
// asset first is tempting and was tried: it makes shadowing structurally
// impossible. But Pages caches its own assets at the edge for a week, and a
// path that used to be a real page keeps serving the old file long after the
// file is gone — so a short link at that path silently never fires, and no
// cache purge clears it. Looking up first means a short link works the moment
// it's created, every time.
//
// What stops a short link shadowing a real page is therefore validation at
// creation time: functions/api/admin/short-links.js asks the site whether
// something already lives at that address and refuses the name if so, plus a
// reserved list. If a page is ever ADDED at a path that already has a short
// link, the link wins — so check Short Links in the admin panel before naming
// a new page.
//
// Slugs are matched case-insensitively and ignore a trailing slash, because
// these are typed off printed posters by people who didn't choose the casing.

function normalise(pathname) {
  let p = decodeURIComponent(pathname || '').trim().toLowerCase();
  if (p.startsWith('/')) p = p.slice(1);
  if (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

// Requests no human made. Counting these would quietly inflate the numbers
// staff use to judge whether a poster worked.
function isAutomated(request) {
  const purpose = request.headers.get('Purpose') || request.headers.get('X-Purpose') || '';
  const secPurpose = request.headers.get('Sec-Purpose') || '';
  if (/prefetch|preview|prerender/i.test(purpose + ' ' + secPurpose)) return true;
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();
  return /bot|crawler|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|headless/.test(ua);
}

export async function onRequest(context) {
  const { request, env, next } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') return next();

  const url = new URL(request.url);
  const slug = normalise(url.pathname);

  // Short links are a single path segment with no file extension. Anything
  // else is a real page or asset and never touches the database.
  if (!slug || slug.includes('/') || slug.includes('.')) return next();

  let link;
  try {
    link = await env.DB.prepare(
      'SELECT slug, destination FROM short_links WHERE slug = ? AND active = 1'
    ).bind(slug).first();
  } catch (e) {
    console.error('short link lookup failed:', e && e.message);
    return next();
  }

  if (!link || !link.destination) return next();

  // Keep any query string so campaign tags survive the hop.
  let target;
  try {
    target = new URL(link.destination, url.origin);
  } catch (e) {
    console.error('short link has an unusable destination:', link.destination);
    return next();
  }
  if (url.search && !target.search) target.search = url.search;

  // Count after responding: the visitor never waits on the write and never
  // sees an error from it.
  if (request.method === 'GET' && !isAutomated(request)) {
    const day = new Date().toISOString().slice(0, 10);
    const record = env.DB.batch([
      env.DB.prepare(
        "UPDATE short_links SET clicks = clicks + 1, last_clicked_at = datetime('now') WHERE slug = ?"
      ).bind(slug),
      env.DB.prepare(
        `INSERT INTO short_link_hits (slug, day, count) VALUES (?, ?, 1)
         ON CONFLICT(slug, day) DO UPDATE SET count = count + 1`
      ).bind(slug, day),
    ]).catch(e => console.error('short link count failed:', e && e.message));

    if (typeof context.waitUntil === 'function') context.waitUntil(record);
  }

  // 302, not 301: browsers cache a permanent redirect forever, after which the
  // hit is never counted again and the destination can never be changed.
  return Response.redirect(target.toString(), 302);
}
