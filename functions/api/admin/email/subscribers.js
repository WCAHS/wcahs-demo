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

// GET — list all contacts in audience
export async function onRequestGet(context) {
  try {
    const data = await resendFetch(context.env, `/audiences/${AUDIENCE_ID}/contacts`);
    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to fetch subscribers', data.statusCode);
    }
    return json(data);
  } catch (e) {
    return error('Failed to fetch subscribers: ' + e.message, 500);
  }
}

// POST — add a new contact
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.email) {
    return error('Email is required');
  }

  try {
    const payload = {
      email: body.email,
      first_name: body.first_name || '',
      last_name: body.last_name || '',
      unsubscribed: false,
    };

    const data = await resendFetch(context.env, `/audiences/${AUDIENCE_ID}/contacts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to add subscriber', data.statusCode);
    }
    return json({ ok: true, contact: data });
  } catch (e) {
    return error('Failed to add subscriber: ' + e.message, 500);
  }
}

// DELETE — remove a contact by ID (passed as ?id=xxx)
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const contactId = url.searchParams.get('id');
  if (!contactId) {
    return error('Contact ID required');
  }

  try {
    const res = await fetch(`${RESEND_BASE}/audiences/${AUDIENCE_ID}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + context.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();

    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to remove subscriber', data.statusCode);
    }
    return json({ ok: true });
  } catch (e) {
    return error('Failed to remove subscriber: ' + e.message, 500);
  }
}
