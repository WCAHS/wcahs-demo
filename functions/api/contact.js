import { json, error, verifyTurnstile } from './_helpers.js';

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

  await env.DB.prepare(
    'INSERT INTO form_submissions (type, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
  ).bind('contact', body.name, body.email, body.subject || 'General Inquiry', body.message).run();

  return json({ ok: true, message: 'Message sent! We\'ll get back to you soon.' });
}
