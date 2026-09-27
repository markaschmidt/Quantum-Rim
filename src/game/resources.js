export const DEFAULT_COMMODITIES = Object.freeze({
  food: 480,
  water: 620,
  energy: 740,
  alloys: 360,
  exoticMatter: 28,
});

export const RESOURCE_LABELS = Object.freeze({
  food: 'Food',
  water: 'Water',
  energy: 'Energy',
  alloys: 'Alloys',
  exoticMatter: 'Exotic Matter',
});

export const BASE_PRICES = Object.freeze({
  food: 8,
  water: 6,
  energy: 10,
  alloys: 24,
  exoticMatter: 180,
});

export function clampAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function applyResourceDelta(ledger, delta = {}) {
  return applyResourceTransaction(ledger, delta).ledger;
}

export function applyResourceTransaction(ledger, delta = {}) {
  const commodities = { ...ledger.commodities };
  const appliedCommodities = {};
  for (const [resource, amount] of Object.entries(delta.commodities || {})) {
    if (!(resource in DEFAULT_COMMODITIES)) continue;
    const before = commodities[resource] || 0;
    const after = clampAmount(before + amount);
    commodities[resource] = after;
    appliedCommodities[resource] = after - before;
  }
  const credits = clampAmount(ledger.credits + (delta.credits || 0));
  return {
    ledger: { credits, commodities },
    appliedDelta: {
      credits: credits - ledger.credits,
      commodities: appliedCommodities,
    },
  };
}

export function calculateCrisisLoss(event, performance = 0.5) {
  const severity = Math.max(0, Math.min(1, event.severity || 0));
  const protection = Math.max(0, Math.min(1, performance));
  const exposed = severity * (1 - protection * 0.78);
  const activity = event.activityId || '';
  const base = {
    credits: -Math.round(900 + exposed * 8600),
    commodities: {},
  };

  if (activity.includes('supply') || activity.includes('manifest')) {
    base.commodities.food = -Math.round(18 + exposed * 90);
    base.commodities.water = -Math.round(8 + exposed * 38);
  } else if (activity.includes('asteroid') || activity.includes('debris')) {
    base.commodities.alloys = -Math.round(12 + exposed * 70);
    base.commodities.energy = -Math.round(10 + exposed * 48);
  } else if (activity.includes('magnetic') || activity.includes('aurora')) {
    base.commodities.energy = -Math.round(22 + exposed * 95);
    base.commodities.water = -Math.round(4 + exposed * 26);
  } else {
    base.commodities.energy = -Math.round(8 + exposed * 44);
    base.commodities.food = -Math.round(5 + exposed * 30);
  }
  return base;
}

export function calculateMarketPrice(resource, settlement, route = {}) {
  const base = BASE_PRICES[resource] || 10;
  const supply = Math.max(1, settlement.storage?.[resource] || 0);
  const demand = Math.max(1, settlement.consumption?.[resource] || 0);
  const scarcity = Math.max(0.55, Math.min(3, (demand * 8) / supply));
  const distance = 1 + Math.max(0, route.distance || 0) * 0.025;
  const danger = 1 + Math.max(0, route.danger || 0) * 0.45;
  const tariff = 1 + Math.max(0, route.tariff || 0);
  const access = route.status === 'closed' ? 2.5 : 1 + (1 - (route.capacity || 100) / 100) * 0.4;
  return Math.round(base * scarcity * distance * danger * tariff * access);
}

export function advanceSettlementEconomy(settlement) {
  const storage = { ...settlement.storage };
  const shortages = [];
  for (const resource of Object.keys(DEFAULT_COMMODITIES)) {
    const produced = settlement.production?.[resource] || 0;
    const consumed = settlement.consumption?.[resource] || 0;
    storage[resource] = clampAmount((storage[resource] || 0) + produced - consumed);
    if (storage[resource] < consumed * 2) shortages.push(resource);
  }
  const stabilityDelta = shortages.length ? -shortages.length * 1.5 : 0.4;
  return {
    ...settlement,
    storage,
    stability: Math.max(0, Math.min(100, settlement.stability + stabilityDelta)),
    shortages,
    prices: Object.fromEntries(
      Object.keys(DEFAULT_COMMODITIES).map((resource) => [
        resource,
        calculateMarketPrice(resource, { ...settlement, storage }),
      ]),
    ),
  };
}

export function formatCredits(value) {
  return `${new Intl.NumberFormat('en-US').format(clampAmount(value))} IC`;
}
