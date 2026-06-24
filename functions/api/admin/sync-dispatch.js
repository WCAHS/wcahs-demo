import { json, error } from '../_helpers.js';

export async function onRequestPost(context) {
  const { env } = context;
  const token = env.GH_DISPATCH_TOKEN;
  if (!token) return error('GitHub dispatch token not configured');

  try {
    const res = await fetch('https://api.github.com/repos/WCAHS/wcahs-demo/actions/workflows/shelterluv-sync.yml/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'WCAHS-Admin',
      },
      body: JSON.stringify({ ref: 'master' }),
    });

    if (res.status === 204) {
      return json({ ok: true, message: 'Sync triggered — results in ~15 seconds' });
    }
    const data = await res.json().catch(() => ({}));
    return error(data.message || 'GitHub returned ' + res.status);
  } catch (e) {
    return error('Failed to trigger sync: ' + e.message);
  }
}
