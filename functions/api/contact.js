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

  const message = body.phone ? `Phone: ${body.phone}\n\n${body.message}` : body.message;
  const result = await env.DB.prepare(
    'INSERT INTO form_submissions (type, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
  ).bind('contact', body.name, body.email, body.subject || 'General Inquiry', message).run();

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
    subject: `New Contact: ${body.subject || 'General Inquiry'} — ${body.name}`,
    html: `<h2 style="color:#5c6b4e;margin:0 0 16px">New Contact Message</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px">
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Name</td><td style="padding:8px 12px;font-weight:600">${body.name}</td></tr>
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Email</td><td style="padding:8px 12px"><a href="mailto:${body.email}">${body.email}</a></td></tr>
        ${body.phone ? `<tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Phone</td><td style="padding:8px 12px">${body.phone}</td></tr>` : ''}
        <tr style="background:#f9f9f6"><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Subject</td><td style="padding:8px 12px">${body.subject || 'General Inquiry'}</td></tr>
        <tr><td style="padding:8px 12px;color:#888;font-size:13px;vertical-align:top">Message</td><td style="padding:8px 12px;white-space:pre-wrap">${body.message}</td></tr>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999"><a href="https://wcahs.org/admin/#inbox-sub-${subId}" style="color:#5c6b4e;font-weight:600">View in Admin &rarr;</a></p>`,
  });

  await sendAutoReply(env, {
    to: body.email,
    subject: 'We received your message!',
    bodyHtml: `<h2 style="color:#48543e;margin:0 0 16px;font-family:Georgia,serif">Thanks for reaching out, ${body.name}!</h2>
      <p style="color:#666;font-size:15px;line-height:1.6">We received your message and a member of our team will get back to you as soon as possible.</p>
      <div style="background:#f6f7f4;border-radius:12px;padding:16px 20px;margin:20px 0">
        <p style="margin:0;font-size:13px;color:#666"><strong>Subject:</strong> ${body.subject || 'General Inquiry'}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#666"><strong>Your message:</strong> ${body.message.substring(0, 200)}${body.message.length > 200 ? '...' : ''}</p>
      </div>
      <p style="color:#666;font-size:15px;line-height:1.6">In the meantime, feel free to browse our <a href="https://wcahs.org/pets.html" style="color:#5c6b4e;font-weight:700">available pets</a> or check out our <a href="https://wcahs.org/events.html" style="color:#5c6b4e;font-weight:700">upcoming events</a>.</p>
      <p style="color:#999;font-size:13px;margin-top:24px">— The WCAHS Team</p>`,
  });

  return json({ ok: true, message: 'Message sent! We\'ll get back to you soon.' });
}
