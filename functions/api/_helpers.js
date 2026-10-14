// Shared helpers for API functions

// A clinic form is in exactly one of these states, and each carries its own
// fixed wording. Deliberately NOT editable: this text is read by people who may
// be anxious about a pet, and it should stay accurate and kind without anyone
// having to maintain it. Defined once here so the public page and the admin
// preview can never drift apart.
export const CLINIC_FORM_STATES = {
  open: {
    label: 'Open',
    heading: null,
    message: null,
  },
  closed: {
    label: 'Closed',
    heading: 'Registration Is Closed',
    message: "We're not accepting applications for this clinic right now. Call us at (507) 201-7287 and we'll let you know when registration opens.",
  },
  reviewing: {
    label: 'Being reviewed',
    heading: 'Applications Are Being Reviewed',
    message: "Registration has closed and we're going through the applications we received. If you applied, a WCAHS volunteer will be in touch with you. Questions in the meantime? Call us at (507) 201-7287.",
  },
};

// Shown when no upcoming clinic exists at all — distinct from a clinic whose
// registration is closed, and careful not to promise one that isn't scheduled.
export const CLINIC_NO_EVENT = {
  heading: 'No Clinic Scheduled Right Now',
  message: "We don't have a spay/neuter clinic on the calendar at the moment. Call us at (507) 201-7287 or watch our events page — we'll announce the next one there.",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export async function verifyTurnstile(token, secret, ip) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: ip,
    }),
  });
  const data = await res.json();
  return data.success === true;
}

export async function getSession(request, db) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/wcahs_session=([^;]+)/);
  if (!match) return null;

  const sessionId = match[1];
  const row = await db.prepare(
    `SELECT s.id, s.user_id, s.expires_at, u.username, u.role
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sessionId).first();

  return row || null;
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 50000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return `${saltB64}:${hashB64}`;
}

// The two shelter mailboxes. Staff accounts have no email address of their own,
// so notifications are routed between these rather than to individual people.
export const NOTIFY_MAILBOXES = ['info@wcahs.org', 'admin@wcahs.org'];

// Which mailboxes hear about which form. Staff set this per form in Site
// Settings — clinic applications may belong to whoever runs the clinic, while a
// lost-pet report should reach everyone.
export async function notifyRecipients(env, type) {
  const fallback = NOTIFY_MAILBOXES;
  if (!type || !env.DB) return fallback;
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM site_settings WHERE key = 'notify_recipients'"
    ).first();
    if (!row || !row.value) return fallback;
    const map = JSON.parse(row.value);
    const list = map && map[type];
    // An empty list would mean a submission nobody is told about, which is a
    // worse failure than an unwanted email. Fall back rather than send nowhere.
    if (!Array.isArray(list) || list.length === 0) return fallback;
    return list.filter(a => typeof a === 'string' && a.includes('@')).slice(0, 10);
  } catch (e) {
    console.error('notifyRecipients failed, using defaults:', e && e.message);
    return fallback;
  }
}

// Where the mail actually goes. Defaults to Resend; a local dev server can point
// this at a capture endpoint so outgoing mail can be reviewed without a real
// send. Production never sets RESEND_BASE_URL, so this is the live API there.
function emailsEndpoint(env) {
  return (env.RESEND_BASE_URL || 'https://api.resend.com') + '/emails';
}

// `to` lets a caller name its own recipients (an event form carries its own);
// everything else resolves by form type from site settings.
// Escape text from a visitor's browser before it goes into an HTML email.
export function escHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Reply tracking ──
// Each notification's Reply-To carries a per-record log address, signed so a
// stranger can't mark someone else's message as answered by mailing a guessed
// address. The Worker in workers/reply-log/ checks the same signature — keep
// the two in step.
export const REPLY_LOG_DOMAIN = 'reply.wcahs.org';
export async function replyLogAddress(env, kind, id) {
  if (!env.REPLY_LOG_SECRET || !id) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.REPLY_LOG_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${kind}-${id}`));
  const sig = [...new Uint8Array(mac)].slice(0, 5).map(b => b.toString(16).padStart(2, '0')).join('');
  return `log+${kind}-${id}-${sig}@${REPLY_LOG_DOMAIN}`;
}

// Reply-To for a staff notification: the person who wrote in, plus the log
// address. Without a person there's nothing to reply to, so no log either —
// a Reply-To of only the log address would swallow staff replies.
export async function notificationReplyTo(env, kind, id, personEmail) {
  const person = typeof personEmail === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(personEmail.trim()) ? personEmail.trim() : null;
  if (!person) return [];
  const log = await replyLogAddress(env, kind, id);
  return log ? [person, `WCAHS reply log <${log}>`] : [person];
}

// Pull what a staff member actually wrote out of a reply: stop at the quoted
// original, the "On ... wrote:" line, or the signature.
export function replySnippet(text) {
  const out = [];
  for (const l of String(text || '').split(/\r?\n/)) {
    if (/^\s*>/.test(l)) break;
    if (/^\s*On .{1,300}wrote:\s*$/i.test(l) || /^-{2,}\s*(Original Message|On .* wrote)/i.test(l)) break;
    if (/^\s*(From|Sent|To|Subject):\s/.test(l) && out.length) break;
    if (/^-- ?$/.test(l)) break;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300);
}
export function htmlToText(html) {
  return String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<div[^>]*class="[^"]*(gmail_quote|zmail_extra|yahoo_quoted)[\s\S]*$/i, '')
    .replace(/<blockquote[\s\S]*$/i, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

// Hang each row's logged replies on it (newest first), plus its log address
// so the admin's own Reply button can copy the log too.
export async function attachReplies(env, kind, rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  let byId = {};
  try {
    const { results } = await env.DB.prepare(
      'SELECT ref_id, at, from_email, from_name, subject, snippet FROM email_replies WHERE kind = ? ORDER BY at DESC'
    ).bind(kind).all();
    for (const r of results || []) (byId[r.ref_id] = byId[r.ref_id] || []).push(r);
  } catch (e) {
    console.error('email_replies read failed:', e && e.message);   // table missing before the migration
  }
  for (const row of rows) {
    row.replies = byId[row.id] || [];
    row.reply_log = await replyLogAddress(env, kind, row.id);
  }
  return rows;
}

export async function sendNotification(env, { subject, html, type, to: explicitTo, replyTo }) {
  if (!env.RESEND_API_KEY) return;
  const to = (Array.isArray(explicitTo) && explicitTo.length)
    ? explicitTo.filter(a => typeof a === 'string' && a.includes('@')).slice(0, 10)
    : await notifyRecipients(env, type);
  if (!to.length) return;
  try {
    await fetch(emailsEndpoint(env), {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WCAHS Notifications <noreply@wcahs.org>',
        to,
        subject,
        html,
        // Hitting Reply used to answer noreply@wcahs.org, not the person.
        ...(Array.isArray(replyTo) && replyTo.length ? { reply_to: replyTo } : {}),
      }),
    });
  } catch (e) {
    console.error('Resend error:', e.message);
  }
}

const EMAIL_FOOTER = `<div style="padding:20px 32px;text-align:center;background:#f6f7f4"><p style="color:#93a27e;font-size:12px;margin:0">Waseca County Animal Humane Society</p><p style="color:#93a27e;font-size:12px;margin:4px 0 0">(507) 201-7287 &bull; info@wcahs.org &bull; <a href="https://wcahs.org" style="color:#5c6b4e">wcahs.org</a></p></div>`;
const EMAIL_HEADER = `<div style="background:#48543e;padding:24px 32px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px;font-family:Georgia,serif">Waseca County Animal Humane Society</h1></div>`;

export async function sendAutoReply(env, { to, subject, bodyHtml }) {
  if (!env.RESEND_API_KEY || !to) return;
  try {
    await fetch(emailsEndpoint(env), {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WCAHS <noreply@wcahs.org>',
        to: [to],
        subject,
        html: `<div style="max-width:600px;margin:0 auto;font-family:Nunito,Helvetica,Arial,sans-serif">${EMAIL_HEADER}<div style="padding:32px;background:#fff">${bodyHtml}</div>${EMAIL_FOOTER}</div>`,
      }),
    });
  } catch (e) {
    console.error('Auto-reply error:', e.message);
  }
}

const AUDIENCE_ID = '39382335-2d39-4734-9231-6aa080c7cd5b';

export async function addToAudience(env, { email, firstName, lastName }) {
  if (!env.RESEND_API_KEY || !email) return;
  try {
    await fetch(`${env.RESEND_BASE_URL || 'https://api.resend.com'}/audiences/${AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        first_name: firstName || '',
        last_name: lastName || '',
        unsubscribed: false,
      }),
    });
  } catch (e) {
    console.error('Audience add error:', e.message);
  }
}

export async function verifyPassword(password, stored) {
  const [saltB64, expectedB64] = stored.split(':');
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 50000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return hashB64 === expectedB64;
}

// Lost & Found place + date, validated once for the public form and the admin.
// A pin outside southern Minnesota is a mis-tap or junk, not a pet sighting.
export function cleanLFPlace(body) {
  const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  let lat = num(body.lat), lng = num(body.lng);
  if (lat == null || lng == null || lat < 43 || lat > 45.5 || lng < -95.5 || lng > -92) { lat = null; lng = null; }
  let seen = typeof body.seen_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.seen_date) ? body.seen_date : null;
  // A date picker can't pick tomorrow, but a hand-built request can.
  if (seen && seen > new Date(Date.now() + 36e5 * 24).toISOString().slice(0, 10)) seen = null;
  const address = typeof body.address === 'string' && body.address.trim() ? body.address.trim().slice(0, 200) : null;
  return { seen_date: seen, address, lat, lng };
}

// What the public sees of a place: the pin rounded to ~100m and the address
// without its house number. A "last seen" address is very often the owner's
// own home. Staff get the exact values from the admin API.
export function publicLFPlace(r) {
  const round = v => v == null ? null : Math.round(v * 1000) / 1000;
  return {
    ...r,
    lat: round(r.lat), lng: round(r.lng),
    address: r.address ? r.address.replace(/^\s*\d+[A-Za-z]?(-\d+)?\s+/, '') : null,
  };
}
