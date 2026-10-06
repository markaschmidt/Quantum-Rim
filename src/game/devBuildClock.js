import { buildRow, FACILITY_TYPES } from './facilities.js';

const STORAGE_KEY = 'quantum-rim-dev-build-clock';
export const DEV_BUILD_MIN_MS = 3000;
export const DEV_BUILD_MAX_MS = 15000;

const listeners = new Set();
let bounds = null;

function cycleBounds() {
  if (bounds) return bounds;
  let min = Infinity;
  let max = 0;
  for (const type of FACILITY_TYPES) {
    for (let level = 1; level <= 5; level += 1) {
      const row = buildRow(type.id, level);
      min = Math.min(min, row.low);
      max = Math.max(max, row.high);
    }
  }
  bounds = { min, max: Math.max(max, min + 1) };
  return bounds;
}

export function limitBuildMs(cycles) {
  const { min, max } = cycleBounds();
  const t = Math.min(1, Math.max(0, (Number(cycles) - min) / (max - min)));
  return Math.round(DEV_BUILD_MIN_MS + t * (DEV_BUILD_MAX_MS - DEV_BUILD_MIN_MS));
}

export function devBuildClockEnabled() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDevBuildClockEnabled(enabled) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* private browsing */
  }
  listeners.forEach((listener) => listener());
}

export function subscribeDevBuildClock(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
