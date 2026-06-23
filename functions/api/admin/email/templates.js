import { json, error } from '../../_helpers.js';

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

// GET — list templates or get single template (?id=xxx)
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const templateId = url.searchParams.get('id');

  try {
    const path = templateId ? `/templates/${templateId}` : '/templates';
    const data = await resendFetch(context.env, path);
    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to fetch templates', data.statusCode);
    }
    return json(data);
  } catch (e) {
    return error('Failed to fetch templates: ' + e.message, 500);
  }
}

// POST — create a template
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.name || !body.html) {
    return error('Name and HTML body are required');
  }

  try {
    const payload = {
      name: body.name,
      subject: body.subject || '',
      html: body.html,
    };

    const data = await resendFetch(context.env, '/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to create template', data.statusCode);
    }
    return json({ ok: true, template: data });
  } catch (e) {
    return error('Failed to create template: ' + e.message, 500);
  }
}

// PUT — update a template (template_id in body)
export async function onRequestPut(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.id) {
    return error('Template ID is required');
  }

  try {
    const payload = {};
    if (body.name) payload.name = body.name;
    if (body.subject !== undefined) payload.subject = body.subject;
    if (body.html) payload.html = body.html;

    const data = await resendFetch(context.env, `/templates/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to update template', data.statusCode);
    }
    return json({ ok: true });
  } catch (e) {
    return error('Failed to update template: ' + e.message, 500);
  }
}

// DELETE — delete a template (?id=xxx)
export async function onRequestDelete(context) {
  const url = new URL(context.request.url);
  const templateId = url.searchParams.get('id');
  if (!templateId) {
    return error('Template ID required');
  }

  try {
    const res = await fetch(`${RESEND_BASE}/templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + context.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();

    if (data.statusCode && data.statusCode >= 400) {
      return error(data.message || 'Failed to delete template', data.statusCode);
    }
    return json({ ok: true });
  } catch (e) {
    return error('Failed to delete template: ' + e.message, 500);
  }
}
