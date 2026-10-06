import { corsHeaders, discordActivityOrigin } from '../server/discordAuth.js';
import { sendJson } from '../server/http.js';

export default async function handler(req, res) {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {}, headers);
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' }, { ...headers, Allow: 'GET, OPTIONS' });
  const clientId = process.env.DISCORD_CLIENT_ID || process.env.VITE_DISCORD_CLIENT_ID || '';
  return sendJson(res, 200, {
    status: 'ok',
    service: 'quantum-rim-discord',
    discordConfigured: Boolean(clientId && process.env.DISCORD_CLIENT_SECRET),
    discordActivityOrigin: discordActivityOrigin(clientId),
    sessionConfigured: Boolean(process.env.SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET),
  }, headers);
}
