import { DiscordSDK } from '@discord/embedded-app-sdk';
import '../discord-activity.css';
import {
  ACTIVITY_OAUTH_SCOPES,
  discordApiBase,
  discordClientId,
  isDiscordActivity,
} from './discordConfig.js';

const SESSION_KEY = 'quantum-rim-discord-session';
const LAUNCH_QUERY_KEY = 'quantum-rim-discord-launch-query';
let bootPromise = null;
let currentContext = { mode: 'web', user: null, sdk: null, auth: null };

function storage() {
  try { return window.sessionStorage; }
  catch { return null; }
}

function restoreActivityQuery() {
  const store = storage();
  const current = window.location.search;
  if (isDiscordActivity(current)) {
    store?.setItem(LAUNCH_QUERY_KEY, current);
    return current;
  }

  // Navigating from the landing page to simulation.html normally drops the
  // Discord query string. Session storage is origin- and tab-scoped, so it is
  // safe to restore that launch context for another page in the same iframe.
  const saved = store?.getItem(LAUNCH_QUERY_KEY) || '';
  if (isDiscordActivity(saved)) {
    const url = new URL(window.location.href);
    url.search = saved;
    window.history.replaceState(window.history.state, '', url);
    return saved;
  }
  return current;
}

function readSessionToken() {
  return storage()?.getItem(SESSION_KEY) || '';
}

function saveSessionToken(token) {
  if (token) storage()?.setItem(SESSION_KEY, token);
}

function clearSessionToken() {
  storage()?.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const base = discordApiBase(import.meta.env);
  const response = await fetch(`${base}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(readSessionToken() ? { Authorization: `Bearer ${readSessionToken()}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Discord request failed (${response.status})`);
  return payload;
}

function statusElement() {
  let element = document.getElementById('discord-activity-status');
  if (!element) {
    element = document.createElement('aside');
    element.id = 'discord-activity-status';
    element.className = 'discord-activity-status';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.append(element);
  }
  return element;
}

function setStatus(state, label, detail = '') {
  document.documentElement.dataset.discordActivity = state;
  const element = statusElement();
  element.dataset.state = state;
  element.replaceChildren();

  const mark = document.createElement('span');
  mark.className = 'discord-activity-status__mark';
  mark.textContent = '●';
  const copy = document.createElement('span');
  copy.className = 'discord-activity-status__copy';
  copy.textContent = label;
  element.append(mark, copy);
  element.title = detail;
}

async function connectDiscord() {
  setStatus('connecting', 'Discord · connecting');
  const clientId = discordClientId(import.meta.env);
  if (!/^\d{17,20}$/.test(clientId)) {
    throw new Error('VITE_DISCORD_CLIENT_ID is missing or invalid');
  }

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: [...ACTIVITY_OAUTH_SCOPES],
  });

  const session = await request('/api/auth/discord/exchange', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  const auth = await sdk.commands.authenticate({
    access_token: session.discordAccessToken || '',
  });
  if (!auth?.user || !session?.user || !session?.token) {
    throw new Error('Discord authentication returned an incomplete session');
  }

  // The Discord access token is used once by the SDK and is deliberately not
  // persisted. Only the signed Quantum Rim session survives page navigation.
  saveSessionToken(session.token);
  currentContext = { mode: 'discord', user: session.user, sdk, auth };
  window.quantumRimDiscord = currentContext;
  setStatus('ready', `Discord · ${session.user.displayName}`);
  window.dispatchEvent(new CustomEvent('quantum-rim:discord-ready', { detail: currentContext }));
  return currentContext;
}

async function restoreWebSession() {
  if (!readSessionToken()) return currentContext;
  try {
    const session = await request('/api/me');
    currentContext = { mode: 'session', user: session.user, sdk: null, auth: null };
    window.quantumRimDiscord = currentContext;
  } catch {
    clearSessionToken();
  }
  return currentContext;
}

export function bootDiscordActivity() {
  if (bootPromise) return bootPromise;
  const search = restoreActivityQuery();
  if (!isDiscordActivity(search)) {
    bootPromise = restoreWebSession();
    return bootPromise;
  }

  bootPromise = connectDiscord().catch((error) => {
    currentContext = { mode: 'error', user: null, sdk: null, auth: null, error };
    window.quantumRimDiscord = currentContext;
    setStatus('error', 'Discord · sign-in failed', error.message);
    console.error('Quantum Rim Discord Activity startup failed:', error);
    return currentContext;
  });
  return bootPromise;
}

export function getDiscordActivityContext() {
  return currentContext;
}
