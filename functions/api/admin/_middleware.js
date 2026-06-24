import { error, getSession } from '../_helpers.js';

// Staff-allowed paths (read + write)
const STAFF_ALLOWED = [
  '/api/admin/submissions',
  '/api/admin/lost-found',
  '/api/admin/events',
  '/api/admin/pets',
  '/api/admin/change-password',
];

// Foster-allowed paths
const FOSTER_ALLOWED = [
  '/api/admin/foster-pets',
  '/api/admin/change-password',
  '/api/admin/pets/photo',
];

export async function onRequest(context) {
  const session = await getSession(context.request, context.env.DB);
  if (!session) {
    return error('Not authenticated', 401);
  }
  context.data.user = session;

  const url = new URL(context.request.url);
  const path = url.pathname;

  // Staff role restrictions
  if (session.role === 'staff') {
    const allowed = STAFF_ALLOWED.some(p => path.startsWith(p));
    if (!allowed) {
      return error('You don\'t have permission to access this', 403);
    }
  }

  // Foster role restrictions
  if (session.role === 'foster') {
    const allowed = FOSTER_ALLOWED.some(p => path.startsWith(p));
    if (!allowed) {
      return error('You don\'t have permission to access this', 403);
    }
  }

  return context.next();
}
