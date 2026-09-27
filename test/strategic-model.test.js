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
    'food', 'water', 'energy', 'alloys', 'exoticMatter',
  ]);
  const result = applyResourceTransaction(
    { credits: 50, commodities: { ...DEFAULT_COMMODITIES, food: 10 } },
    { credits: -80, commodities: { food: -40, energy: 10 } },
  );
  assert.equal(result.ledger.credits, 0);
  assert.equal(result.appliedDelta.credits, -50);
  assert.equal(result.ledger.commodities.food, 0);
  assert.equal(result.appliedDelta.commodities.food, -10);
  assert.equal(result.appliedDelta.commodities.energy, 10);
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
    resourceCost: { energy: 20, alloys: 10 },
  });
  const after = useStrategicStore.getState();
  const second = after.resolveActivity(event.id, 0.85, {
    resourceCost: { energy: 20, alloys: 10 },
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
    treasury: { ...state.treasury, commodities: { ...state.treasury.commodities, energy: 0 } },
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
    resourceCost: { energy: 30, alloys: 20 },
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
