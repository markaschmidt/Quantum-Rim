/** Clash-style imperial tax. Systems bank credits until the player collects them. */

import { isActive } from './facilities.js';

const CYCLE_MS = 5000;
const MINUTES_TO_FILL_PER_PLANET = 5;

export const CYCLES_TO_FILL_PER_PLANET = (MINUTES_TO_FILL_PER_PLANET * 60 * 1000) / CYCLE_MS;

export function taxablePlanetCount(system) {
  return (system?.planets || []).filter((planet) => planet.kind !== 'moon' && planet.type !== 'moon').length;
}

export function cyclesToFill(system, works) {
  const facilities = works?.facilities?.[system?.id] || {};
  const extra = (works?.skills?.['customs-charter'] || 0) * 4
    + (facilities['imperial-vault'] || 0) * 6;
  return CYCLES_TO_FILL_PER_PLANET * Math.max(1, taxablePlanetCount(system)) + extra;
}

function taxYieldMultiplier(works, system) {
  const facilities = works?.facilities?.[system?.id] || {};
  return 1 + (works?.skills?.['fiscal-survey'] || 0) * 0.08 + (facilities['customs-house'] || 0) * 0.15;
}

export function inhabitedPopulation(system) {
  return (system?.planets || []).reduce(
    (sum, planet) => sum + Math.max(0, Number(planet.population) || 0),
    0,
  );
}

export function taxPerCycle(system, works, sites = []) {
  const people = inhabitedPopulation(system);
  if (!system || people <= 0) return 0;
  const inhabited = system.planets.filter((planet) => planet.population > 0);
  const stability = inhabited.reduce((sum, planet) => sum + (planet.stability ?? 70), 0)
    / inhabited.length
    / 100;
  const wealth = system.wealth ?? 0.45;
  const security = system.security ?? 0.5;
  const compliance = 0.55 + security * 0.45;
  const port = (sites || []).find((site) => (
    site.systemId === system.id && site.type === 'port' && isActive(site)
  ));
  const portBonus = 1 + (port?.level || 0) * 0.06;
  const base = (people / 1_000_000) * 4 * wealth * stability * compliance;
  return Math.max(0, Math.round(base * taxYieldMultiplier(works, system) * portBonus));
}

export function taxCapacity(system, works, sites = []) {
  const rate = taxPerCycle(system, works, sites);
  return rate > 0 ? rate * cyclesToFill(system, works) : 0;
}

export function accrueSystemTaxes(coffers = {}, systems = {}, turns = 1, works, sites = []) {
  const steps = Math.max(0, Math.round(turns));
  const next = { ...coffers };
  if (steps === 0) return next;
  for (const system of Object.values(systems)) {
    const cap = taxCapacity(system, works, sites);
    const stored = Math.max(0, Math.round(next[system.id] || 0));
    if (cap <= 0) {
      next[system.id] = stored;
      continue;
    }
    next[system.id] = stored >= cap
      ? stored
      : Math.min(cap, stored + taxPerCycle(system, works, sites) * steps);
  }
  return next;
}

export function formatTaxBubble(value) {
  const amount = Math.max(0, Math.round(value || 0));
  if (amount >= 10000) {
    const thousands = amount / 1000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  return new Intl.NumberFormat('en-US').format(amount);
}
