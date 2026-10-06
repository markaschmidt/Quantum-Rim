import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: (key) => saved.delete(key),
};
globalThis.window = { localStorage: globalThis.localStorage };

const { createGalaxySeed, findPlanet } = await import('../src/game/galaxySeed.js');
const { createLocalExpeditionPlan } = await import('../src/game/expeditions.js');
const {
  DEFAULT_COMMODITIES,
  applyResourceTransaction,
  calculateMarketPrice,
} = await import('../src/game/resources.js');
const { useStrategicStore } = await import('../src/store/useStrategicStore.js');
const { planetVisualClass, planetVisualProperties } = await import('../src/game/planetVisual.js');
const {
  automaticRiskProfile,
  chooseAutomaticEventTarget,
  shouldTriggerIntermittentEvent,
} = await import('../src/game/eventDirector.js');

beforeEach(() => {
  saved.clear();
  useStrategicStore.getState().resetCampaign();
});

test('galaxy seed preserves the required strategic hierarchy', () => {
  const galaxy = createGalaxySeed();
  assert.deepEqual(Object.keys(galaxy.zones), ['core', 'inner', 'outer']);
  assert.ok(Object.keys(galaxy.systems).length >= 8);
  for (const system of Object.values(galaxy.systems)) {
    assert.ok(galaxy.zones[system.zone]);
    assert.ok(system.planets.length > 0);
    for (const planet of system.planets) {
      assert.equal(planet.systemId, system.id);
      assert.ok(Array.isArray(planet.history));
    }
  }
});

test('every seeded planet receives a visible atmospheric baseline', () => {
  const galaxy = createGalaxySeed();
  for (const system of Object.values(galaxy.systems)) {
    for (const planet of system.planets) {
      const visual = planetVisualProperties(planet);
      assert.match(visual['--planet-color'], /^#[0-9a-f]{6}$/i);
      assert.match(visual['--planet-light'], /^#[0-9a-f]{6}$/i);
      assert.ok(Number(visual['--planet-atmosphere-opacity']) >= 0.2);
      assert.ok(['rocky', 'ice', 'gas'].includes(planetVisualClass(planet)));
    }
  }
});

test('resource transactions clamp inventory and report only the applied delta', () => {
  assert.deepEqual(Object.keys(DEFAULT_COMMODITIES), [
    'food', 'water', 'plasmaCells', 'tibanna', 'coaxium', 'durasteel', 'doonium', 'beskar', 'hypermatter', 'kyber', 'cortosis',
  ]);
  const result = applyResourceTransaction(
    { credits: 50, commodities: { ...DEFAULT_COMMODITIES, food: 10 } },
    { credits: -80, commodities: { food: -40, plasmaCells: 10 } },
  );
  assert.equal(result.ledger.credits, 0);
  assert.equal(result.appliedDelta.credits, -50);
  assert.equal(result.ledger.commodities.food, 0);
  assert.equal(result.appliedDelta.commodities.food, -10);
  assert.equal(result.appliedDelta.commodities.plasmaCells, 10);
});

test('market price responds to distance, danger, tariffs, and access', () => {
  const settlement = { storage: { food: 40 }, consumption: { food: 20 } };
  const local = calculateMarketPrice('food', settlement, {
    distance: 1, danger: 0.05, tariff: 0, capacity: 100, status: 'open',
  });
  const disrupted = calculateMarketPrice('food', settlement, {
    distance: 12, danger: 0.9, tariff: 0.3, capacity: 10, status: 'closed',
  });
  assert.ok(disrupted > local);
});

test('crisis resolution is idempotent and persists consequences', () => {
  const state = useStrategicStore.getState();
  const planet = findPlanet(state.galaxy, state.selectedPlanetId);
  const event = state.createCrisis(planet, {
    generated: {
      event_type: 'asteroid-collision',
      severity: 0.8,
      activity: { id: 'asteroid-interception' },
      provenance: [],
    },
  });
  const before = useStrategicStore.getState();
  const first = before.resolveActivity(event.id, 0.85, {
    resourceCost: { plasmaCells: 20, durasteel: 10 },
  });
  const after = useStrategicStore.getState();
  const second = after.resolveActivity(event.id, 0.85, {
    resourceCost: { plasmaCells: 20, durasteel: 10 },
  });
  const resolvedPlanet = findPlanet(after.galaxy, planet.id);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(resolvedPlanet.history.length, 1);
  assert.equal(after.auditLog.length, 1);
  assert.ok(after.treasury.credits < before.treasury.credits);
  assert.equal(after.events.find((item) => item.id === event.id).status, 'resolved');
});

test('resource-backed activities cannot receive unfunded protection', () => {
  const state = useStrategicStore.getState();
  const planet = findPlanet(state.galaxy, state.selectedPlanetId);
  useStrategicStore.setState({
    treasury: { ...state.treasury, commodities: { ...state.treasury.commodities, plasmaCells: 0, durasteel: 0 } },
  });
  const event = useStrategicStore.getState().createCrisis(planet, {
    generated: {
      event_type: 'asteroid-collision',
      severity: 0.9,
      activity: { id: 'asteroid-interception' },
      provenance: [],
    },
  });
  useStrategicStore.getState().resolveActivity(event.id, 1, {
    resourceCost: { plasmaCells: 30, durasteel: 20 },
  });
  const resolved = useStrategicStore.getState().events.find((item) => item.id === event.id);
  assert.equal(resolved.resourceCoverage, 0);
  assert.equal(resolved.performance, 0);
});

test('completed Atlas aftermath updates the persistent planet texture and provenance', () => {
  const state = useStrategicStore.getState();
  const planet = findPlanet(state.galaxy, state.selectedPlanetId);
  const event = state.createCrisis(planet, {
    generated: {
      event_type: 'magnetic-pole-shift',
      severity: 0.6,
      activity: { id: 'magnetic-field-alignment' },
      provenance: [],
    },
  });
  state.resolveActivity(event.id, 0.8);
  useStrategicStore.getState().beginQuantumExecution(event.id);
  useStrategicStore.getState().applyQuantumExecution(event.id, {
    execution_id: 'event-live-1',
    status: 'complete',
    results: [{
      engine: 'tessa-image',
      execution_id: 'job-live-1',
      mode: 'emulator',
      derived_state: {
        purpose: 'Transform atmosphere',
        texture_url: 'https://storage.example/planet.png',
      },
    }],
  });

  const after = useStrategicStore.getState();
  const transformed = findPlanet(after.galaxy, planet.id);
  const resolved = after.events.find((item) => item.id === event.id);
  assert.equal(transformed.textureUrl, 'https://storage.example/planet.png');
  assert.equal(resolved.quantumExecutionStatus, 'complete');
  assert.equal(resolved.quantum.at(-1).verified, true);
  assert.equal(transformed.history.at(-1).textureUrl, transformed.textureUrl);
});

test('ignored crises resolve once at their deadline', () => {
  const state = useStrategicStore.getState();
  const planet = findPlanet(state.galaxy, state.selectedPlanetId);
  const event = state.createCrisis(planet);
  useStrategicStore.getState().advanceStrategicTime(9);
  const after = useStrategicStore.getState();
  const resolved = after.events.find((item) => item.id === event.id);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.autoResolved, true);
  assert.equal(after.auditLog.length, 1);
  after.advanceStrategicTime(3);
  assert.equal(useStrategicStore.getState().auditLog.length, 1);
});

test('event director respects cooldowns, caps, and forced event windows', () => {
  assert.equal(shouldTriggerIntermittentEvent({
    turn: 3, activeEventCount: 0, lastCreatedTurn: 0,
  }), false);
  assert.equal(shouldTriggerIntermittentEvent({
    turn: 12, activeEventCount: 3, lastCreatedTurn: 0,
  }), false);
  assert.equal(shouldTriggerIntermittentEvent({
    turn: 8, activeEventCount: 0, lastCreatedTurn: 0,
  }), true);
});

test('automatic events target risk and include small-body collision pressure', () => {
  const state = useStrategicStore.getState();
  const target = chooseAutomaticEventTarget(state.galaxy, 8);
  const risk = automaticRiskProfile(state.galaxy, target, 8);
  assert.ok(target?.planet?.id);
  assert.ok(risk.debris_congestion >= 0.62 && risk.debris_congestion <= 0.96);
  assert.ok(risk.asteroid_exposure >= 0);
});

test('local expedition fallback is connected and bounded', () => {
  const galaxy = createGalaxySeed();
  const system = galaxy.systems.orison;
  const planet = system.planets[0];
  const plan = createLocalExpeditionPlan(planet, system);
  assert.ok(plan.nodes.length >= 7 && plan.nodes.length <= 8);
  assert.equal(plan.nodes.filter((node) => node.kind === 'exit').length, 1);
  assert.equal(plan.provenance.mode, 'classical-fallback');
  const edges = new Set(plan.edges.map((edge) => edge.join(':')));
  for (let index = 0; index < plan.nodes.length - 1; index += 1) {
    assert.ok(edges.has(`${index}:${index + 1}`));
  }
});

test('completed expedition writes findings into planet history', () => {
  const state = useStrategicStore.getState();
  const planet = findPlanet(state.galaxy, state.selectedPlanetId);
  const expedition = state.createExpedition(planet, {
    expedition_id: 'test-expedition',
    title: 'Test ruins expedition',
    nodes: [
      { id: 0, label: 'Entry', kind: 'entry', risk: 0, reward: 0 },
      { id: 1, label: 'Archive', kind: 'archive', risk: 0, reward: 0.8 },
      { id: 2, label: 'Exit', kind: 'exit', risk: 0, reward: 0.2 },
    ],
    edges: [[0, 1], [1, 2]],
    crew_roles: ['scout', 'scientist'],
    provenance: { engine: 'labyrinth', operation: 'Topology', mode: 'classical-fallback' },
  });
  assert.ok(expedition);
  assert.equal(useStrategicStore.getState().chooseExpeditionNode(expedition.id, 1, 'scan').success, true);
  const result = useStrategicStore.getState().chooseExpeditionNode(expedition.id, 2, 'scan');
  assert.equal(result.completed, true);
  const finalState = useStrategicStore.getState();
  const completed = finalState.expeditions.find((item) => item.id === expedition.id);
  const updatedPlanet = findPlanet(finalState.galaxy, planet.id);
  assert.equal(completed.status, 'completed');
  assert.equal(updatedPlanet.history.at(-1).eventType, 'expedition');
  assert.ok(updatedPlanet.settlements[0].activeProjects.includes('Study Exit'));
});

test('a version 6 campaign keeps its republic and folds old stocks into common grades', async () => {
  const galaxy = createGalaxySeed();
  delete galaxy.systems.aurelia.deposits;
  galaxy.systems.aurelia.planets[0].settlements[0].storage = { energy: 9, food: 3 };
  saved.set('quantum-rim-strategic-state', JSON.stringify({
    version: 6,
    state: {
      schemaVersion: 6,
      galaxy,
      treasury: { credits: 4242, commodities: { food: 11, water: 4, energy: 30, alloys: 20, exoticMatter: 5 } },
      taxCoffers: { aurelia: 15 },
      imperialWorks: { skills: { 'early-warning': 1 }, facilities: {} },
      events: [{ id: 'kept-event' }],
      expeditions: [{ id: 'kept-expedition' }],
      auditLog: [{ id: 'kept-log' }],
      strategicTurn: 17,
    },
  }));
  await useStrategicStore.persist.rehydrate();
  const state = useStrategicStore.getState();
  assert.equal(state.schemaVersion, 8);
  assert.equal(state.treasury.credits, 4242);
  assert.equal(state.treasury.commodities.plasmaCells, 30);
  assert.equal(state.treasury.commodities.durasteel, 20);
  assert.equal(state.treasury.commodities.hypermatter, 5);
  assert.equal(state.treasury.commodities.food, 11);
  assert.equal(state.strategicTurn, 17);
  assert.equal(state.events[0].id, 'kept-event');
  assert.equal(state.expeditions[0].id, 'kept-expedition');
  assert.equal(state.auditLog[0].id, 'kept-log');
  assert.equal(state.imperialWorks.skills['early-warning'], 1);
  assert.equal(state.taxCoffers.aurelia, 15);
  assert.ok(state.galaxy.systems.aurelia.deposits.durasteel > 0);
  assert.equal(state.galaxy.systems.aurelia.planets[0].settlements[0].storage.plasmaCells, 9);
  assert.ok(Array.isArray(state.sites));
});

test('a version 7 save that still holds legacy stocks is upgraded on load', async () => {
  const galaxy = createGalaxySeed();
  delete galaxy.systems.nyx.deposits;
  saved.set('quantum-rim-strategic-state', JSON.stringify({
    version: 7,
    state: {
      schemaVersion: 6,
      galaxy,
      treasury: { credits: 165071, commodities: { food: 0, water: 0, energy: 0, alloys: 0, exoticMatter: 28, plasmaCells: 0, durasteel: 0 } },
      taxCoffers: { aurelia: 15 },
      imperialWorks: { skills: {}, facilities: {} },
      events: [{ id: 'kept-event' }],
      expeditions: [],
      auditLog: [],
      strategicTurn: 14485,
      sites: [],
    },
  }));
  await useStrategicStore.persist.rehydrate();
  const state = useStrategicStore.getState();
  assert.equal(state.schemaVersion, 8);
  assert.equal(state.treasury.credits, 165071);
  assert.equal(state.strategicTurn, 14485);
  assert.equal(state.events[0].id, 'kept-event');
  assert.equal(state.treasury.commodities.hypermatter, 28);
  assert.equal(state.treasury.commodities.energy, undefined);
  assert.equal(state.treasury.commodities.exoticMatter, undefined);
  assert.ok(state.galaxy.systems.nyx.deposits.plasmaCells > 0);
});

test('a short stock or a full cap spends nothing', () => {
  const state = useStrategicStore.getState();
  const ids = Object.keys(state.galaxy.systems);
  const credits = state.treasury.credits;
  useStrategicStore.setState({
    treasury: { ...state.treasury, commodities: { ...state.treasury.commodities, durasteel: 0 } },
  });
  const short = useStrategicStore.getState().startConstruction(ids[0], 'mining');
  assert.equal(short.ok, false);
  assert.equal(short.reason, 'durasteel');
  assert.equal(useStrategicStore.getState().treasury.credits, credits);
  assert.equal(useStrategicStore.getState().sites.length, 0);

  useStrategicStore.setState({ treasury: state.treasury });
  assert.equal(useStrategicStore.getState().startConstruction(ids[0], 'mining').ok, true);
  assert.equal(useStrategicStore.getState().startConstruction(ids[1], 'mining').ok, true);
  const blocked = useStrategicStore.getState().startConstruction(ids[2], 'mining');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'cap');
  assert.equal(useStrategicStore.getState().sites.length, 2);
});

test('paying for a rank leaves it inactive until the committed cycle count elapses', () => {
  const state = useStrategicStore.getState();
  const systemId = state.selectedSystemId;
  const before = state.treasury.credits;
  const started = state.startConstruction(systemId, 'mining');
  assert.equal(started.ok, true);
  assert.ok(started.cycles >= 2);
  assert.ok(useStrategicStore.getState().treasury.credits < before);
  assert.ok(useStrategicStore.getState().treasury.commodities.durasteel < state.treasury.commodities.durasteel);
  const pending = useStrategicStore.getState().sites[0];
  assert.equal(pending.level, 0);
  assert.equal(pending.building.cyclesRemaining, started.cycles);
  useStrategicStore.getState().advanceStrategicTime(started.cycles - 1);
  assert.equal(useStrategicStore.getState().sites[0].level, 0);
  useStrategicStore.getState().advanceStrategicTime(1);
  const online = useStrategicStore.getState().sites[0];
  assert.equal(online.level, 1);
  assert.equal(online.building, null);
  const locked = useStrategicStore.getState().startConstruction(systemId, 'mining');
  assert.equal(locked.reason, 'level');
});

test('a stationed fleet lowers a locally generated incursion', () => {
  const state = useStrategicStore.getState();
  const planet = findPlanet(state.galaxy, state.selectedPlanetId);
  const generated = {
    event_type: 'faction-incursion',
    activity: { id: 'fleet-command' },
    event_metadata: {
      faction: { name: 'Void Choir', doctrine: 'raid', bannerSeed: 'nyx:banner' },
      invasion_lanes: { nodes: [{ id: 0 }, { id: 1 }], edges: [[0, 1]] },
    },
    provenance: [{ engine: 'coin-toss', operation: 'branch', mode: 'classical-fallback', detail: 'fallback', verified: false }],
  };
  const open = state.createCrisis(planet, { generated });
  useStrategicStore.setState({
    sites: [{ id: 'fleet-nyx', type: 'fleet', systemId: planet.systemId, level: 4, building: null, transit: null }],
  });
  const held = useStrategicStore.getState().createCrisis(planet, { generated });
  assert.ok(held.severity < open.severity);
  assert.equal(open.eventMetadata.faction.name, 'Void Choir');
  assert.equal(open.eventMetadata.faction.bannerSeed, 'nyx:banner');
  assert.equal(open.eventMetadata.invasion_lanes.edges.length, 1);
  assert.equal(open.quantum[0].verified, false);
});
