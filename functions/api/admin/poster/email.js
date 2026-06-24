import { json, error } from '../../_helpers.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || !body.to || !body.poster_url) return error('Email and poster URL required');

  const type = body.type === 'found' ? 'Found' : 'Lost';
  const petName = body.pet_name || 'Pet';
  const subject = `${type} Pet Report: ${petName} — WCAHS`;

  // Build the full poster URL
  const posterUrl = body.poster_url.startsWith('http')
    ? body.poster_url
    : `https://wcahs.org${body.poster_url}`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WCAHS <noreply@wcahs.org>',
        to: [body.to],
        subject,
        html: `<div style="max-width:600px;margin:0 auto;font-family:Nunito,Helvetica,Arial,sans-serif">
          <div style="background:#48543e;padding:24px 32px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:20px;font-family:Georgia,serif">Waseca County Animal Humane Society</h1>
          </div>
          <div style="padding:32px;background:#fff">
            <h2 style="color:#48543e;margin:0 0 16px;font-family:Georgia,serif">${type} Pet: ${petName}</h2>
            <p style="color:#666;font-size:15px;line-height:1.6;margin-bottom:24px">${body.message || 'Please see the attached poster for details.'}</p>
            <div style="text-align:center;margin:24px 0">
              <img src="${posterUrl}" alt="${type} Pet Poster" style="max-width:100%;border-radius:8px;border:1px solid #ddd">
            </div>
            <div style="text-align:center;margin-top:24px">
              <a href="https://wcahs.org/lost-found.html" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">View Lost & Found Page</a>
            </div>
          </div>
          <div style="padding:20px 32px;text-align:center;background:#f6f7f4">
            <p style="color:#93a27e;font-size:12px;margin:0">Waseca County Animal Humane Society</p>
            <p style="color:#93a27e;font-size:12px;margin:4px 0 0">(507) 201-7287 &bull; info@wcahs.org &bull; <a href="https://wcahs.org" style="color:#5c6b4e">wcahs.org</a></p>
          </div>
        </div>`,
      }),
    });
    return json({ ok: true });
  } catch (e) {
    return error('Failed to send email: ' + e.message, 500);
  }
}
