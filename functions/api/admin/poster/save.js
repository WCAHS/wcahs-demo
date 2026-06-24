import { json, error } from '../../_helpers.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  const formData = await request.formData();
  const file = formData.get('poster');
  if (!file || !file.size) return error('No poster image');

  const key = `posters/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.png`;

  await env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType: 'image/png' },
  });

  return json({ ok: true, url: `/api/images/${key}` });
}
