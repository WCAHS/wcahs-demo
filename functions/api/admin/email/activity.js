import { json, error } from '../../_helpers.js';

const RESEND_BASE = 'https://api.resend.com';

// GET — list recent emails/broadcasts activity
export async function onRequestGet(context) {
  try {
    // Fetch recent broadcasts for activity log
    const res = await fetch(RESEND_BASE + '/broadcasts', {
      headers: {
        'Authorization': 'Bearer ' + context.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();

    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to fetch activity', data.statusCode);
    }

    // Return the broadcasts list as activity — Resend GET /emails isn't
    // available on all tiers, but broadcasts list gives us send history
    return json(data);
  } catch (e) {
    return error('Failed to fetch activity: ' + e.message, 500);
  }
}
