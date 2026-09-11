import { json, error } from '../_helpers.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// Reserved because a short link here would be confusing even though it could
// never actually win — the real page always takes precedence.
const RESERVED = ['api', 'admin', 'images', 'es', 'functions', 'index'];

// Asks the site whether something already lives at this address rather than
// keeping a hand-written list of pages that nobody updates when one is added.
async function pathIsTaken(origin, slug) {
  try {
    const res = await fetch(new URL('/' + slug, origin).toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'wcahs-admin-slug-check' },
    });
    return res.status !== 404;
  } catch (e) {
    // If the check itself fails, don't block staff — the ordering in
    // [[path]].js means a clashing slug is inert, not harmful.
    console.error('slug availability check failed:', e && e.message);
    return false;
  }
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  const { results: links } = await db.prepare(
    'SELECT slug, destination, label, clicks, last_clicked_at, active, created_at FROM short_links ORDER BY clicks DESC, slug ASC'
  ).all();
  // Last 30 days of activity, for a trend rather than just a running total.
  const { results: hits } = await db.prepare(
    "SELECT slug, day, count FROM short_link_hits WHERE day >= date('now', '-30 days') ORDER BY day ASC"
  ).all();
  return json({ links: links || [], hits: hits || [] });
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  const slug = String(body.slug || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  const destination = String(body.destination || '').trim();

  if (!SLUG_RE.test(slug)) {
    return error('Use lowercase letters, numbers and dashes only (e.g. "fall-fest")');
  }
  if (RESERVED.includes(slug)) return error(`"${slug}" is reserved by the site`);
  if (!destination) return error('Where should it go?');
  if (!destination.startsWith('/') && !/^https?:\/\//i.test(destination)) {
    return error('Destination must start with "/" or be a full https:// address');
  }

  const existing = await context.env.DB.prepare('SELECT slug FROM short_links WHERE slug = ?').bind(slug).first();
  if (existing) return error(`A short link for "${slug}" already exists`);

  const origin = new URL(context.request.url).origin;
  if (await pathIsTaken(origin, slug)) {
    return error(`wcahs.org/${slug} is already a page on the site, so a short link there would never be used. Pick a different name.`);
  }

  await context.env.DB.prepare(
    'INSERT INTO short_links (slug, destination, label) VALUES (?, ?, ?)'
  ).bind(slug, destination, body.label ? String(body.label).slice(0, 120) : null).run();

  return json({ ok: true, slug });
}

export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.slug) return error('Which short link?');
  const slug = String(body.slug).trim().toLowerCase();

  const sets = [];
  const vals = [];
  if (body.destination !== undefined) {
    const d = String(body.destination).trim();
    if (!d.startsWith('/') && !/^https?:\/\//i.test(d)) {
      return error('Destination must start with "/" or be a full https:// address');
    }
    sets.push('destination=?'); vals.push(d);
  }
  if (body.label !== undefined) { sets.push('label=?'); vals.push(String(body.label).slice(0, 120)); }
  if (body.active !== undefined) { sets.push('active=?'); vals.push(body.active ? 1 : 0); }
  if (body.reset_clicks) { sets.push('clicks=0'); sets.push('last_clicked_at=NULL'); }
  if (sets.length === 0) return error('Nothing to update');

  vals.push(slug);
  await context.env.DB.prepare(`UPDATE short_links SET ${sets.join(', ')} WHERE slug=?`).bind(...vals).run();
  if (body.reset_clicks) {
    await context.env.DB.prepare('DELETE FROM short_link_hits WHERE slug = ?').bind(slug).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug) return error('Which short link?');
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM short_links WHERE slug = ?').bind(slug),
    context.env.DB.prepare('DELETE FROM short_link_hits WHERE slug = ?').bind(slug),
  ]);
  return json({ ok: true });
}
