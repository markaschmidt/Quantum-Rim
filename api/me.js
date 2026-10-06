import { bearerToken, corsHeaders, verifySession } from '../server/discordAuth.js';
import { sendJson } from '../server/http.js';

export default async function handler(req, res) {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {}, headers);
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' }, { ...headers, Allow: 'GET, OPTIONS' });
  try {
    return sendJson(res, 200, { user: verifySession(bearerToken(req)) }, headers);
  } catch (error) {
    return sendJson(res, error.status || 401, { error: error.message || 'Authentication required' }, headers);
  }
}
