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
const {
  forgeToSimBodies,
  generateForgeLocally,
  requestForgeSystem,
  sampleAdditionalBody,
  strategicSystemToSimBodies,
} = await import('../src/game/systemForge.js');
const { planetVisualProperties } = await import('../src/game/planetVisual.js');
const { useStrategicStore } = await import('../src/store/useStrategicStore.js');

beforeEach(() => {
  saved.clear();
  useStrategicStore.getState().resetCampaign();
});

test('a fixed seed builds one reproducible system', () => {
  const first = generateForgeLocally('rim-seed-7', { spectralClass: 'K4' });
  const second = generateForgeLocally('rim-seed-7', { spectralClass: 'K4' });
  assert.equal(first.star.spectralClass, 'K4');
  assert.equal(first.star.temperature > 1000, true);
  assert.deepEqual(first.bodies.map((body) => body.name), second.bodies.map((body) => body.name));
  assert.deepEqual(first.bodies.map((body) => body.orbitRadius), second.bodies.map((body) => body.orbitRadius));
  const orbits = first.bodies.map((body) => body.orbitRadius);
  for (let index = 1; index < orbits.length; index += 1) {
    assert.ok(orbits[index] >= orbits[index - 1] + 0.45);
  }
  assert.equal(first.provenance[0].mode, 'classical-fallback');
  assert.equal(first.provenance[0].verified, false);
  assert.ok(first.bodies.every((body) => body.atmosphere && body.atmosphereTexture));
  assert.ok(first.bodies.every((body) => body.quantumPlan.steps.some((step) => step.engine === 'telablur')));
  assert.ok(first.scaffold.habitableOuter > first.scaffold.habitableInner);
});

test('fallback generation stays labelled when the service is unreachable', async () => {
  const draft = await requestForgeSystem({
    generateSystem: async () => {
      throw new Error('connect ECONNREFUSED');
    },
  }, { seed: 'offline-seed' });
  assert.equal(draft.seed, 'offline-seed');
  assert.equal(draft.provenance[0].mode, 'classical-fallback');
  assert.match(draft.provenance[0].detail, /ECONNREFUSED/);
  assert.ok(draft.bodies.length >= 3);
});

test('rename and commit add the forged system to the republic map', () => {
  const draft = generateForgeLocally('commit-seed');
  useStrategicStore.getState().createForgeSystem(draft);
  assert.equal(useStrategicStore.getState().renameForgeBody(draft.bodies[0].id, 'Renamed World'), true);
  const systemId = useStrategicStore.getState().commitForgeSystem();
  const galaxy = useStrategicStore.getState().galaxy;
  const system = galaxy.systems[systemId];
  assert.ok(system);
  assert.equal(findPlanet(galaxy, system.planets[0].id).name, 'Renamed World');
  assert.equal(findPlanet(galaxy, system.planets[0].id).history.some((entry) => entry.eventType === 'rename'), true);
  assert.equal(useStrategicStore.getState().forgeDraft, null);
  assert.ok(galaxy.routes.some((route) => route.to === systemId || route.from === systemId));
  const visual = planetVisualProperties(system.planets[0]);
  assert.match(visual['--planet-color'], /^#[0-9a-f]{6}$/i);
  assert.ok(visual['--planet-ring-opacity'] != null);
  assert.equal(useStrategicStore.getState().renamePlanet(system.planets[1].id, 'Survey Name'), true);
  assert.equal(findPlanet(useStrategicStore.getState().galaxy, system.planets[1].id).name, 'Survey Name');
});

test('proto and mature previews stay on finite orbits, including moons', () => {
  const draft = generateForgeLocally('orbit-seed');
  const moon = sampleAdditionalBody(draft, 'moon');
  assert.equal(moon.kind, 'moon');
  assert.equal(moon.type, 'moon');
  const withMoon = { ...draft, bodies: [...draft.bodies, moon] };
  const proto = forgeToSimBodies(withMoon, 0.1);
  const mature = forgeToSimBodies(withMoon, 1);
  assert.equal(proto[0].type, 'star');
  assert.ok(proto.length > mature.length);
  assert.equal(mature.some((body) => body.type === 'moon'), true);
  const starRadius = proto[0].radius;
  for (const body of [...proto, ...mature]) {
    assert.equal(body.position.every(Number.isFinite), true);
    assert.equal(body.velocity.every(Number.isFinite), true);
    if (body.type === 'star') continue;
    const distance = Math.hypot(...body.position);
    assert.ok(distance > starRadius + body.radius);
  }
  const ringed = withMoon.bodies.find((body) => body.rings.present) || {
    ...withMoon.bodies[0],
    rings: { present: true, opacity: 0.8, tilt: 12, color: '#e6d3a1' },
  };
  const ringVisual = planetVisualProperties(ringed);
  assert.ok(Number(ringVisual['--planet-ring-opacity']) > 0);
});

test('fixed seeds spread archetypes, palettes, and masses', () => {
  const archetypes = new Set();
  const palettes = new Set();
  const masses = [];
  for (const seed of ['rim-seed-7', 'k4-verify', 'ring-hunt-8', 'variety-4', 'variety-9']) {
    const draft = generateForgeLocally(seed);
    for (const body of draft.bodies) {
      archetypes.add(body.archetype);
      palettes.add(body.palette);
      masses.push(body.mass);
      assert.ok(body.texture?.source);
      assert.equal(body.texture.mode, 'pending');
    }
  }
  assert.ok(archetypes.size >= 4);
  assert.ok(palettes.size >= 4);
  assert.ok(Math.max(...masses) / Math.min(...masses) > 20);
});

test('a galaxy system opens as that system, not a leftover scenario', () => {
  const galaxy = createGalaxySeed();
  const aurelia = galaxy.systems.aurelia;
  const bodies = strategicSystemToSimBodies(aurelia);
  assert.equal(bodies[0].name, aurelia.name);
  assert.equal(bodies[0].type, 'star');
  assert.equal(bodies.length, aurelia.planets.length + 1);
  assert.deepEqual(bodies.slice(1).map((body) => body.name), aurelia.planets.map((planet) => planet.name));
  const starRadius = bodies[0].radius;
  for (const body of bodies.slice(1)) {
    assert.ok(body.mass < 1);
    assert.ok(body.radius < 1);
    assert.ok(Math.hypot(...body.position) > starRadius + body.radius);
    assert.equal(body.velocity.every(Number.isFinite), true);
  }
});
