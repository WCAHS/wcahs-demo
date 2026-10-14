// wcahs-reply-log — records staff replies to form notifications.
//
// The notification email's Reply-To is "the person, log+<kind>-<id>-<sig>@
// reply.wcahs.org". Zoho delivers the reply to the person itself; this Worker
// only ever sees the copy, writes "replied by X at T" to D1, and drops it.
// Nothing is forwarded from here, so if this breaks, people still get their
// replies — we just stop seeing them in the admin.
//
// The signature must match replyLogAddress() in functions/api/_helpers.js.

const KINDS = new Set(['sub', 'lf', 'clinic']);
// Only the first text part matters; attachments come after it.
const MAX_RAW = 256 * 1024;

async function sig(secret, kind, id) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${kind}-${id}`));
  return [...new Uint8Array(mac)].slice(0, 5).map(b => b.toString(16).padStart(2, '0')).join('');
}

// One char per byte, so base64/QP decoding sees the real bytes and 8-bit
// bodies can be re-decoded with their own charset. (TextDecoder('latin1') is
// really windows-1252 and remaps 0x80-0x9F, which corrupts UTF-8.)
function binaryString(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}

// ── Minimal MIME: enough to pull a readable snippet out of a reply ──
function splitHead(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  return i < 0 ? [raw, ''] : [raw.slice(0, i), raw.slice(i).replace(/^\r?\n\r?\n/, '')];
}
function headers(block) {
  const out = {};
  block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(l => {
    const m = l.match(/^([\w-]+):\s*(.*)$/);
    if (m) out[m[1].toLowerCase()] = m[2];
  });
  return out;
}
function decodeWords(s) {
  return (s || '').replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    try {
      const bytes = enc.toUpperCase() === 'B'
        ? Uint8Array.from(atob(txt), c => c.charCodeAt(0))
        : Uint8Array.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } catch (e) { return txt; }
  });
}
function decodeBody(body, h) {
  const enc = (h['content-transfer-encoding'] || '').toLowerCase();
  const cs = ((h['content-type'] || '').match(/charset="?([^";]+)/i) || [])[1] || 'utf-8';
  let bytes;
  if (enc === 'base64') {
    try { bytes = Uint8Array.from(atob(body.replace(/\s+/g, '')), c => c.charCodeAt(0)); } catch (e) { return body; }
  } else if (enc === 'quoted-printable') {
    const s = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
    bytes = Uint8Array.from(s, c => c.charCodeAt(0));
  } else bytes = Uint8Array.from(body, c => c.charCodeAt(0) & 0xff);
  try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); }
}
// Depth-first: first text/plain wins, else first text/html stripped of tags.
function findText(head, body, depth = 0) {
  const h = headers(head);
  const ct = (h['content-type'] || 'text/plain').toLowerCase();
  if (ct.startsWith('multipart/') && depth < 6) {
    const b = (h['content-type'].match(/boundary="?([^";]+)"?/i) || [])[1];
    if (!b) return null;
    const parts = body.split('--' + b).slice(1).filter(p => !p.startsWith('--'));
    let html = null;
    for (const p of parts) {
      const [ph, pb] = splitHead(p.replace(/^\r?\n/, ''));
      const got = findText(ph, pb, depth + 1);
      if (got && got.type === 'plain') return got;
      if (got && !html) html = got;
    }
    return html;
  }
  if (ct.startsWith('text/plain')) return { type: 'plain', text: decodeBody(body, h) };
  if (ct.startsWith('text/html')) {
    const t = decodeBody(body, h).replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    return { type: 'html', text: t };
  }
  return null;
}
// Keep what they wrote, not the email they were replying to.
function snippetOf(text) {
  const lines = (text || '').split(/\r?\n/);
  const out = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^\s*On .{1,300}wrote:\s*$/i.test(l) || /^-{2,}\s*(Original Message|On .* wrote)/i.test(l)) break;
    if (/^\s*(From|Sent|To|Subject):\s/.test(l) && out.length) break;
    if (/^-- ?$/.test(l)) break;                     // signature
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300);
}

export default {
  async email(message, env) {
    const m = String(message.to || '').toLowerCase().match(/^log\+(sub|lf|clinic)-(\d+)-([0-9a-f]{10})@/);
    if (!m || !KINDS.has(m[1]) || !env.REPLY_LOG_SECRET) { message.setReject('Unknown address'); return; }
    const [, kind, id, given] = m;
    if (given !== await sig(env.REPLY_LOG_SECRET, kind, id)) { message.setReject('Unknown address'); return; }

    let raw = '';
    try {
      const reader = message.raw.getReader();
      const chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_RAW) { chunks.push(value.slice(0, value.length - (size - MAX_RAW))); break; }
        chunks.push(value);
      }
      const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
      raw = binaryString(all);
    } catch (e) { console.error('read failed', e && e.message); }

    const [head, body] = splitHead(raw);
    const h = headers(head);
    const fromHdr = decodeWords(h.from || message.from || '');
    const fromEmail = ((fromHdr.match(/<([^>]+)>/) || [])[1] || fromHdr || message.from || '').trim().toLowerCase();
    const fromName = fromHdr.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || null;
    const found = findText(head, body);
    const snippet = found ? snippetOf(found.text) : '';

    await env.DB.prepare(
      `INSERT OR IGNORE INTO email_replies (kind, ref_id, from_email, from_name, subject, snippet, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(kind, Number(id), fromEmail.slice(0, 200), fromName ? fromName.slice(0, 120) : null,
      decodeWords(h.subject || '').slice(0, 200), snippet, (h['message-id'] || '').slice(0, 300) || null).run();

    // Answered means read, and a "new" message becomes "contacted".
    if (kind === 'sub') {
      await env.DB.prepare(
        `UPDATE form_submissions SET is_read = 1, status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END WHERE id = ?`
      ).bind(Number(id)).run();
    }
    // Accepting without forwarding drops the copy.
  },
};

// Exposed for the local test harness.
export { snippetOf, findText, splitHead, sig, binaryString };
