import assert from 'node:assert/strict';
import test from 'node:test';

import { isActive, tickSites } from '../src/game/facilities.js';
import {
  amoebaPath,
  chartBelts,
  cometPathFromLanes,
  localCometLanes,
  tickComets,
} from '../src/game/galaxyChart.js';
import { enemyFleetCap, tickIncursions } from '../src/game/incursions.js';

const galaxy = { systems: { a: { id: 'a', x: 40, y: 40 } } };

function fleet(id) {
  return { id, type: 'fleet', level: 1, systemId: 'a' };
}

test('enemy fleets stay at one until the navy reaches three, then one per three', () => {
  assert.equal(enemyFleetCap(0), 0);
  assert.equal(enemyFleetCap(1), 1);
  assert.equal(enemyFleetCap(2), 1);
  assert.equal(enemyFleetCap(3), 1);
  assert.equal(enemyFleetCap(5), 1);
  assert.equal(enemyFleetCap(6), 2);
  assert.equal(enemyFleetCap(9), 3);
});

test('a navy of one or two fleets never draws a second raider', () => {
  const sites = [fleet('f1'), fleet('f2')];
  let enemies = [];
  for (const turn of [4, 8, 12]) {
    const step = tickIncursions({ enemies, sites, galaxy, turns: 1, turn });
    enemies = step.enemies;
  }
  assert.equal(enemies.length, 1);
});

test('six fleets allow a second raider on a later cycle', () => {
  const sites = [0, 1, 2, 3, 4, 5].map((index) => fleet(`f${index}`));
  const first = tickIncursions({ enemies: [], sites, galaxy, turns: 1, turn: 4 });
  const second = tickIncursions({ enemies: first.enemies, sites, galaxy, turns: 1, turn: 8 });
  assert.equal(first.enemies.length, 1);
  assert.equal(second.enemies.length, 2);
});

test('no commissioned fleet means no raider', () => {
  const sites = [{ id: 'mine', type: 'mining', level: 1, systemId: 'a' }];
  const step = tickIncursions({ enemies: [], sites, galaxy, turns: 1, turn: 4 });
  assert.equal(step.enemies.length, 0);
});

test('a raid that is not met knocks its target offline, then the site recovers', () => {
  const enemy = {
    id: 'e1',
    name: 'Ashen Compact',
    doctrine: 'raid',
    targetSystemId: 'a',
    targetSiteId: 'mine',
    origin: { x: 10, y: 10 },
    cyclesTotal: 8,
    cyclesRemaining: 0,
    status: 'pressing',
    pressRemaining: 1,
    engageRemaining: 0,
    engagedFleetId: null,
    clash: null,
  };
  const sites = [{ id: 'mine', type: 'mining', level: 2, systemId: 'a' }];
  const step = tickIncursions({ enemies: [enemy], sites, galaxy, turns: 1, turn: 1 });
  assert.equal(step.enemies.length, 0);
  assert.equal(step.sites[0].offline.cyclesRemaining, 6);
  assert.equal(step.sites[0].offline.cause, 'Ashen Compact');
  assert.equal(isActive(step.sites[0]), false);
  assert.equal(isActive(tickSites(step.sites, 6)[0]), true);
});

test('a defense fleet that reaches the raider engages and the site stays online', () => {
  const enemy = {
    id: 'e1',
    name: 'Void Choir',
    doctrine: 'siege',
    targetSystemId: 'a',
    targetSiteId: 'port',
    origin: { x: 10, y: 10 },
    cyclesTotal: 8,
    cyclesRemaining: 8,
    status: 'inbound',
    pressRemaining: 4,
    engageRemaining: 0,
    engagedFleetId: null,
    clash: null,
  };
  const sites = [
    { id: 'port', type: 'port', level: 1, systemId: 'a' },
    {
      id: 'fleet',
      type: 'fleet',
      level: 2,
      systemId: 'a',
      sortie: { enemyId: 'e1', x: 12, y: 12, speed: 20, returning: false },
    },
  ];
  let step = tickIncursions({ enemies: [enemy], sites, galaxy, turns: 1, turn: 1 });
  assert.equal(step.enemies[0].status, 'engaging');
  assert.equal(step.sites.find((site) => site.id === 'port').offline, undefined);
  step = tickIncursions({ ...step, galaxy, turns: 1, turn: 2 });
  step = tickIncursions({ ...step, galaxy, turns: 1, turn: 3 });
  step = tickIncursions({ ...step, galaxy, turns: 1, turn: 5 });
  assert.equal(step.enemies.find((item) => item.id === 'e1'), undefined);
  assert.equal(step.sites.find((site) => site.id === 'port').offline ?? null, null);
  assert.equal(isActive(step.sites.find((site) => site.id === 'fleet')), false);
});

test('a comet fades out once it enters a system and then leaves the chart', () => {
  const comets = [{
    id: 'c',
    seed: 's',
    progress: 0.5,
    fade: 0,
    path: [{ x: 80, y: 80 }, { x: 40, y: 40 }, { x: 40, y: 40 }],
    source: 'deterministic-fallback',
  }];
  const near = tickComets(comets, galaxy, 1);
  assert.equal(near.length, 1);
  assert.ok(near[0].fade > 0);
  assert.equal(tickComets(near, galaxy, 6).length, 0);
});

test('deposit blobs are wide irregular outlines and differ by seed', () => {
  const first = amoebaPath(48, 47, 16, 'aurelia:kyber');
  const second = amoebaPath(48, 47, 16, 'nyx:kyber');
  assert.match(first, /^M /);
  assert.notEqual(first, second);
  const lanes = localCometLanes('comet-seed');
  const path = cometPathFromLanes(lanes, 'comet-seed', galaxy.systems);
  assert.equal(path.length, 6);
  assert.ok(path.every((point) => point.x >= -22 && point.x <= 122 && point.y >= -20 && point.y <= 120));
});

test('asteroid belts are rocks on two bands, and a body fades after it leaves the map', () => {
  const belts = chartBelts(galaxy);
  assert.equal(belts.length, 2);
  assert.ok(belts[0].rocks.length > 40);
  assert.ok(belts[0].spin > belts[1].spin);
  assert.equal(belts[0].points, undefined);
  const leaving = tickComets([{
    id: 'm',
    kind: 'meteor',
    speed: 0.2,
    progress: 0.4,
    fade: 0,
    path: [{ x: 70, y: 20 }, { x: 150, y: 20 }],
  }], galaxy, 1);
  assert.equal(leaving.length, 1);
  assert.ok(leaving[0].fade > 0);
  assert.equal(tickComets(leaving, galaxy, 4).length, 0);
});
