import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyImpact,
  buildDebris,
  debrisCountFor,
  measureImpact,
  relaxOrbitKicks,
  severityBand,
} from '../src/physics/impact.js';

function momentum(bodyA, bodyB) {
  return [0, 1, 2].map((axis) => (
    bodyA.mass * bodyA.velocity[axis] + bodyB.mass * bodyB.velocity[axis]
  ));
}

test('severity bands follow graze, battering, and cataclysm', () => {
  assert.equal(severityBand(0.1), 'graze');
  assert.equal(severityBand(0.5), 'battering');
  assert.equal(severityBand(0.9), 'cataclysm');
  assert.equal(debrisCountFor('graze', 0.9), 0);
  assert.ok(debrisCountFor('battering', 0) >= 6 && debrisCountFor('battering', 0.99) <= 10);
  assert.ok(debrisCountFor('cataclysm', 0) >= 10 && debrisCountFor('cataclysm', 0.99) <= 14);
});

test('a graze conserves momentum and a cataclysm is marked to merge', () => {
  const grazeA = {
    id: 'a', mass: 2, radius: 0.3, position: [0, 0, 0], velocity: [0.02, 0.2, 0], type: 'rocky',
  };
  const grazeB = {
    id: 'b', mass: 0.4, radius: 0.15, position: [0.4, 0.05, 0], velocity: [0.01, -0.05, 0], type: 'rocky',
  };
  const graze = applyImpact(grazeA, grazeB);
  assert.equal(graze.band, 'graze');
  assert.equal(graze.merged, false);
  assert.equal(graze.bodyA.kick.permanent, false);
  const before = momentum(grazeA, grazeB);
  const after = momentum(graze.bodyA, graze.bodyB);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(Math.abs(before[axis] - after[axis]) < 1e-9);
  }

  const crashA = {
    id: 'c', mass: 1, radius: 0.2, position: [0, 0, 0], velocity: [1.2, 0, 0], type: 'rocky',
  };
  const crashB = {
    id: 'd', mass: 1, radius: 0.2, position: [0.2, 0, 0], velocity: [-1.1, 0, 0], type: 'rocky',
  };
  const crash = applyImpact(crashA, crashB);
  assert.equal(crash.band, 'cataclysm');
  assert.equal(crash.merged, true);
  assert.equal(measureImpact(crashA, crashB).approaching, true);
});

test('debris stays finite and temporary kicks decay', () => {
  const bodyA = {
    id: 'a', mass: 1, radius: 0.2, position: [0, 0, 0], velocity: [0.4, 0, 0], type: 'rocky',
  };
  const bodyB = {
    id: 'b', mass: 1, radius: 0.2, position: [0.3, 0, 0], velocity: [-0.2, 0.1, 0], type: 'rocky',
  };
  const shards = buildDebris({
    bodyA, bodyB, band: 'cataclysm', unit: 0.4, existingCount: 30, idBase: 'hit',
  });
  assert.ok(shards.length > 0);
  assert.ok(shards.length <= 6);
  for (const shard of shards) {
    assert.equal(shard.position.every(Number.isFinite), true);
    assert.equal(shard.velocity.every(Number.isFinite), true);
    assert.equal(shard.intangibleTicks, 20);
  }
  assert.equal(buildDebris({ bodyA, bodyB, band: 'cataclysm', existingCount: 36 }).length, 0);
  const relaxed = relaxOrbitKicks([{
    id: 'k',
    velocity: [1, 0, 0],
    intangibleTicks: 2,
    kick: { permanent: false, excess: [0.4, 0, 0] },
  }], 6);
  assert.ok(relaxed[0].velocity[0] < 1);
  assert.ok(Math.abs(relaxed[0].kick.excess[0]) < 0.4);
  assert.equal(relaxed[0].intangibleTicks, 1);
});