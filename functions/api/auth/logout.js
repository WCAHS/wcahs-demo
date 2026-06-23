import { json, getSession } from '../_helpers.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const session = await getSession(request, env.DB);
  if (session) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'wcahs_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    },
  });
}
