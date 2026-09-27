import assert from 'node:assert/strict';
import { test } from 'node:test';

const { createGalaxySeed } = await import('../src/game/galaxySeed.js');
const { strategicSystemToSimBodies } = await import('../src/game/systemForge.js');
const { planSystemOrder, republicRecord, SYSTEM_ORDERS } = await import('../src/game/systemOrders.js');
const { computeAccelerations } = await import('../src/physics/gravity.js');

function integratePair(state, hostId, moonId, starId, steps = 2000, dt = 0.01) {
  let minGap = Infinity;
  let maxGap = 0;
  let minClear = Infinity;
  for (let step = 0; step < steps; step += 1) {
    const acc = computeAccelerations(state);
    state = state.map((body, index) => {
      const velocity = body.velocity.map((value, axis) => value + acc[index][axis] * dt);
      const position = body.position.map((value, axis) => value + velocity[axis] * dt);
      return { ...body, velocity, position };
    });
    const host = state.find((body) => body.id === hostId);
    const satellite = state.find((body) => body.id === moonId);
    const starNow = state.find((body) => body.id === starId);
    const pair = Math.hypot(...satellite.position.map((value, axis) => value - host.position[axis]));
    const clear = Math.hypot(...satellite.position.map((value, axis) => value - starNow.position[axis])) - starNow.radius - satellite.radius;
    minGap = Math.min(minGap, pair);
    maxGap = Math.max(maxGap, pair);
    minClear = Math.min(minClear, clear);
  }
  return { minGap, maxGap, minClear };
}

function aureliaScene() {
  const system = createGalaxySeed().systems.aurelia;
  return { system, bodies: strategicSystemToSimBodies(system) };
}

test('every celestial order is listed once', () => {
  const ids = SYSTEM_ORDERS.map((order) => order.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('asteroid-emergence'));
  assert.ok(ids.includes('add-planet'));
});

test('add planet places a named world outside the star and can join the republic', () => {
  const { system, bodies } = aureliaScene();
  const plan = planSystemOrder('add-planet', {
    system, bodies, systemLabel: system.name, stamp: 'planet-1',
  });
  assert.equal(plan.error, null);
  assert.equal(plan.simBodies.length, 1);
  assert.equal(plan.galaxyBody.name, plan.simBodies[0].name);
  const star = bodies[0];
  const world = plan.simBodies[0];
  assert.ok(Math.hypot(...world.position) > star.radius + world.radius);
  assert.equal(world.velocity.every(Number.isFinite), true);
  const record = republicRecord(system.id, plan.galaxyBody, system.planets.length);
  assert.equal(record.systemId, system.id);
  assert.equal(record.name, world.name);
  const again = planSystemOrder('add-planet', {
    system, bodies, systemLabel: 'Figure-8 Choreography', stamp: 'planet-2',
  });
  assert.equal(again.galaxyBody, null);
  assert.notEqual(again.simBodies[0].id, world.id);
});

test('asteroid emergence and debris stay finite and inbound', () => {
  const { system, bodies } = aureliaScene();
  const asteroids = planSystemOrder('asteroid-emergence', { system, bodies, stamp: 'rocks' });
  assert.equal(asteroids.simBodies.length, 8);
  assert.equal(asteroids.eventType, 'asteroid-collision');
  assert.ok(asteroids.simBodies.every((body) => body.name.startsWith('Bolide')));
  assert.ok(asteroids.simBodies.every((body) => body.position.every(Number.isFinite)));
  const debris = planSystemOrder('debris-swarm', { system, bodies, stamp: 'dust' });
  assert.equal(debris.eventType, 'small-body-collision');
  assert.equal(debris.simBodies.length, 8);
});

test('a moon stays bound to its planet and new planets keep their own lanes', () => {
  const { system, bodies } = aureliaScene();
  const star = bodies.find((body) => body.type === 'star');
  const orbits = ['lane-a', 'lane-b', 'lane-c', 'lane-d', 'lane-e'].map((stamp) => {
    const plan = planSystemOrder('add-planet', { system, bodies, systemLabel: system.name, stamp });
    const world = plan.simBodies[0];
    const rel = world.position.map((value, axis) => value - star.position[axis]);
    const radius = Math.hypot(...rel);
    const radial = rel.reduce((sum, value, axis) => sum + value * (world.velocity[axis] - star.velocity[axis]), 0) / radius;
    assert.ok(Math.abs(radial) < 0.05, `${world.name} is falling toward the star`);
    for (const other of bodies) {
      if (other.type === 'star') continue;
      const gap = Math.hypot(...world.position.map((value, axis) => value - other.position[axis]));
      assert.ok(gap > other.radius + world.radius + 0.4);
    }
    return radius;
  });
  assert.ok(Math.max(...orbits) - Math.min(...orbits) > 0.8);

  const parent = bodies.filter((body) => body.type !== 'star').at(-1);
  const moon = planSystemOrder('add-moon', { system, bodies, systemLabel: system.name, stamp: 'moon-1' });
  assert.equal(moon.error, null);
  assert.equal(moon.simBodies[0].type, 'moon');
  assert.ok(moon.simBodies[0].mass < parent.mass);
  const hosted = moon.patches.find((patch) => patch.id === parent.id);
  const gap = Math.hypot(...moon.simBodies[0].position.map((value, axis) => value - hosted.position[axis]));
  assert.ok(gap > parent.radius + moon.simBodies[0].radius);
  const hostRadius = Math.hypot(...hosted.position.map((value, axis) => value - star.position[axis]));
  const hill = hostRadius * Math.cbrt(parent.mass / (3 * star.mass));
  assert.ok(gap < hill * 0.75);

  let state = bodies.map((body) => {
    const patch = moon.patches.find((item) => item.id === body.id);
    return { ...(patch ? { ...body, ...patch, id: body.id } : body), isAlive: true };
  });
  state = [...state, { ...moon.simBodies[0], isAlive: true }];
  const tracked = integratePair(state, parent.id, moon.simBodies[0].id, star.id);
  assert.ok(tracked.minGap > parent.radius + moon.simBodies[0].radius);
  assert.ok(tracked.maxGap < gap * 1.45);
  assert.ok(tracked.minClear > 0.4);

  const reopened = strategicSystemToSimBodies({
    id: 'hold',
    name: 'Hold',
    starClass: 'G2',
    star: { name: 'Hold', simMass: star.mass, color: star.color },
    planets: [
      {
        id: parent.id,
        name: parent.name,
        type: 'rocky',
        mass: parent.mass,
        radius: parent.radius,
        orbitRadius: 1.7,
        theta: 0.4,
        inclination: 0.1,
        ascNode: 0.2,
        color: parent.color,
      },
      {
        id: moon.simBodies[0].id,
        name: moon.simBodies[0].name,
        type: 'moon',
        kind: 'moon',
        mass: moon.simBodies[0].mass,
        radius: moon.simBodies[0].radius,
        parentId: parent.id,
        moonDistance: moon.galaxyBody.moonDistance,
        theta: 1.1,
        inclination: 0.3,
        color: moon.simBodies[0].color,
      },
    ],
  }).map((body) => ({ ...body, isAlive: true }));
  const reopenedHost = reopened.find((body) => body.id === parent.id);
  const reopenedMoon = reopened.find((body) => body.id === moon.simBodies[0].id);
  const reopenedGap = Math.hypot(...reopenedMoon.position.map((value, axis) => value - reopenedHost.position[axis]));
  assert.ok(Math.hypot(...reopenedHost.position) > 8);
  const reopenedTrack = integratePair(reopened, parent.id, moon.simBodies[0].id, reopened[0].id);
  assert.ok(reopenedTrack.minGap > reopenedHost.radius + reopenedMoon.radius);
  assert.ok(reopenedTrack.maxGap < reopenedGap * 1.45);

  const alert = planSystemOrder('quantum-anomaly', { system, bodies, stamp: 'alert' });
  assert.equal(alert.simBodies.length, 0);
  assert.equal(alert.eventType, 'quantum-anomaly');
  const pulse = planSystemOrder('stellar-pulse', { system, bodies, stamp: 'pulse' });
  assert.equal(pulse.kicks.length, bodies.length - 1);
  assert.equal(planSystemOrder('missing', {}).error.length > 0, true);
});
