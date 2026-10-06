import assert from 'node:assert/strict';
import test from 'node:test';

const { MATERIAL_GRADES, depositForSystem } = await import('../src/game/deposits.js');
const {
  buildOffer,
  committedCycles,
  facilityCap,
  governmentLevel,
  isActive,
  accrueSiteStock,
  miningYield,
  tickSites,
} = await import('../src/game/facilities.js');
const { createGalaxySeed } = await import('../src/game/galaxySeed.js');
const { operationRelief } = await import('../src/game/imperialWorks.js');
const { migrateCommodityBag } = await import('../src/game/resources.js');

test('legacy stocks fold into the common grade and leave the rest of the bag', () => {
  const bag = migrateCommodityBag({
    food: 11,
    water: 4,
    energy: 30,
    alloys: 20,
    exoticMatter: 5,
    plasmaCells: 2,
  });
  assert.equal(bag.food, 11);
  assert.equal(bag.water, 4);
  assert.equal(bag.plasmaCells, 32);
  assert.equal(bag.durasteel, 20);
  assert.equal(bag.hypermatter, 5);
  assert.equal(bag.kyber, 0);
  assert.equal(bag.energy, undefined);
});

test('rare grades are fewer and sit on hard Outer Rim ground', () => {
  const galaxy = createGalaxySeed();
  const systems = Object.values(galaxy.systems);
  const rareIds = MATERIAL_GRADES.filter((grade) => grade.rarity === 'rare').map((grade) => grade.id);
  const commonIds = MATERIAL_GRADES.filter((grade) => grade.rarity === 'common').map((grade) => grade.id);
  for (const common of commonIds) {
    const commonCount = systems.filter((system) => (system.deposits[common] || 0) > 0).length;
    for (const rare of rareIds) {
      const holders = systems.filter((system) => (system.deposits[rare] || 0) > 0);
      assert.ok(holders.length < commonCount);
      for (const system of holders) {
        assert.equal(system.zone, 'outer');
        assert.ok(system.routeDanger >= 0.45);
        assert.ok(system.security <= 0.4);
      }
    }
  }
  const core = systems.find((system) => system.zone === 'core');
  assert.ok(core.deposits.plasmaCells >= 8);
  assert.ok(core.deposits.durasteel >= 6);
  assert.equal(depositForSystem({ id: 'soft-outer', zone: 'outer', routeDanger: 0.2, security: 0.8 }).coaxium, undefined);
});

test('construction spends the bundle, stays dark, then comes online on the median', () => {
  const galaxy = createGalaxySeed();
  const system = galaxy.systems.aurelia;
  const offer = buildOffer([], system, 'mining');
  assert.equal(offer.ok, true);
  assert.equal(offer.cycles, committedCycles('mining', 1, system));
  const site = {
    id: 'rig-1',
    type: 'mining',
    systemId: system.id,
    level: 0,
    building: { targetLevel: 1, cyclesRemaining: offer.cycles, cyclesTotal: offer.cycles },
    transit: null,
  };
  assert.equal(isActive(site), false);
  const almost = tickSites([site], offer.cycles - 1)[0];
  assert.equal(almost.level, 0);
  assert.ok(almost.building);
  const done = tickSites([site], offer.cycles)[0];
  assert.equal(done.level, 1);
  assert.equal(done.building, null);
  assert.equal(isActive(done), true);
});

test('government level comes from finished research and raises caps', () => {
  assert.equal(governmentLevel([]), 1);
  assert.equal(facilityCap('mining', 1), 2);
  assert.equal(facilityCap('research', 1), 1);
  const building = [{ id: 'lab', type: 'research', systemId: 'aurelia', level: 0, building: { targetLevel: 1, cyclesRemaining: 3 }, transit: null }];
  assert.equal(governmentLevel(building), 1);
  assert.equal(buildOffer(building, { id: 'bastion' }, 'fleet').ok, true);
  assert.equal(buildOffer([], { id: 'aurelia' }, 'mining').nextLevel, 1);
  const finished = [{ id: 'lab', type: 'research', systemId: 'aurelia', level: 1, building: null, transit: null }];
  assert.equal(governmentLevel(finished), 2);
  const upgrading = [{ id: 'lab', type: 'research', systemId: 'aurelia', level: 1, building: { targetLevel: 2, cyclesRemaining: 4 }, transit: null }];
  assert.equal(governmentLevel(upgrading), 2);
  assert.equal(facilityCap('mining', 2), 3);
  assert.equal(facilityCap('fleet', 2), 2);
  const rig = [{ id: 'rig', type: 'mining', systemId: 'aurelia', level: 1, building: null, transit: null }];
  assert.equal(buildOffer(rig, { id: 'aurelia', zone: 'core' }, 'mining').reason, 'level');
  const upgraded = buildOffer([...finished, ...rig], { id: 'aurelia', zone: 'core' }, 'mining');
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.nextLevel, 2);
});

test('a rig yields the host seam and nothing while it is in transit', () => {
  const galaxy = createGalaxySeed();
  const home = {
    id: 'rig',
    type: 'mining',
    systemId: 'aurelia',
    level: 2,
    building: null,
    transit: null,
  };
  const stationed = miningYield([home], galaxy, 1);
  assert.equal(stationed.plasmaCells, galaxy.systems.aurelia.deposits.plasmaCells * 2);
  const moving = { ...home, transit: { toSystemId: 'nyx', cyclesRemaining: 4, cyclesTotal: 4 } };
  assert.deepEqual(miningYield([moving], galaxy, 1), {});
  const arrived = tickSites([moving], 4)[0];
  assert.equal(arrived.systemId, 'nyx');
  assert.equal(arrived.transit, null);
  const next = miningYield([arrived], galaxy, 1);
  assert.equal(next.plasmaCells, galaxy.systems.nyx.deposits.plasmaCells * 2);
  assert.notEqual(next.plasmaCells, stationed.plasmaCells);
});

test('extraction stock keeps growing with no ceiling', () => {
  const galaxy = createGalaxySeed();
  const site = {
    id: 'tower',
    type: 'extraction',
    systemId: 'aurelia',
    level: 1,
    building: null,
    transit: null,
    stock: {},
  };
  const once = accrueSiteStock([site], galaxy, 1)[0];
  const later = accrueSiteStock([once], galaxy, 40)[0];
  const key = 'plasmaCells';
  assert.ok(once.stock[key] > 0);
  assert.ok(later.stock[key] > once.stock[key] * 20);
  assert.equal(buildOffer([], { id: 'aurelia' }, 'processing').ok, true);
  assert.equal(buildOffer([], { id: 'aurelia' }, 'extraction').ok, true);
});

test('a defense fleet lowers incursion severity and a medical station lowers population loss', () => {
  const open = operationRelief({ skills: {}, facilities: {} }, 'nyx', []);
  const held = operationRelief({ skills: {}, facilities: {} }, 'nyx', [
    { type: 'fleet', systemId: 'nyx', level: 3, building: null, transit: null },
    { type: 'medical', systemId: 'nyx', level: 2, building: null, transit: null },
  ]);
  assert.ok(held.severity > open.severity);
  assert.ok(held.loss > open.loss);
  assert.ok(held.population > open.population);
  assert.ok(held.invasion > 0);
});
