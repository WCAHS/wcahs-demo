import { json, error, verifyTurnstile, sendNotification } from './_helpers.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) return error('Invalid request body');

  if (!body.turnstile_token) return error('CAPTCHA required');
  const valid = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!valid) return error('CAPTCHA verification failed', 403);

  if (!body.name || !body.email || !body.message) {
    return error('Name, email, and message are required');
  }

  const message = body.phone ? `Phone: ${body.phone}\n\n${body.message}` : body.message;
  await env.DB.prepare(
    'INSERT INTO form_submissions (type, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
  ).bind('contact', body.name, body.email, body.subject || 'General Inquiry', message).run();

  await sendNotification(env, {
    subject: `New Contact: ${body.subject || 'General Inquiry'} — ${body.name}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New Contact Message</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Name</td><td style="padding:8px 12px;font-weight:600">${body.name}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Email</td><td style="padding:8px 12px"><a href="mailto:${body.email}">${body.email}</a></td></tr>
        ${body.phone ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Phone</td><td style="padding:8px 12px">${body.phone}</td></tr>` : ''}
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Subject</td><td style="padding:8px 12px">${body.subject || 'General Inquiry'}</td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Message</td><td style="padding:8px 12px;white-space:pre-wrap">${body.message}</td></tr>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999">View all messages at <a href="https://wcahs.org/admin/">wcahs.org/admin</a></p>`,
  });

  return json({ ok: true, message: 'Message sent! We\'ll get back to you soon.' });
}
