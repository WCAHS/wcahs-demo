import { json, error, verifyTurnstile, sendNotification, sendAutoReply } from './_helpers.js';

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
  ).bind('foster', body.name, body.email, 'Foster Application', body.message).run();

  await sendNotification(env, {
    subject: `New Foster Application — ${body.name}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New Foster Application</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Name</td><td style="padding:8px 12px;font-weight:600">${body.name}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Email</td><td style="padding:8px 12px"><a href="mailto:${body.email}">${body.email}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">About</td><td style="padding:8px 12px;white-space:pre-wrap">${body.message}</td></tr>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999">View all applications at <a href="https://wcahs.org/admin/">wcahs.org/admin</a></p>`,
  });

  await sendAutoReply(env, {
    to: body.email,
    subject: 'Foster Application Received!',
    bodyHtml: `<h2 style="color:#48543e;margin:0 0 16px;font-family:Georgia,serif">Thank you for your interest in fostering, ${body.name}!</h2>
      <p style="color:#666;font-size:15px;line-height:1.6">We received your foster application and are so excited you want to help! A member of our team will review your application and reach out soon.</p>
      <h3 style="color:#48543e;font-size:15px;margin:24px 0 12px">What happens next?</h3>
      <ol style="color:#666;font-size:14px;line-height:1.8;padding-left:20px">
        <li>Our team reviews your application</li>
        <li>We'll reach out to schedule a quick chat</li>
        <li>We'll match you with a pet that fits your home</li>
        <li>You'll receive supplies and support from our team</li>
      </ol>
      <p style="color:#666;font-size:15px;line-height:1.6;margin-top:20px">Have questions in the meantime? Reply to this email or call us at <strong>(507) 201-7287</strong>.</p>
      <p style="color:#999;font-size:13px;margin-top:24px">— The WCAHS Team</p>`,
  });

  return json({ ok: true, message: 'Foster application submitted! We\'ll be in touch.' });
}
