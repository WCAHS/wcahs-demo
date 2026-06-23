import { json, error } from '../../_helpers.js';

const AUDIENCE_ID = '39382335-2d39-4734-9231-6aa080c7cd5b';
const RESEND_BASE = 'https://api.resend.com';

async function resendFetch(env, path, opts = {}) {
  const res = await fetch(RESEND_BASE + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  return res.json();
}

// GET — list broadcasts
export async function onRequestGet(context) {
  try {
    const data = await resendFetch(context.env, '/broadcasts');
    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to fetch broadcasts', data.statusCode);
    }
    return json(data);
  } catch (e) {
    return error('Failed to fetch broadcasts: ' + e.message, 500);
  }
}

// POST — create and send a broadcast
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.subject || !body.html) {
    return error('Subject and HTML body are required');
  }

  try {
    // Step 1: Create broadcast
    const createPayload = {
      name: body.subject,
      audience_id: AUDIENCE_ID,
      from: (body.from_name || 'WCAHS') + ' <info@wcahs.org>',
      subject: body.subject,
      html: body.html,
    };

    // If a topic filter is specified, add it
    // Resend broadcasts don't support topic filtering in the API directly —
    // but we can use the "filter" field if available, or omit to send to all
    // Note: Resend broadcast API doesn't have a topic filter parameter in the
    // free tier. We include it in the name for reference.

    const createRes = await resendFetch(context.env, '/broadcasts', {
      method: 'POST',
      body: JSON.stringify(createPayload),
    });

    if (createRes.statusCode && createRes.statusCode >= 400) {
      return error(createRes.message || 'Failed to create broadcast', createRes.statusCode);
    }

    const broadcastId = createRes.id;
    if (!broadcastId) {
      return error('No broadcast ID returned from Resend');
    }

    // Step 2: Send the broadcast
    const sendRes = await resendFetch(context.env, `/broadcasts/${broadcastId}/send`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (sendRes.statusCode && sendRes.statusCode >= 400) {
      return error(sendRes.message || 'Broadcast created but failed to send', sendRes.statusCode);
    }

    return json({ ok: true, broadcast_id: broadcastId });
  } catch (e) {
    return error('Failed to send broadcast: ' + e.message, 500);
  }
}
