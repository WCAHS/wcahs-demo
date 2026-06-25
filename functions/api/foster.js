import { json, error, verifyTurnstile, sendNotification, sendAutoReply, addToAudience } from './_helpers.js';

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

  const result = await env.DB.prepare(
    'INSERT INTO form_submissions (type, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
  ).bind('foster', body.name, body.email, 'Foster Application', body.message).run();

  const subId = result.meta?.last_row_id || '';

  // Add to newsletter audience if opted in
  if (body.subscribe) {
    const nameParts = body.name.split(' ');
    await addToAudience(env, {
      email: body.email,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    });
  }

  await sendNotification(env, {
    subject: `New Foster Application — ${body.name}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New Foster Application</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Name</td><td style="padding:8px 12px;font-weight:600">${body.name}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Email</td><td style="padding:8px 12px"><a href="mailto:${body.email}">${body.email}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">About</td><td style="padding:8px 12px;white-space:pre-wrap">${body.message}</td></tr>
      </table>
      <div style="margin-top:24px;text-align:center"><a href="https://wcahs.org/admin/#inbox-sub-${subId}" style="display:inline-block;background:#48543e;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">View in Admin &rarr;</a></div>`,
  });

  // Auto-reply to submitter disabled for now
  // await sendAutoReply(env, { ... });

  return json({ ok: true, message: 'Foster application submitted! We\'ll be in touch.' });
}
