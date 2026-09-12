// Per-pet social previews.
//
// pet.html renders entirely client-side from /api/pets?id=. Social scrapers
// don't run JavaScript, so a shared link to a specific animal previewed as the
// generic "Adoptable Pet - WCAHS" card with a stock photo — the shelter's most
// shared link, and the one where the animal's own face is the entire point.
//
// This runs on the server, pulls the animal out of D1, and rewrites the meta
// tags in the HTML on its way out. The page itself is untouched: humans still
// get the same client-rendered page, scrapers get accurate tags.

const FALLBACK_IMAGE = 'https://wcahs.org/images/og/pets.png';
const ORIGIN = 'https://wcahs.org';

// Mirrors isPublishable() in functions/api/pets.js — a pet that isn't on the
// site publicly shouldn't get a rich preview either.
function isPublishable(status) {
  if (!status) return false;
  return /^available\b/i.test(String(status).trim());
}

function firstSentences(text, limit = 200) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…');
}

class MetaRewriter {
  constructor(values) { this.values = values; }
  element(el) {
    const key = el.getAttribute('property') || el.getAttribute('name');
    if (key && this.values[key] !== undefined) {
      el.setAttribute('content', this.values[key]);
    }
  }
}

class TitleRewriter {
  constructor(title) { this.title = title; }
  element(el) { el.setInnerContent(this.title); }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const response = await next();

  if (request.method !== 'GET') return response;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return response;

  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return response;

  let animal;
  try {
    animal = await env.DB.prepare(
      'SELECT id, name, type, breed, sex, age_display, cover_photo, description, status, is_manual, hidden FROM animals WHERE id = ?'
    ).bind(id).first();
  } catch (e) {
    console.error('pet preview lookup failed:', e && e.message);
    return response;
  }

  // Unknown, hidden or not-publicly-listed: leave the generic tags alone rather
  // than advertising an animal the site deliberately isn't showing.
  if (!animal || animal.hidden === 1) return response;
  if (!animal.is_manual && !isPublishable(animal.status)) return response;

  const name = animal.name || 'Adoptable Pet';
  const bits = [animal.age_display, animal.sex, animal.breed].filter(Boolean).join(' · ');
  const title = `${name} — Adoptable ${animal.type || 'Pet'} at WCAHS`;
  const description = firstSentences(animal.description)
    || `${name} is looking for a home. ${bits}`.trim();

  let image = FALLBACK_IMAGE;
  if (animal.cover_photo && /^https?:\/\//i.test(animal.cover_photo)) {
    image = animal.cover_photo;
  }

  const values = {
    'og:title': title,
    'og:description': description,
    'og:image': image,
    'og:image:alt': `${name}, an adoptable ${(animal.type || 'pet').toLowerCase()} at WCAHS`,
    'og:url': `${ORIGIN}/pet?id=${encodeURIComponent(id)}`,
    'og:type': 'article',
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
  };

  // A pet photo is whatever shape ShelterLuv stored; the fixed 1200x630 on the
  // page would make the scraper lay out a card that doesn't match the image.
  const rewriter = new HTMLRewriter()
    .on('meta', new MetaRewriter(values))
    .on('title', new TitleRewriter(title));

  if (image !== FALLBACK_IMAGE) {
    rewriter.on('meta[property="og:image:width"], meta[property="og:image:height"]', {
      element(el) { el.remove(); },
    });
  }

  return rewriter.transform(response);
}
