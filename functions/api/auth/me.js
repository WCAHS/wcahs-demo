import { json, error, getSession } from '../_helpers.js';

export async function onRequestGet(context) {
  const session = await getSession(context.request, context.env.DB);
  if (!session) return error('Not authenticated', 401);
  return json({ username: session.username, role: session.role });
}
