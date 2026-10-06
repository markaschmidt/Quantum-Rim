export const ACTIVITY_OAUTH_SCOPES = ['identify'];

export function discordClientId(env = {}) {
  return String(env.VITE_DISCORD_CLIENT_ID || '').trim();
}

export function discordApiBase(env = {}) {
  return String(env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
}

export function isDiscordActivity(search = '') {
  return new URLSearchParams(search).has('frame_id');
}
