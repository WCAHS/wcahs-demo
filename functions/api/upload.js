import { json, error, verifyTurnstile } from './_helpers.js';

// Public photo upload for lost/found reports (max 5, max 10MB each)
export async function onRequestPost(context) {
  const { env, request } = context;

  const formData = await request.formData();
  const turnstileToken = formData.get('turnstile_token');

  if (!turnstileToken) return error('CAPTCHA required');
  const valid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
  if (!valid) return error('CAPTCHA verification failed', 403);

  const files = formData.getAll('photos');
  if (!files || files.length === 0) return error('No files uploaded');
  if (files.length > 5) return error('Maximum 5 photos allowed');

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  const urls = [];
  for (const file of files) {
    if (!file || !file.size) continue;
    if (!allowedTypes.includes(file.type)) return error('Only JPEG, PNG, and WebP images are allowed');
    if (file.size > maxSize) return error('Each file must be under 10MB');

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const key = `reports/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    await env.UPLOADS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    urls.push(`/api/images/${key}`);
  }

  return json({ ok: true, urls });
}
