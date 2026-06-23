// Shared helpers for API functions

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

export async function sendNotification(env, { subject, html }) {
  if (!env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WCAHS Notifications <noreply@wcahs.org>',
        to: ['info@wcahs.org'],
        subject,
        html,
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
    await fetch('https://api.resend.com/emails', {
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
