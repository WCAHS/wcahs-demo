import { json, error } from '../../_helpers.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  const formData = await request.formData();
  const file = formData.get('photo');
  if (!file || !file.size) return error('No file uploaded');

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.includes(file.type)) return error('Only JPEG, PNG, and WebP images are allowed');
  if (file.size > maxSize) return error('File must be under 10MB');

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `pets/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

  await env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return json({ ok: true, url: `/api/images/${key}` });
}
