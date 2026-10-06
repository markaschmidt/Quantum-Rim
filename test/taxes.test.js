import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: (key) => saved.delete(key),
};
globalThis.window = { localStorage: globalThis.localStorage };

const { createGalaxySeed } = await import('../src/game/galaxySeed.js');
const { accrueSystemTaxes, taxCapacity, taxPerCycle } = await import('../src/game/taxes.js');
const { useStrategicStore } = await import('../src/store/useStrategicStore.js');

beforeEach(() => {
  saved.clear();
  useStrategicStore.getState().resetCampaign();
});

test('inhabited systems bank tax and stop at a collector cap', () => {
  const galaxy = createGalaxySeed();
  const aurelia = galaxy.systems.aurelia;
  const rate = taxPerCycle(aurelia);
  const cap = taxCapacity(aurelia);
  assert.ok(rate > 0);
  assert.equal(aurelia.planets.length, 2);
  assert.equal(cap, rate * 60 * 2);
  const onePlanet = { ...aurelia, planets: [aurelia.planets[0]] };
  assert.equal(taxCapacity(onePlanet) / taxPerCycle(onePlanet), 60);
  const withMoon = {
    ...onePlanet,
    planets: [aurelia.planets[0], { ...aurelia.planets[1], type: 'moon', kind: 'moon' }],
  };
  assert.equal(taxCapacity(withMoon) / taxPerCycle(withMoon), 60);
  assert.ok(taxPerCycle(galaxy.systems.aurelia) > taxPerCycle(galaxy.systems.nyx));

  const empty = galaxy.systems.nyx.planets.find((planet) => planet.population <= 0);
  assert.ok(empty);
  const barren = { ...galaxy.systems.nyx, planets: [empty] };
  assert.equal(taxPerCycle(barren), 0);

  let coffers = accrueSystemTaxes({}, galaxy.systems, 1);
  assert.equal(coffers.aurelia, rate);
  coffers = accrueSystemTaxes({ aurelia: cap - 5 }, galaxy.systems, 3);
  assert.equal(coffers.aurelia, cap);
  coffers = accrueSystemTaxes({ aurelia: cap + 40 }, galaxy.systems, 2);
  assert.equal(coffers.aurelia, cap + 40);
});

test('skill purchases spend credits and locked ranks stay closed', () => {
  const { purchaseSkill } = useStrategicStore.getState();
  const start = useStrategicStore.getState().treasury.credits;
  assert.equal(purchaseSkill('customs-charter').reason, 'locked');
  assert.equal(purchaseSkill('fiscal-survey').ok, true);
  assert.equal(useStrategicStore.getState().imperialWorks.skills['fiscal-survey'], 1);
  assert.ok(useStrategicStore.getState().treasury.credits < start);
  assert.equal(purchaseSkill('customs-charter').ok, true);
});

test('collecting a system coffer pays the imperial treasury and empties only that system', () => {
  const { advanceStrategicTime, collectSystemTax } = useStrategicStore.getState();
  const before = useStrategicStore.getState().treasury.credits;
  advanceStrategicTime(1);
  const stored = useStrategicStore.getState().taxCoffers.aurelia;
  assert.ok(stored > 0);
  const paid = collectSystemTax('aurelia');
  assert.equal(paid, stored);
  assert.equal(useStrategicStore.getState().taxCoffers.aurelia, 0);
  assert.equal(useStrategicStore.getState().treasury.credits, before + stored);
  assert.ok((useStrategicStore.getState().taxCoffers.bastion || 0) > 0);
});
