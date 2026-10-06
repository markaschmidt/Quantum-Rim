/** Imperial sites: graded costs, and a seeded Monte Carlo build table. */

import { hasRareDeposit } from './deposits.js';

function hashUnit(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export const FACILITY_TYPES = Object.freeze([
  { id: 'mining', name: 'Mining rig', detail: 'Pulls the deposit of the system it sits on. Drag it to another seam. Its hold has no ceiling.', baseCycles: 4, capBase: 2, capMax: 6 },
  { id: 'processing', name: 'Processing yard', detail: 'Refines the local seam into a stockpile with no ceiling. Drag it between systems.', baseCycles: 5, capBase: 2, capMax: 6 },
  { id: 'extraction', name: 'Extraction tower', detail: 'Draws a deeper cut of the same seam. Drag it, and the hold never fills.', baseCycles: 5, capBase: 2, capMax: 6 },
  { id: 'research', name: 'Research lab', detail: 'Completed ranks are the only way the government level rises.', baseCycles: 8, capBase: 1, capMax: 4 },
  { id: 'fleet', name: 'Defense fleet', detail: 'Lowers invasion weight, severity, and credit losses here.', baseCycles: 6, capBase: 1, capMax: 4 },
  { id: 'medical', name: 'Medical station', detail: 'Lowers population loss from unrest, debris, and incursions here.', baseCycles: 5, capBase: 1, capMax: 4 },
  { id: 'port', name: 'Transit hub', detail: 'A port. Raises local tax, shortens rig moves, and adds warning cycles.', baseCycles: 5, capBase: 1, capMax: 4 },
]);

const COSTS = {
  processing: [
    { credits: 9000, commodities: { durasteel: 28, tibanna: 12 } },
    { credits: 16000, commodities: { doonium: 18, tibanna: 16 } },
    { credits: 26000, commodities: { doonium: 22, coaxium: 8 } },
    { credits: 40000, commodities: { beskar: 12, coaxium: 10 } },
    { credits: 56000, commodities: { beskar: 10, kyber: 6, cortosis: 4 } },
  ],
  extraction: [
    { credits: 11000, commodities: { durasteel: 36, doonium: 10 } },
    { credits: 18000, commodities: { doonium: 20, tibanna: 14 } },
    { credits: 30000, commodities: { doonium: 18, beskar: 8 } },
    { credits: 44000, commodities: { beskar: 14, coaxium: 8 } },
    { credits: 62000, commodities: { beskar: 12, cortosis: 8, kyber: 4 } },
  ],
  mining: [
    { credits: 8000, commodities: { durasteel: 40 } },
    { credits: 14000, commodities: { durasteel: 30, tibanna: 24 } },
    { credits: 22000, commodities: { doonium: 28, tibanna: 20 } },
    { credits: 36000, commodities: { beskar: 16, coaxium: 12 } },
    { credits: 52000, commodities: { beskar: 12, coaxium: 10, kyber: 6 } },
  ],
  research: [
    { credits: 10000, commodities: { durasteel: 20, kyber: 4 } },
    { credits: 18000, commodities: { tibanna: 16, kyber: 8 } },
    { credits: 28000, commodities: { hypermatter: 10, kyber: 12 } },
    { credits: 42000, commodities: { coaxium: 8, kyber: 16 } },
    { credits: 60000, commodities: { beskar: 8, kyber: 20, cortosis: 6 } },
  ],
  fleet: [
    { credits: 12000, commodities: { durasteel: 36, doonium: 8 } },
    { credits: 20000, commodities: { doonium: 24, tibanna: 16 } },
    { credits: 32000, commodities: { doonium: 20, beskar: 12 } },
    { credits: 48000, commodities: { beskar: 16, cortosis: 8 } },
    { credits: 64000, commodities: { beskar: 14, cortosis: 12, coaxium: 8 } },
  ],
  medical: [
    { credits: 7000, commodities: { food: 40, water: 40 } },
    { credits: 12000, commodities: { food: 30, water: 30, tibanna: 10 } },
    { credits: 18000, commodities: { tibanna: 18, hypermatter: 8 } },
    { credits: 28000, commodities: { hypermatter: 12, kyber: 4 } },
    { credits: 40000, commodities: { hypermatter: 10, kyber: 8, coaxium: 6 } },
  ],
  port: [
    { credits: 9000, commodities: { durasteel: 48 } },
    { credits: 15000, commodities: { durasteel: 24, doonium: 16 } },
    { credits: 24000, commodities: { doonium: 22, tibanna: 12 } },
    { credits: 36000, commodities: { doonium: 16, coaxium: 10 } },
    { credits: 50000, commodities: { beskar: 10, coaxium: 14 } },
  ],
};

const timeCache = new Map();

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function samplesFor(type, level) {
  const spec = FACILITY_TYPES.find((item) => item.id === type);
  const base = spec?.baseCycles || 5;
  if (level <= 1) {
    return Array.from({ length: 64 }, (_, index) => base * (0.85 + hashUnit(`${type}:1:${index}`) * 0.3));
  }
  const previous = buildRow(type, level - 1).median;
  return Array.from({ length: 64 }, (_, index) => (
    previous * 1.55 * (0.85 + hashUnit(`${type}:${level}:${index}`) * 0.3)
  ));
}

export function buildRow(type, level) {
  const key = `${type}:${level}`;
  if (timeCache.has(key)) return timeCache.get(key);
  const samples = samplesFor(type, level);
  const row = {
    type,
    level,
    median: median(samples),
    low: percentile(samples, 0.1),
    high: percentile(samples, 0.9),
    cost: COSTS[type][level - 1],
  };
  timeCache.set(key, row);
  return row;
}

export function buildTable(type) {
  return [1, 2, 3, 4, 5].map((level) => buildRow(type, level));
}

export function committedCycles(type, level, system) {
  const row = buildRow(type, level);
  const surcharge = system && hasRareDeposit(system) && system.zone === 'outer' ? 2 : 0;
  return Math.max(1, Math.round(row.median + surcharge));
}

export function isActive(site) {
  return Boolean(
    site && site.level > 0 && !site.building && !site.transit && !site.sortie && !site.offline,
  );
}

export function governmentLevel(sites = []) {
  const ranks = (sites || []).filter((site) => site.type === 'research' && site.level > 0 && !site.transit)
    .reduce((sum, site) => sum + site.level, 0);
  return 1 + ranks;
}

export function facilityCap(type, level = 1) {
  const spec = FACILITY_TYPES.find((item) => item.id === type);
  if (!spec) return 0;
  return Math.min(spec.capMax, spec.capBase + Math.max(0, level - 1));
}

export function unlockedLevel(type, level) {
  return Math.min(5, Math.max(1, level));
}

export function sitesOfType(sites, type) {
  return (sites || []).filter((site) => site.type === type);
}

export function siteAt(sites, systemId, type) {
  return (sites || []).find((site) => site.systemId === systemId && site.type === type) || null;
}

export function rankAt(sites, systemId, type) {
  const site = (sites || []).find((item) => item.systemId === systemId && item.type === type && isActive(item));
  return site?.level || 0;
}

export function missingRequirement(ledger, cost) {
  if (!cost) return 'maxed';
  if ((ledger?.credits || 0) < cost.credits) return 'credits';
  for (const [resource, amount] of Object.entries(cost.commodities || {})) {
    if ((ledger?.commodities?.[resource] || 0) < amount) return resource;
  }
  return null;
}

export function buildOffer(sites, system, type) {
  const gov = governmentLevel(sites);
  const existing = system ? siteAt(sites, system.id, type) : null;
  const current = existing?.level || 0;
  const cap = facilityCap(type, gov);
  const occupied = sitesOfType(sites, type).length;
  const nextLevel = current + 1;
  if (existing?.building) return { ok: false, reason: 'building', current, gov };
  if (existing?.transit) return { ok: false, reason: 'transit', current, gov };
  if (existing?.sortie) return { ok: false, reason: 'sortie', current, gov };
  if (existing?.offline) return { ok: false, reason: 'offline', current, gov };
  if (!existing && occupied >= cap) return { ok: false, reason: 'cap', current, gov, cap };
  if (nextLevel > 5) return { ok: false, reason: 'maxed', current, gov };
  if (nextLevel > unlockedLevel(type, gov)) return { ok: false, reason: 'level', current, gov };
  const row = buildRow(type, nextLevel);
  return {
    ok: true,
    current,
    nextLevel,
    gov,
    cap,
    cost: row.cost,
    cycles: committedCycles(type, nextLevel, system),
    spread: [Math.round(row.low), Math.round(row.high)],
  };
}

export function completeDevBuilds(sites = [], now = Date.now()) {
  let changed = false;
  const next = sites.map((site) => {
    if (!site.building?.readyAt || site.building.readyAt > now) return site;
    changed = true;
    return { ...site, level: site.building.targetLevel, building: null };
  });
  return changed ? next : sites;
}

export function tickSites(sites = [], turns = 1) {
  const steps = Math.max(0, Math.round(turns));
  return sites.map((site) => {
    let next = site;
    if (next.building?.readyAt) {
      if (Date.now() >= next.building.readyAt) {
        next = { ...next, level: next.building.targetLevel, building: null };
      }
    } else if (next.building) {
      const left = next.building.cyclesRemaining - steps;
      next = left <= 0
        ? { ...next, level: next.building.targetLevel, building: null }
        : { ...next, building: { ...next.building, cyclesRemaining: left } };
    }
    if (next.transit) {
      const left = next.transit.cyclesRemaining - steps;
      next = left <= 0
        ? { ...next, systemId: next.transit.toSystemId, transit: null }
        : { ...next, transit: { ...next.transit, cyclesRemaining: left } };
    }
    if (next.offline) {
      const left = next.offline.cyclesRemaining - steps;
      next = left <= 0
        ? { ...next, offline: null }
        : { ...next, offline: { ...next.offline, cyclesRemaining: left } };
    }
    return next;
  });
}

export const HAULERS = new Set(['mining', 'processing', 'extraction']);

export function haulerRate(type) {
  if (type === 'processing') return 0.55;
  if (type === 'extraction') return 0.8;
  if (type === 'mining') return 1;
  return 0;
}

export function miningYield(sites, galaxy, turns = 1) {
  const commodities = {};
  const steps = Math.max(0, Math.round(turns));
  for (const site of sites || []) {
    const rate = haulerRate(site.type);
    if (!rate || !isActive(site)) continue;
    const mix = galaxy?.systems?.[site.systemId]?.deposits || {};
    for (const [resource, amount] of Object.entries(mix)) {
      commodities[resource] = (commodities[resource] || 0) + amount * site.level * steps * rate;
    }
  }
  return commodities;
}

export function accrueSiteStock(sites, galaxy, turns = 1) {
  const steps = Math.max(0, Math.round(turns));
  return (sites || []).map((site) => {
    const rate = haulerRate(site.type);
    if (!rate || !isActive(site)) return site;
    const mix = galaxy?.systems?.[site.systemId]?.deposits || {};
    const stock = { ...(site.stock || {}) };
    for (const [resource, amount] of Object.entries(mix)) {
      stock[resource] = (stock[resource] || 0) + amount * site.level * steps * rate;
    }
    return { ...site, stock };
  });
}

export function transitCycles(galaxy, fromId, toId, sites = []) {
  const route = (galaxy?.routes || []).find((item) => (
    (item.from === fromId && item.to === toId) || (item.from === toId && item.to === fromId)
  ));
  let cycles = route?.distance || 8;
  const relief = Math.max(rankAt(sites, fromId, 'port'), rankAt(sites, toId, 'port'));
  if (relief) cycles = Math.max(1, cycles - relief);
  return cycles;
}
