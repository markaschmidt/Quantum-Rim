import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedOrigins,
  createSession,
  discordActivityOrigin,
  exchangeDiscordCode,
  verifySession,
} from '../server/discordAuth.js';
import { ACTIVITY_OAUTH_SCOPES, discordClientId, isDiscordActivity } from '../src/services/discordConfig.js';

const env = {
  DISCORD_CLIENT_ID: '1556122858298810400',
  DISCORD_CLIENT_SECRET: 'test-secret-that-is-long-enough',
  SESSION_TTL_HOURS: '2',
  ALLOWED_ORIGINS: 'https://quantum-rim.example,http://localhost:5173',
};

test('Activity config uses an identify-only authorization code flow', () => {
  assert.deepEqual(ACTIVITY_OAUTH_SCOPES, ['identify']);
  assert.equal(discordClientId({ VITE_DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID }), env.DISCORD_CLIENT_ID);
  assert.equal(isDiscordActivity('?frame_id=frame&instance_id=instance'), true);
  assert.equal(isDiscordActivity(''), false);
});

test('signed sessions reject tampering and expiry', () => {
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const session = createSession({
    id: '123456789012345678',
    displayName: 'Nova',
    username: 'nova',
    avatarHash: 'hash',
  }, env, now);
  assert.equal(verifySession(session.token, env, now + 1_000).displayName, 'Nova');
  assert.throws(() => verifySession(`${session.token}x`, env, now), /invalid/i);
  assert.throws(() => verifySession(session.token, env, now + 2 * 3_600_000), /expired/i);
});

test('Discord proxy origin is automatically allowed', () => {
  const origin = discordActivityOrigin(env.DISCORD_CLIENT_ID);
  assert.equal(origin, 'https://1556122858298810400.discordsays.com');
  const origins = allowedOrigins(env);
  assert.equal(origins.has(origin), true);
  assert.equal(origins.has('https://quantum-rim.example'), true);
});

test('OAuth code exchange keeps the client secret on the server', async () => {
  const calls = [];
  const mockFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'discord-access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      id: '123456789012345678',
      username: 'nova',
      global_name: 'Nova Commander',
      avatar: 'avatar-hash',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await exchangeDiscordCode('one-time-code', env, mockFetch);
  assert.equal(result.profile.displayName, 'Nova Commander');
  assert.equal(result.accessToken, 'discord-access-token');
  assert.equal(calls.length, 2);
  assert.match(String(calls[0].options.body), /client_secret=test-secret-that-is-long-enough/);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer discord-access-token');
});
