import { json, error, replyLogAddress, REPLY_LOG_DOMAIN, replySnippet, htmlToText } from './_helpers.js';

// Resend "email.received" webhook for reply.wcahs.org.
//
// Each notification's Reply-To is "the person, log+<kind>-<id>-<sig>@reply.wcahs.org".
// Zoho sends the staff reply to both; the copy lands at Resend (MX for the
// reply subdomain only — wcahs.org's own MX stays Zoho), Resend posts here,
// and we record who/when/what. Nothing is forwarded, so if this breaks, people
// still get their replies.
//
// Cloudflare Email Routing was the first plan and was dropped: enabling it on
// a subdomain still wanted to take over wcahs.org's MX records.
//
// Secrets: RESEND_WEBHOOK_SECRET (whsec_… from the webhook), RESEND_RECEIVE_KEY
// (an API key allowed to read received email), REPLY_LOG_SECRET.

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// Svix signing, as Resend uses it: HMAC-SHA256 over "id.timestamp.body" with
// the base64 part of the whsec_ secret; header holds "v1,<b64> v1,<b64>…".
async function verifySvix(secret, headers, body) {
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sigs = headers.get('svix-signature');
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;           // replay window
  const key = await crypto.subtle.importKey('raw', b64(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(' ').some(s => s.split(',')[1] === expected);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.text();
  if (!await verifySvix(env.RESEND_WEBHOOK_SECRET, request.headers, body)) return error('Bad signature', 401);

  let event;
  try { event = JSON.parse(body); } catch (e) { return error('Bad JSON'); }
  if (event.type !== 'email.received' || !event.data?.email_id) return json({ ok: true, ignored: true });

  const res = await fetch(`${env.RESEND_BASE_URL || 'https://api.resend.com'}/emails/receiving/${event.data.email_id}`, {
    headers: { Authorization: 'Bearer ' + env.RESEND_RECEIVE_KEY },
  });
  if (!res.ok) {
    console.error('reply-log: fetch received email failed', res.status);
    return error('Could not fetch email', 502);               // non-2xx → Resend retries
  }
  const mail = await res.json();

  // Find our log address among every recipient field.
  const all = [].concat(mail.to || [], mail.cc || [], mail.received_for || [], event.data.to || [])
    .map(a => String(a).toLowerCase());
  const re = new RegExp(`log\\+(sub|lf|clinic)-(\\d+)-([0-9a-f]{10})@${REPLY_LOG_DOMAIN.replace(/\./g, '\\.')}`);
  let hit = null;
  for (const a of all) {
    const m = a.match(re);
    if (m && await replyLogAddress(env, m[1], m[2]) === m[0]) { hit = m; break; }
  }
  if (!hit) return json({ ok: true, ignored: 'no valid log address' });
  const [, kind, id] = hit;

  const fromHdr = (mail.headers && mail.headers.from) || mail.from || '';
  const fromEmail = ((fromHdr.match(/<([^>]+)>/) || [])[1] || mail.from || '').trim().toLowerCase();
  const fromName = fromHdr.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || null;
  const text = mail.text || (mail.html && !String(mail.html).startsWith('data:') ? htmlToText(mail.html) : '');
  let snippet = replySnippet(text);
  if (!snippet && mail.html && String(mail.html).startsWith('data:')) {
    // html_format "data_uri": the body arrives base64-encoded in a data: URI.
    try {
      const uri = String(mail.html), comma = uri.indexOf(',');
      const meta = uri.slice(0, comma), data = uri.slice(comma + 1);
      const html = /;base64/i.test(meta) ? new TextDecoder().decode(b64(data)) : decodeURIComponent(data);
      snippet = replySnippet(htmlToText(html));
    } catch (e) { /* keep empty */ }
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO email_replies (kind, ref_id, from_email, from_name, subject, snippet, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(kind, Number(id), fromEmail.slice(0, 200), fromName ? fromName.slice(0, 120) : null,
    String(mail.subject || '').slice(0, 200), snippet, mail.message_id || event.data.email_id).run();

  if (kind === 'sub') {
    await env.DB.prepare(
      `UPDATE form_submissions SET is_read = 1, status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END WHERE id = ?`
    ).bind(Number(id)).run();
  }
  return json({ ok: true, kind, id: Number(id) });
}
