import { json, error } from '../_helpers.js';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.RESEND_API_KEY) return json({ sent: 0, delivered: 0, opened: 0, bounced: 0 });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY },
    });
    const data = await res.json();
    const emails = data.data || [];

    let sent = emails.length;
    let delivered = 0, opened = 0, bounced = 0, clicked = 0;
    emails.forEach(e => {
      if (e.last_event === 'delivered' || e.last_event === 'opened' || e.last_event === 'clicked') delivered++;
      if (e.last_event === 'opened' || e.last_event === 'clicked') opened++;
      if (e.last_event === 'clicked') clicked++;
      if (e.last_event === 'bounced') bounced++;
    });

    return json({ sent, delivered, opened, clicked, bounced });
  } catch (e) {
    return json({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 });
  }
}
