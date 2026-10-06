/** Orders the system viewer can issue: new worlds, inbound swarms, and republic alerts. */

import { createStrategicPlanet } from './galaxySeed.js';
import {
  MOON_HILL_FRACTION,
  forgeUnit,
  moonLane,
  orbitForBoundMoon,
  sampleAdditionalBody,
  sampleScaffold,
  sampleStar,
  softCircOrb3D,
} from './systemForge.js';
import { massToRadius } from '../physics/bodyScale.js';
import { circOrb3D } from '../presets/scenarios.js';

const BODY_CAP = 48;

export const SYSTEM_ORDERS = [
  { id: 'add-planet', group: 'Formation', label: 'Add planet', detail: 'Settle a new world on its own clear orbit, closer or much farther out.' },
  { id: 'add-moon', group: 'Formation', label: 'Add moon', detail: 'Put a moon in orbit around a planet. A planet that is too close to the star shifts outward first.' },
  { id: 'asteroid-emergence', group: 'Celestial', label: 'Asteroid emergence', detail: 'A swarm falls in from the rim and opens an asteroid emergency.' },
  { id: 'debris-swarm', group: 'Celestial', label: 'Debris swarm', detail: 'Scatter persistent debris and raise a small-body collision alert.' },
  { id: 'rogue-comet', group: 'Celestial', label: 'Rogue comet', detail: 'Send an icy body through the system on a flyby.' },
  { id: 'singularity', group: 'Celestial', label: 'Singularity incursion', detail: 'A rogue black hole swings through and opens an exclusion alert.' },
  { id: 'stellar-pulse', group: 'Celestial', label: 'Stellar pulse', detail: 'Shove every orbit outward and file a stellar-collapse warning.' },
  { id: 'magnetic-pole-shift', group: 'Republic', label: 'Magnetic pole shift', detail: 'Raise a magnetic destabilization on this system.' },
  { id: 'quantum-anomaly', group: 'Republic', label: 'Quantum anomaly', detail: 'Bloom an anomaly the emergency console can answer.' },
  { id: 'colony-unrest', group: 'Republic', label: 'Colony unrest', detail: 'Escalate unrest on an inhabited world.' },
  { id: 'trade-disruption', group: 'Republic', label: 'Supply disruption', detail: 'Break the supply line into this system.' },
  { id: 'piracy-smuggling-network', group: 'Republic', label: 'Smuggling network', detail: 'Flag a smuggling network on the local routes.' },
  { id: 'ruin-discovery', group: 'Republic', label: 'Ruin signal', detail: 'Register a ruin signal the expedition desk can open.' },
];

const ORDER_EVENTS = {
  'asteroid-emergence': 'asteroid-collision',
  'debris-swarm': 'small-body-collision',
  'singularity': 'black-hole-entry',
  'stellar-pulse': 'star-implosion',
  'magnetic-pole-shift': 'magnetic-pole-shift',
  'quantum-anomaly': 'quantum-anomaly',
  'colony-unrest': 'colony-unrest',
  'trade-disruption': 'trade-disruption',
  'piracy-smuggling-network': 'piracy-smuggling-network',
  'ruin-discovery': 'ruin-discovery',
};

export function alertPlanet(system, selectedPlanetId) {
  if (!system?.planets?.length) return null;
  const selected = system.planets.find((planet) => planet.id === selectedPlanetId);
  if (selected && selected.kind !== 'moon' && selected.type !== 'moon') return selected;
  return system.planets.find((planet) => planet.population > 0 && planet.kind !== 'moon' && planet.type !== 'moon')
    || system.planets.find((planet) => planet.kind !== 'moon' && planet.type !== 'moon')
    || system.planets[0];
}

export function republicRecord(systemId, body, index) {
  const record = createStrategicPlanet(systemId, {
    id: body.id,
    name: body.name,
    type: body.type || 'rocky',
    color: body.color,
    mass: body.mass,
    radius: body.radius,
    composition: body.composition,
    atmosphere: body.atmosphere,
    atmosphereScore: body.suitability?.atmosphere,
    water: body.suitability?.water,
    radiation: body.suitability?.radiation,
    fertility: body.suitability?.fertility,
    gravity: body.suitability?.gravity,
    magneticProtection: body.suitability?.magneticProtection,
    anomaly: body.suitability?.anomaly,
    stability: body.stability,
    population: body.populationMillions || 0,
    specialty: (body.suitability?.fertility || 0) > 0.6 ? 'agriculture' : 'research',
    capital: `${body.name} Landing`,
  }, index);
  return {
    ...record,
    archetype: body.archetype,
    palette: body.palette,
    texture: body.texture || null,
    textureUrl: body.textureUrl || null,
    textureMode: body.textureMode || null,
    rings: body.rings,
    orbitRadius: body.orbitRadius,
    inclination: body.inclination,
    theta: body.theta,
    ascNode: body.ascNode,
    moonDistance: body.moonDistance,
    parentId: body.parentId,
    kind: body.kind,
    gaseousness: body.gaseousness,
    temperature: body.temperature,
  };
}

function empty(error) {
  return { simBodies: [], kicks: [], galaxyBody: null, eventType: null, notice: '', error };
}

function starOf(bodies) {
  return bodies.find((body) => body.type === 'star' && body.isAlive !== false) || null;
}

function liveDistance(body, star) {
  if (!body?.position) return 0;
  return Math.hypot(
    body.position[0] - (star?.position?.[0] || 0),
    body.position[1] - (star?.position?.[1] || 0),
    body.position[2] - (star?.position?.[2] || 0),
  );
}

function draftFor(system, bodies, stamp) {
  const starBody = starOf(bodies);
  const base = system?.star?.luminosity
    ? system.star
    : sampleStar(system?.seed || system?.id || 'live', system?.starClass);
  const star = { ...base, simMass: starBody?.mass || base.simMass };
  const scaffold = system?.scaffold || sampleScaffold(system?.seed || system?.id || 'live', star);
  const worlds = (system?.planets || []).filter((planet) => planet.kind !== 'moon' && planet.type !== 'moon');
  return {
    id: system?.id || 'live',
    name: system?.name || 'Live system',
    seed: `${system?.seed || system?.id || 'live'}:${stamp}`,
    star,
    scaffold,
    provenance: system?.provenance || [],
    bodies: worlds.map((planet, slot) => {
      const sim = bodies.find((body) => body.id === planet.id && body.isAlive !== false);
      const fallback = 1.15 * (1.48 ** slot);
      return {
        id: planet.id,
        name: planet.name,
        kind: 'planet',
        type: planet.type || 'rocky',
        orbitRadius: Math.max(planet.orbitRadius || 0, liveDistance(sim, starBody) || 0, fallback),
        mass: sim?.mass || (planet.mass > 0 && planet.mass < 2 ? planet.mass : 0.004),
        radius: sim?.radius || 0.08,
      };
    }),
  };
}

function simType(type) {
  if (type === 'ice') return 'rocky';
  if (['gas_giant', 'rocky', 'moon', 'black_hole'].includes(type)) return type;
  return 'rocky';
}

function aroundStar(star, starMass, orbit, theta, inc, asc, radius) {
  const safe = Math.max(orbit, massToRadius(starMass, 'star') + radius + 0.8);
  const motion = circOrb3D(starMass, safe, theta ?? 0, inc ?? 0, asc ?? 0);
  return {
    position: motion.position.map((value, axis) => value + (star?.position?.[axis] || 0)),
    velocity: motion.velocity.map((value, axis) => value + (star?.velocity?.[axis] || 0)),
  };
}

function relativeTo(body, star) {
  const position = body.position.map((value, axis) => value - (star.position?.[axis] || 0));
  const velocity = body.velocity.map((value, axis) => value - (star.velocity?.[axis] || 0));
  const radius = Math.hypot(...position);
  return { position, velocity, radius };
}

function farthestBound(star, bodies) {
  let outer = 1.2;
  for (const body of bodies) {
    if (body.type === 'star' || body.isAlive === false) continue;
    const rel = relativeTo(body, star);
    if (rel.radius < 0.2) continue;
    const speed = Math.hypot(...rel.velocity);
    const circular = Math.sqrt(star.mass / rel.radius);
    const radial = rel.position.reduce((sum, value, axis) => sum + value * rel.velocity[axis], 0) / rel.radius;
    if (Math.abs(radial) < circular * 0.45 && speed < circular * 1.35) outer = Math.max(outer, rel.radius);
  }
  return outer;
}

function orbitIsClear(orbit, bodyRadius, star, bodies) {
  const starRadius = massToRadius(star.mass, 'star');
  if (orbit < starRadius + bodyRadius + 0.8) return false;
  return bodies.every((body) => {
    if (body.type === 'star' || body.isAlive === false) return true;
    const radius = Math.hypot(...body.position.map((value, axis) => value - (star.position?.[axis] || 0)));
    return Math.abs(radius - orbit) > body.radius + bodyRadius + 0.6;
  });
}

function pushClear(orbit, bodyRadius, star, bodies) {
  let next = orbit;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (orbitIsClear(next, bodyRadius, star, bodies)) return next;
    next += 0.5;
  }
  return next;
}

function toSimBody(body, motion, extra = {}) {
  const type = simType(body.type);
  return {
    id: body.id,
    name: body.name,
    type,
    archetype: body.archetype,
    textureUrl: body.textureUrl || null,
    scar: 0,
    isAlive: true,
    trail: [],
    mass: body.mass,
    radius: body.radius || massToRadius(body.mass, type),
    color: body.color,
    spinRate: 0.2 + forgeUnit(body.id, 'spin') * 0.6,
    position: motion.position,
    velocity: motion.velocity,
    intangibleTicks: 24,
    ...extra,
  };
}

function parentFor(draft, system, selectedBodyId) {
  const planets = draft.bodies.filter((body) => body.kind === 'planet');
  const selected = system?.planets?.find((planet) => planet.id === selectedBodyId);
  const parentId = selected && (selected.kind === 'moon' || selected.type === 'moon')
    ? selected.parentId
    : selectedBodyId;
  return planets.find((planet) => planet.id === parentId) || planets[planets.length - 1] || null;
}

function aimBody(bodies, star, selectedBodyId) {
  const selected = bodies.find((body) => body.id === selectedBodyId && body.isAlive !== false && body.type !== 'star');
  if (selected) return selected;
  const planets = bodies.filter((body) => body.isAlive !== false && body.type !== 'star' && body.type !== 'black_hole');
  return planets[planets.length - 1] || null;
}

function tangent(direction) {
  const axis = Math.abs(direction[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = [
    direction[1] * axis[2] - direction[2] * axis[1],
    direction[2] * axis[0] - direction[0] * axis[2],
    direction[0] * axis[1] - direction[1] * axis[0],
  ];
  const length = Math.hypot(...cross) || 1;
  return cross.map((value) => value / length);
}

function roomFor(bodies, wanted) {
  const alive = bodies.filter((body) => body.isAlive !== false).length;
  return Math.max(0, Math.min(wanted, BODY_CAP - alive));
}

function swarm(star, target, count, kind, stamp) {
  const origin = star?.position || [0, 0, 0];
  const aim = target?.position || [origin[0] + 3, origin[1], origin[2]];
  const relative = aim.map((value, axis) => value - origin[axis]);
  const dist = Math.hypot(...relative) || 3;
  const direction = relative.map((value) => value / dist);
  const side = tangent(direction);
  const shards = [];
  for (let index = 0; index < count; index += 1) {
    const mass = kind === 'asteroid' ? 0.00025 + index * 0.00004 : 0.00012;
    const radius = massToRadius(mass, 'rocky');
    const along = kind === 'asteroid' ? dist * (1.85 + index * 0.07) : radius + (target?.radius || 0.1) + 0.28 + index * 0.05;
    const lateral = (index - (count - 1) / 2) * (kind === 'asteroid' ? 0.28 : 0.08);
    const position = origin.map((value, axis) => value + direction[axis] * along + side[axis] * lateral);
    const toward = aim.map((value, axis) => value - position[axis]);
    const span = Math.hypot(...toward) || 1;
    const speed = kind === 'asteroid' ? 0.38 + index * 0.015 : 0.12;
    const coast = target?.velocity || star?.velocity || [0, 0, 0];
    shards.push({
      id: `${kind}-${stamp}-${index}`,
      name: kind === 'asteroid' ? `Bolide ${index + 1}` : `Debris ${index + 1}`,
      type: 'rocky',
      archetype: index % 2 === 0 ? 'desert' : 'metallic',
      mass,
      radius,
      color: kind === 'asteroid' ? (index % 2 ? '#d2b48c' : '#8d6e63') : (index % 2 ? '#c46b3c' : '#8a7568'),
      position,
      velocity: coast.map((value, axis) => value + (toward[axis] / span) * speed),
      isDebris: true,
      intangibleTicks: kind === 'asteroid' ? 12 : 18,
      scar: kind === 'asteroid' ? 0 : 0.35,
      spinRate: 0.6 + index * 0.08,
      isAlive: true,
      trail: [],
    });
  }
  return shards;
}

function flyby(star, stamp, spec) {
  const origin = star?.position || [0, 0, 0];
  const coast = star?.velocity || [0, 0, 0];
  const reach = 14 + forgeUnit(stamp, spec.id) * 4;
  const miss = 1.4 + forgeUnit(stamp, `${spec.id}:miss`) * 1.2;
  const speed = Math.sqrt((2 * (star?.mass || 8)) / reach) * spec.speedScale;
  return {
    id: `${spec.id}-${stamp}`,
    name: spec.name,
    type: spec.type,
    mass: spec.mass,
    radius: massToRadius(spec.mass, spec.type),
    color: spec.color,
    position: [origin[0] - reach, origin[1] + miss, origin[2] + 0.25],
    velocity: [coast[0] + speed, coast[1] - 0.04, coast[2]],
    intangibleTicks: 10,
    spinRate: 0.15,
    isAlive: true,
    trail: [],
  };
}

export function planSystemOrder(orderId, context = {}) {
  const order = SYSTEM_ORDERS.find((item) => item.id === orderId);
  if (!order) return empty('That order is not available.');
  const bodies = context.bodies || [];
  const system = context.system || null;
  const stamp = String(context.stamp || '0');
  const star = starOf(bodies);
  const eventType = ORDER_EVENTS[orderId] || null;

  if (order.group === 'Republic') {
    if (!system) return empty('Open a republic system before filing this alert.');
    return {
      simBodies: [],
      kicks: [],
      galaxyBody: null,
      eventType,
      notice: `${order.label} plays through ${system.name}. The imperial record is left unchanged.`,
      error: null,
    };
  }

  if (!star) return empty('Open a star system before issuing this order.');

  if (orderId === 'stellar-pulse') {
    const kicks = bodies
      .filter((body) => body.isAlive !== false && body.type !== 'star')
      .map((body) => {
        const relative = body.position.map((value, axis) => value - (star.position?.[axis] || 0));
        const span = Math.hypot(...relative) || 1;
        return { id: body.id, delta: relative.map((value) => (value / span) * 0.16) };
      });
    return {
      simBodies: [],
      kicks,
      galaxyBody: null,
      eventType,
      notice: `A pulse from ${star.name} shoved ${kicks.length} orbits outward.`,
      error: null,
    };
  }

  if (orderId === 'rogue-comet' || orderId === 'singularity') {
    if (roomFor(bodies, 1) < 1) return empty('The system is already full of bodies.');
    const spec = orderId === 'rogue-comet'
      ? { id: 'comet', name: 'Harbinger', type: 'rocky', mass: 0.002, color: '#d5ecff', speedScale: 1.2 }
      : { id: 'singularity', name: 'Interloper', type: 'black_hole', mass: 2.4, color: '#c7a2ff', speedScale: 0.92 };
    const body = flyby(star, stamp, spec);
    return {
      simBodies: [body],
      kicks: [],
      galaxyBody: null,
      eventType,
      notice: orderId === 'rogue-comet'
        ? `${body.name} is crossing ${system?.name || star.name}.`
        : `${body.name} is swinging through ${system?.name || star.name}.`,
      error: null,
    };
  }

  if (orderId === 'asteroid-emergence' || orderId === 'debris-swarm') {
    const target = aimBody(bodies, star, context.selectedBodyId);
    const wanted = orderId === 'asteroid-emergence' ? 8 : 8;
    const count = roomFor(bodies, wanted);
    if (!count) return empty('The system is already full of bodies.');
    const kind = orderId === 'asteroid-emergence' ? 'asteroid' : 'debris';
    const simBodies = swarm(star, target, count, kind, stamp);
    const where = target?.name || star.name;
    return {
      simBodies,
      kicks: [],
      galaxyBody: null,
      eventType,
      notice: kind === 'asteroid'
        ? `${count} bolides are inbound on ${where}.`
        : `${count} debris shards now share ${where}'s orbit.`,
      error: null,
    };
  }

  const draft = draftFor(system, bodies, stamp);
  const kind = orderId === 'add-moon' ? 'moon' : 'planet';
  const parent = kind === 'moon' ? parentFor(draft, system, context.selectedBodyId) : null;
  if (kind === 'moon' && !parent) return empty('Add a planet before placing a moon.');
  const forged = sampleAdditionalBody(draft, kind, parent?.id);
  if (!forged) return empty(kind === 'planet' ? 'This system already holds ten planets.' : 'A moon needs a parent planet.');
  const attach = Boolean(system) && context.systemLabel === system.name;
  if (kind === 'moon') {
    return placeMoon({ star, bodies, forged, parent, stamp, attach });
  }
  return placePlanet({ star, bodies, forged, stamp, attach });
}

function innerReach(star, bodies) {
  let outer = 1.6;
  for (const body of bodies) {
    if (body.type === 'star' || body.isAlive === false || body.isDebris) continue;
    const name = String(body.name || '');
    if (name.startsWith('Shard') || name.startsWith('Debris') || name.startsWith('Bolide')) continue;
    const rel = relativeTo(body, star);
    if (rel.radius < 0.3 || rel.radius > 9) continue;
    outer = Math.max(outer, rel.radius);
  }
  return outer;
}

function placePlanet({ star, bodies, forged, stamp, attach }) {
  const outer = innerReach(star, bodies);
  const scale = 1.25 + forgeUnit(stamp, 'near') * 0.85;
  const massCap = star.mass * 0.006;
  const mass = Math.min(forged.mass, Math.max(massCap, 0.001));
  const type = simType(forged.type);
  const radius = massToRadius(mass, type);
  const orbit = pushClear(outer * scale, radius, star, bodies);
  const theta = forgeUnit(stamp, 'theta') * Math.PI * 2;
  const inclination = 0.05 + forgeUnit(stamp, 'inc') * 0.45;
  const ascNode = forgeUnit(stamp, 'asc') * Math.PI * 2;
  const motion = aroundStar(star, star.mass, orbit, theta, inclination, ascNode, radius);
  const recorded = {
    ...forged,
    mass,
    radius,
    type,
    orbitRadius: orbit,
    theta,
    inclination,
    ascNode,
  };
  return {
    simBodies: [toSimBody(recorded, motion, { intangibleTicks: 0 })],
    kicks: [],
    patches: [],
    revisions: [],
    galaxyBody: attach ? recorded : null,
    eventType: null,
    notice: `${forged.name} settled just beyond the inner worlds.`,
    error: null,
  };
}

function placeMoon({ star, bodies, forged, parent, stamp, attach }) {
  const parentSim = bodies.find((body) => body.id === parent.id && body.isAlive !== false);
  const host = parentSim || {
    ...aroundStar(star, star.mass, parent.orbitRadius || 2, parent.theta ?? 0, parent.inclination ?? 0, parent.ascNode ?? 0, parent.radius || 0.08),
    id: parent.id,
    name: parent.name,
    mass: parent.mass || 0.004,
    radius: parent.radius || massToRadius(parent.mass || 0.004, 'rocky'),
  };
  const moonMass = Math.min(forged.mass, Math.max(host.mass * 0.08, 0.0002));
  const moonRadius = Math.min(massToRadius(moonMass, 'moon'), Math.max(0.03, host.radius * 0.45));
  const lane = moonLane(host.radius, moonRadius);
  const factor = Math.cbrt(Math.max(host.mass, 1e-6) / (3 * star.mass));
  const neededA = orbitForBoundMoon(star.mass, host.mass, lane);
  const rel = relativeTo(host, star);
  const theta = Math.atan2(rel.position[1] || 0, rel.position[0] || 1);
  const inclination = 0.08 + forgeUnit(stamp, 'host-inc') * 0.35;
  const ascNode = forgeUnit(stamp, 'host-asc') * Math.PI * 2;
  let bary = { position: host.position, velocity: host.velocity };
  let orbit = rel.radius || parent.orbitRadius || 2;
  const patches = [];
  const revisions = [];
  let shifted = false;
  if (orbit < neededA * 0.98) {
    const outer = farthestBound(star, bodies.filter((body) => body.id !== host.id));
    orbit = pushClear(Math.max(neededA, outer + host.radius + lane + 0.4), host.radius + lane, star, bodies.filter((body) => body.id !== host.id));
    bary = aroundStar(star, star.mass, orbit, theta, inclination, ascNode, host.radius);
    orbit = Math.hypot(...bary.position.map((value, axis) => value - (star.position?.[axis] || 0)));
    shifted = true;
  }
  revisions.push({
    id: host.id,
    orbitRadius: orbit,
    theta,
    inclination,
    ascNode,
    mass: host.mass,
    radius: host.radius,
  });
  const hill = orbit * factor;
  const reach = Math.max(lane, hill * MOON_HILL_FRACTION);
  const distance = Math.min(Math.max(lane, hill * (0.18 + forgeUnit(stamp, 'moon-gap') * 0.1)), reach);
  const total = host.mass + moonMass;
  const local = softCircOrb3D(total, distance, forgeUnit(stamp, 'moon-theta') * Math.PI * 2, forgeUnit(stamp, 'moon-inc') * 0.8, 0);
  const parentShare = moonMass / total;
  const moonShare = host.mass / total;
  const parentPosition = bary.position.map((value, axis) => value - local.position[axis] * parentShare);
  const parentVelocity = bary.velocity.map((value, axis) => value - local.velocity[axis] * parentShare);
  const moonPosition = bary.position.map((value, axis) => value + local.position[axis] * moonShare);
  const moonVelocity = bary.velocity.map((value, axis) => value + local.velocity[axis] * moonShare);
  patches.push({ id: host.id, position: parentPosition, velocity: parentVelocity });
  const recorded = {
    ...forged,
    mass: moonMass,
    radius: moonRadius,
    type: 'moon',
    kind: 'moon',
    parentId: host.id,
    moonDistance: distance,
    orbitRadius: orbit,
    theta: forgeUnit(stamp, 'moon-theta') * Math.PI * 2,
    inclination: forgeUnit(stamp, 'moon-inc') * 0.8,
    ascNode: 0,
  };
  const moonName = forged.name;
  return {
    simBodies: [toSimBody(recorded, { position: moonPosition, velocity: moonVelocity }, { intangibleTicks: 0 })],
    kicks: [],
    patches,
    revisions: attach ? revisions : [],
    galaxyBody: attach ? recorded : null,
    eventType: null,
    notice: shifted
      ? `${moonName} is orbiting ${host.name}. ${host.name} moved outward so the moon stays bound.`
      : `${moonName} is orbiting ${host.name}.`,
    error: null,
  };
}
