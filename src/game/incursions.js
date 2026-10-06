/** Map-level raiders. They fly in on the strategic clock and can knock a site offline. */

const FACTIONS = [
  'Crimson Reach',
  'Ashen Compact',
  'Void Choir',
  'Iron Meridian',
  'Pale Armada',
  'Sable Concord',
];
const DOCTRINES = ['raid', 'siege', 'blockade'];
const KNOCKABLE = ['mining', 'port', 'research', 'medical', 'fleet'];

function hashUnit(salt) {
  let hash = 2166136261;
  const text = String(salt);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function enemyFleetCap(playerFleets) {
  const count = Math.max(0, Math.round(Number(playerFleets) || 0));
  if (count <= 0) return 0;
  if (count < 3) return 1;
  return Math.floor(count / 3);
}

export function commissionedFleetCount(sites = []) {
  return sites.filter((site) => site.type === 'fleet' && site.level > 0 && !site.building).length;
}

export function enemyPosition(enemy, galaxy) {
  const system = galaxy?.systems?.[enemy?.targetSystemId];
  if (!enemy?.origin) return { x: system?.x ?? 50, y: system?.y ?? 50 };
  if (enemy.status === 'engaging' && enemy.clash) return enemy.clash;
  if (enemy.status === 'pressing' && system) return { x: system.x, y: system.y };
  if (!system) return enemy.origin;
  const total = Math.max(1, enemy.cyclesTotal || 1);
  const travelled = clamp(1 - (enemy.cyclesRemaining / total), 0, 1);
  return {
    x: enemy.origin.x + (system.x - enemy.origin.x) * travelled,
    y: enemy.origin.y + (system.y - enemy.origin.y) * travelled,
  };
}

function pickTarget(galaxy, sites, salt) {
  const systems = Object.values(galaxy?.systems || {});
  if (!systems.length) return null;
  const withSites = systems.filter((system) => sites.some((site) => (
    site.systemId === system.id && site.level > 0 && !site.offline && !site.building && !site.sortie
  )));
  const pool = withSites.length ? withSites : systems;
  const system = pool[Math.floor(hashUnit(`${salt}:sys`) * pool.length)];
  const local = sites.filter((site) => (
    site.systemId === system.id
    && KNOCKABLE.includes(site.type)
    && site.level > 0
    && !site.offline
    && !site.building
    && !site.sortie
  ));
  const preferred = local.filter((site) => site.type === 'mining' || site.type === 'port');
  const choice = preferred.length ? preferred : local;
  const site = choice.length ? choice[Math.floor(hashUnit(`${salt}:site`) * choice.length)] : null;
  return { system, site };
}

export function spawnEnemy(galaxy, sites, turn, existing = []) {
  const live = (existing || []).filter((enemy) => enemy.status !== 'repelled');
  const cap = enemyFleetCap(commissionedFleetCount(sites));
  if (live.length >= cap || turn % 4 !== 0) return live;
  const target = pickTarget(galaxy, sites, `spawn:${turn}:${live.length}`);
  if (!target) return live;
  const { system, site } = target;
  const angle = Math.atan2(system.y - 50, system.x - 50);
  const origin = {
    x: clamp(system.x + Math.cos(angle) * 24, 2, 98),
    y: clamp(system.y + Math.sin(angle) * 24, 4, 96),
  };
  const distance = Math.hypot(system.x - origin.x, system.y - origin.y);
  const cycles = Math.max(5, Math.round(distance / 3.2));
  return [...live, {
    id: `enemy-${turn}-${live.length}`,
    name: FACTIONS[Math.floor(hashUnit(`${turn}:name`) * FACTIONS.length)],
    doctrine: DOCTRINES[Math.floor(hashUnit(`${turn}:doctrine`) * DOCTRINES.length)],
    targetSystemId: system.id,
    targetSiteId: site?.id || null,
    origin,
    cyclesTotal: cycles,
    cyclesRemaining: cycles,
    status: 'inbound',
    pressRemaining: 4,
    engageRemaining: 0,
    engagedFleetId: null,
    clash: null,
  }];
}

function moveSortie(site, enemy, galaxy, turns) {
  const home = galaxy?.systems?.[site.systemId];
  const sortie = site.sortie;
  if (!sortie || !home) return site;
  if (sortie.returning || !enemy || enemy.status === 'repelled') {
    const dx = home.x - sortie.x;
    const dy = home.y - sortie.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.6) return { ...site, sortie: null };
    const step = Math.min(dist, (sortie.speed || 4) * turns);
    return {
      ...site,
      sortie: {
        ...sortie,
        returning: true,
        x: sortie.x + (dx / dist) * step,
        y: sortie.y + (dy / dist) * step,
      },
    };
  }
  const pos = enemyPosition(enemy, galaxy);
  const dx = pos.x - sortie.x;
  const dy = pos.y - sortie.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const step = Math.min(dist, (sortie.speed || 4) * turns);
  return {
    ...site,
    sortie: {
      ...sortie,
      x: sortie.x + (dx / dist) * step,
      y: sortie.y + (dy / dist) * step,
    },
  };
}

export function tickIncursions({ enemies = [], sites = [], galaxy, turns = 1, turn = 0 }) {
  const steps = Math.max(1, Math.round(turns));
  let nextEnemies = enemies.map((enemy) => ({ ...enemy }));
  let nextSites = sites.map((site) => ({ ...site, sortie: site.sortie ? { ...site.sortie } : site.sortie }));

  nextEnemies = nextEnemies.map((enemy) => {
    if (enemy.status !== 'inbound') return enemy;
    const left = enemy.cyclesRemaining - steps;
    if (left > 0) return { ...enemy, cyclesRemaining: left };
    return { ...enemy, cyclesRemaining: 0, status: 'pressing', pressRemaining: enemy.pressRemaining ?? 4 };
  });

  nextSites = nextSites.map((site) => {
    if (site.type !== 'fleet' || !site.sortie) return site;
    const enemy = nextEnemies.find((item) => item.id === site.sortie.enemyId);
    return moveSortie(site, enemy, galaxy, steps);
  });

  const justEngaged = new Set();
  nextEnemies = nextEnemies.map((enemy) => {
    if (enemy.status !== 'inbound' && enemy.status !== 'pressing') return enemy;
    const fleet = nextSites.find((site) => site.sortie && !site.sortie.returning && site.sortie.enemyId === enemy.id);
    if (!fleet) return enemy;
    const pos = enemyPosition(enemy, galaxy);
    const dist = Math.hypot(fleet.sortie.x - pos.x, fleet.sortie.y - pos.y);
    if (dist > 4.5) return enemy;
    justEngaged.add(enemy.id);
    return {
      ...enemy,
      status: 'engaging',
      engageRemaining: 3,
      engagedFleetId: fleet.id,
      clash: { x: (fleet.sortie.x + pos.x) / 2, y: (fleet.sortie.y + pos.y) / 2 },
    };
  });

  nextEnemies = nextEnemies.map((enemy) => {
    if (enemy.status !== 'engaging' || justEngaged.has(enemy.id)) return enemy;
    const left = (enemy.engageRemaining || 3) - steps;
    if (left > 0) return { ...enemy, engageRemaining: left };
    return { ...enemy, status: 'repelled', engageRemaining: 0 };
  });

  const knocked = [];
  nextEnemies = nextEnemies.map((enemy) => {
    if (enemy.status !== 'pressing') return enemy;
    const left = (enemy.pressRemaining ?? 4) - steps;
    if (left > 0) return { ...enemy, pressRemaining: left };
    if (enemy.targetSiteId) knocked.push(enemy);
    return { ...enemy, status: 'repelled', pressRemaining: 0 };
  });

  if (knocked.length) {
    nextSites = nextSites.map((site) => {
      const hit = knocked.find((enemy) => enemy.targetSiteId === site.id);
      if (!hit || site.offline || site.sortie) return site;
      return { ...site, offline: { cyclesRemaining: 6, cause: hit.name } };
    });
  }

  nextSites = nextSites.map((site) => {
    if (!site.sortie || site.sortie.returning) return site;
    const enemy = nextEnemies.find((item) => item.id === site.sortie.enemyId && item.status !== 'repelled');
    if (enemy) return site;
    return moveSortie(site, null, galaxy, steps);
  });

  nextEnemies = nextEnemies.filter((enemy) => enemy.status !== 'repelled');
  return { enemies: spawnEnemy(galaxy, nextSites, turn, nextEnemies), sites: nextSites };
}
