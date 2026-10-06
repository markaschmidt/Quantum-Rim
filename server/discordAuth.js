import { createHmac, timingSafeEqual } from 'node:crypto';

export const FRAME_ANCESTORS_CSP = "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com https://*.discordapp.com";

function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

export function discordActivityOrigin(clientId) {
  const id = clean(clientId, 20);
  return /^\d{17,20}$/.test(id) ? `https://${id}.discordsays.com` : '';
}

export function allowedOrigins(env = process.env) {
  const origins = new Set(
    String(env.ALLOWED_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const activityOrigin = discordActivityOrigin(env.DISCORD_CLIENT_ID || env.VITE_DISCORD_CLIENT_ID);
  if (activityOrigin) origins.add(activityOrigin);
  return origins;
}

export function corsHeaders(req, env = process.env) {
  const origin = clean(req?.headers?.origin, 256);
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

function signingSecret(env) {
  const secret = String(env.SESSION_SECRET || env.DISCORD_CLIENT_SECRET || '');
  if (secret.length < 16) {
    throw Object.assign(new Error('Discord session signing is not configured'), { status: 503 });
  }
  return secret;
}

function signature(payload, env) {
  return createHmac('sha256', signingSecret(env))
    .update(`quantum-rim.v1.${payload}`)
    .digest('base64url');
}

function publicUser(profile) {
  return {
    id: clean(profile.id, 32),
    displayName: clean(profile.displayName, 80) || 'Discord Commander',
    username: clean(profile.username, 80) || null,
    avatarHash: clean(profile.avatarHash, 128) || null,
  };
}

export function createSession(profile, env = process.env, now = Date.now()) {
  const user = publicUser(profile);
  if (!/^\d{17,20}$/.test(user.id)) {
    throw Object.assign(new Error('Discord identity is invalid'), { status: 401 });
  }
  const hours = Math.max(1, Math.min(720, Number(env.SESSION_TTL_HOURS || 168)));
  const issuedAt = Math.floor(now / 1000);
  const expiresAtSeconds = issuedAt + Math.floor(hours * 3600);
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    sub: user.id,
    name: user.displayName,
    username: user.username,
    avatar: user.avatarHash,
    iat: issuedAt,
    exp: expiresAtSeconds,
  })).toString('base64url');
  return {
    token: `${payload}.${signature(payload, env)}`,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    user,
  };
}

export function verifySession(token, env = process.env, now = Date.now()) {
  const [payload, suppliedSignature, extra] = String(token || '').split('.');
  if (!payload || !suppliedSignature || extra || token.length > 4096) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }
  const expected = Buffer.from(signature(payload, env));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw Object.assign(new Error('Session is invalid'), { status: 401 });
  }

  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw Object.assign(new Error('Session is invalid'), { status: 401 }); }
  if (data.v !== 1 || !/^\d{17,20}$/.test(String(data.sub || ''))) {
    throw Object.assign(new Error('Session is invalid'), { status: 401 });
  }
  if (!Number.isFinite(data.exp) || data.exp <= Math.floor(now / 1000)) {
    throw Object.assign(new Error('Session expired'), { status: 401 });
  }
  return publicUser({
    id: data.sub,
    displayName: data.name,
    username: data.username,
    avatarHash: data.avatar,
  });
}

export function bearerToken(req) {
  const match = /^Bearer ([A-Za-z0-9_.-]{20,4096})$/.exec(String(req?.headers?.authorization || ''));
  return match?.[1] || '';
}

export async function exchangeDiscordCode(code, env = process.env, fetchImpl = fetch) {
  const clientId = clean(env.DISCORD_CLIENT_ID || env.VITE_DISCORD_CLIENT_ID, 20);
  const clientSecret = String(env.DISCORD_CLIENT_SECRET || '');
  if (!/^\d{17,20}$/.test(clientId) || !clientSecret) {
    throw Object.assign(new Error('Discord OAuth is not configured'), { status: 503 });
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: clean(code, 512),
  });
  if (env.DISCORD_REDIRECT_URI) form.set('redirect_uri', env.DISCORD_REDIRECT_URI);

  const tokenResponse = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) {
    throw Object.assign(new Error('Discord rejected the authorization code'), { status: 401 });
  }

  const userResponse = await fetchImpl('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user.id) {
    throw Object.assign(new Error('Could not read Discord identity'), { status: 401 });
  }

  return {
    accessToken: token.access_token,
    profile: {
      id: user.id,
      displayName: user.global_name || user.username || 'Discord Commander',
      username: user.username || null,
      avatarHash: user.avatar || null,
    },
  };
}
