/** Decorative sky chart. Comet polylines share Labyrinth's node-and-edge shape. */

function hashUnit(salt) {
  let hash = 2166136261;
  const text = String(salt);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

const HEADING_ANCHORS = {
  outer: { x: 90, y: 22 },
  inner: { x: 10, y: 28 },
  core: { x: 84, y: 86 },
};

export function amoebaPath(cx, cy, radius, seed) {
  const steps = 11;
  const points = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const wobble = 0.55 + hashUnit(`${seed}:w:${index}`) * 0.9;
    const skew = 0.72 + hashUnit(`${seed}:s:${index % 3}`) * 0.55;
    points.push([
      cx + Math.cos(angle) * radius * wobble,
      cy + Math.sin(angle) * radius * wobble * skew,
    ]);
  }
  let path = '';
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const mid = [(current[0] + next[0]) / 2, (current[1] + next[1]) / 2];
    if (index === 0) path += `M ${mid[0].toFixed(2)} ${mid[1].toFixed(2)}`;
    path += ` Q ${current[0].toFixed(2)} ${current[1].toFixed(2)} ${mid[0].toFixed(2)} ${mid[1].toFixed(2)}`;
  }
  return `${path} Z`;
}

export function heatBlob(system, grade, strength) {
  const radius = 9 + Math.max(0, Math.min(1, strength)) * 14;
  return amoebaPath(system.x, system.y, radius, `${system.id}:${grade}:heat`);
}

const BELT_BANDS = [
  { id: 'belt-inner', cx: 50, cy: 50, rx: 22, ry: 16, count: 64, spin: 0.05 },
  { id: 'belt-outer', cx: 50, cy: 50, rx: 36, ry: 26, count: 88, spin: 0.03 },
];

export function chartBelts(galaxy) {
  const salt = Object.keys(galaxy?.systems || {}).length || 1;
  return BELT_BANDS.map((band) => ({
    ...band,
    rocks: Array.from({ length: band.count }, (_, step) => {
      const unit = hashUnit(`${band.id}:${salt}:${step}`);
      const scatter = hashUnit(`${band.id}:scatter:${step}`);
      return {
        id: `${band.id}:${step}`,
        angle: (step / band.count) * Math.PI * 2 + unit * 0.18,
        rx: band.rx * (0.9 + scatter * 0.2),
        ry: band.ry * (0.9 + hashUnit(`${band.id}:ry:${step}`) * 0.2),
        size: 2.4 + unit * 3.4,
        squash: 0.62 + hashUnit(`${band.id}:q:${step}`) * 0.5,
        tone: Math.floor(hashUnit(`${band.id}:tone:${step}`) * 3),
      };
    }),
  }));
}

export function chartDust(galaxy) {
  const systems = Object.values(galaxy?.systems || {});
  return [0, 1, 2].map((index) => {
    const anchor = systems[index % Math.max(1, systems.length)] || { id: 'dust', x: 50, y: 50 };
    const ox = (hashUnit(`dust:x:${index}:${anchor.id}`) - 0.5) * 26;
    const oy = (hashUnit(`dust:y:${index}:${anchor.id}`) - 0.5) * 18;
    const radius = 12 + hashUnit(`dust:r:${index}`) * 7;
    return {
      id: `dust-${index}`,
      d: amoebaPath(anchor.x + ox, anchor.y + oy, radius, `dust:${anchor.id}:${index}`),
    };
  });
}

export function orderLaneNodes(lanes) {
  const nodes = new Map((lanes?.nodes || []).map((node) => [node.id, node]));
  const edges = lanes?.edges || [];
  if (!nodes.size) return [];
  const incoming = new Set(edges.map((edge) => edge[1]));
  let cursor = [...nodes.keys()].find((id) => !incoming.has(id));
  if (cursor == null) cursor = [...nodes.keys()][0];
  const ordered = [];
  const seen = new Set();
  while (cursor != null && !seen.has(cursor) && nodes.has(cursor)) {
    seen.add(cursor);
    ordered.push(nodes.get(cursor));
    const edge = edges.find((item) => item[0] === cursor && !seen.has(item[1]));
    cursor = edge ? edge[1] : null;
  }
  for (const node of nodes.values()) {
    if (!seen.has(node.id)) ordered.push(node);
  }
  return ordered;
}

export function cometPathFromLanes(lanes, seed, systems = {}) {
  const ordered = orderLaneNodes(lanes);
  const anchor = HEADING_ANCHORS[lanes?.heading] || HEADING_ANCHORS.outer;
  const bearing = hashUnit(`${seed}:bearing`) * Math.PI * 2;
  const list = Object.values(systems);
  const focus = list.length ? list[Math.floor(hashUnit(`${seed}:focus`) * list.length)] : null;
  return ordered.map((node, index) => {
    const along = ordered.length <= 1 ? 0 : index / (ordered.length - 1);
    const angle = (Number(node.angle_degrees) || 0) * Math.PI / 180;
    const spread = ((Number(node.distance) || 0.5) - 0.5) * 16;
    let x = anchor.x + Math.cos(bearing) * along * 62 + Math.cos(angle) * spread;
    let y = anchor.y + Math.sin(bearing) * along * 48 + Math.sin(angle) * spread;
    if (focus && along > 0.62) {
      const pull = (along - 0.62) / 0.38;
      x = x * (1 - pull * 0.72) + focus.x * pull * 0.72;
      y = y * (1 - pull * 0.72) + focus.y * pull * 0.72;
    }
    return {
      x: Math.max(-22, Math.min(122, x)),
      y: Math.max(-20, Math.min(120, y)),
    };
  });
}

export function localCometLanes(seed) {
  const headings = ['outer', 'inner', 'core'];
  const nodes = Array.from({ length: 6 }, (_, index) => ({
    id: index,
    angle_degrees: Math.round(hashUnit(`${seed}:a:${index}`) * 3600) / 10,
    distance: Math.round((0.2 + hashUnit(`${seed}:d:${index}`) * 0.7) * 1000) / 1000,
    speed: Math.round((0.3 + hashUnit(`${seed}:s:${index}`) * 0.5) * 1000) / 1000,
  }));
  return {
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => [node.id, nodes[index + 1].id]),
    heading: headings[Math.floor(hashUnit(`${seed}:h`) * headings.length)],
    source: 'deterministic-fallback',
  };
}

export function pointAlong(path, progress) {
  if (!path?.length) return { x: 50, y: 50 };
  const scaled = Math.max(0, Math.min(0.999, progress)) * (path.length - 1);
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  const from = path[index];
  const to = path[Math.min(path.length - 1, index + 1)];
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
  };
}

export function nearestSystemDistance(point, systems) {
  let best = Infinity;
  for (const system of Object.values(systems || {})) {
    best = Math.min(best, Math.hypot(point.x - system.x, point.y - system.y));
  }
  return best;
}

const TRAVELER_NAMES = {
  comet: ['Harbinger', 'Pale Lantern', 'Ash Wake', 'Widow Light', 'Glass Needle', 'Mourning Star'],
  meteor: ['Cinder', 'Slag', 'Ember', 'Grit', 'Flint', 'Soot'],
};

const TRAVELER_QUOTA = { comet: 2, meteor: 3 };

export function travelerName(kind, seed) {
  const list = TRAVELER_NAMES[kind] || TRAVELER_NAMES.comet;
  return list[Math.floor(hashUnit(`${seed}:name`) * list.length)];
}

export function makeComet(galaxy, seed, kind = 'comet') {
  const lanes = localCometLanes(seed);
  const traveler = kind === 'meteor' ? 'meteor' : 'comet';
  return {
    id: `${traveler}-${seed}`,
    seed,
    kind: traveler,
    name: travelerName(traveler, seed),
    speed: traveler === 'meteor' ? 0.11 : 0.035,
    path: cometPathFromLanes(lanes, seed, galaxy?.systems),
    progress: 0,
    fade: 0,
    heading: lanes.heading,
    source: lanes.source,
    provenance: [],
  };
}

export function tickComets(comets = [], galaxy, turns = 1) {
  const steps = Math.max(0, Math.round(turns));
  if (!steps) return comets;
  return comets.flatMap((comet) => {
    const speed = comet.speed || (comet.kind === 'meteor' ? 0.11 : 0.035);
    const progress = Math.min(1, (comet.progress || 0) + speed * steps);
    const point = pointAlong(comet.path, progress);
    const near = nearestSystemDistance(point, galaxy?.systems) < 8;
    const outside = point.x < 0 || point.y < 0 || point.x > 100 || point.y > 100;
    let fade = comet.fade || 0;
    if (near || progress >= 1 || (outside && progress > 0.25)) fade = Math.min(1, fade + 0.34 * steps);
    if (fade >= 1) return [];
    return [{ ...comet, progress, fade }];
  });
}

export function ensureComets(comets = [], galaxy, turn = 0) {
  const next = comets.map((comet) => {
    const kind = comet.kind === 'meteor' ? 'meteor' : 'comet';
    return {
      ...comet,
      kind,
      name: comet.name || travelerName(kind, comet.seed || comet.id),
      speed: comet.speed || (kind === 'meteor' ? 0.11 : 0.035),
    };
  });
  let guard = 0;
  for (const kind of Object.keys(TRAVELER_QUOTA)) {
    while (next.filter((item) => item.kind === kind).length < TRAVELER_QUOTA[kind] && guard < 8) {
      next.push(makeComet(galaxy, `sky:${turn}:${kind}:${next.length}:${guard}`, kind));
      guard += 1;
    }
  }
  return next;
}
