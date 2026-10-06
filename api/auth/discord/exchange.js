import { corsHeaders, createSession, exchangeDiscordCode } from '../../../server/discordAuth.js';
import { readJson, sendJson } from '../../../server/http.js';

export default async function handler(req, res) {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {}, headers);
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' }, { ...headers, Allow: 'POST, OPTIONS' });

  try {
    const input = await readJson(req);
    if (typeof input.code !== 'string' || input.code.trim().length < 4) {
      throw Object.assign(new Error('Authorization code required'), { status: 400 });
    }
    const discord = await exchangeDiscordCode(input.code);
    const session = createSession(discord.profile);
    return sendJson(res, 200, { ...session, discordAccessToken: discord.accessToken }, headers);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.message || 'Discord sign-in failed' }, headers);
  }
}
