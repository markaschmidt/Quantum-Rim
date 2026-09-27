/** Severity-scaled impacts: orbit kicks, scars, and persistent debris. */

import { massToRadius } from './bodyScale.js';

const DEBRIS_CAP = 36;

export function severityBand(severity) {
  if (severity < 0.38) return 'graze';
  if (severity < 0.72) return 'battering';
  return 'cataclysm';
}

export function measureImpact(bodyA, bodyB) {
  const dx = bodyB.position[0] - bodyA.position[0];
  const dy = bodyB.position[1] - bodyA.position[1];
  const dz = bodyB.position[2] - bodyA.position[2];
  const dist = Math.hypot(dx, dy, dz) || 1e-10;
  const normal = [dx / dist, dy / dist, dz / dist];
  const relative = [
    bodyA.velocity[0] - bodyB.velocity[0],
    bodyA.velocity[1] - bodyB.velocity[1],
    bodyA.velocity[2] - bodyB.velocity[2],
  ];
  const speed = Math.hypot(...relative);
  const closing = relative[0] * normal[0] + relative[1] * normal[1] + relative[2] * normal[2];
  const approach = speed > 1e-8 ? Math.min(1, Math.max(0, closing / speed)) : 0;
  const massRatio = Math.min(bodyA.mass, bodyB.mass) / Math.max(bodyA.mass, bodyB.mass, 1e-8);
  const speedNorm = Math.min(1, speed / 1.1);
  const severity = Math.min(1, Math.max(0, 0.5 * speedNorm + 0.35 * approach + 0.15 * massRatio));
  return {
    normal,
    dist,
    speed,
    closing,
    approaching: closing > 0,
    severity,
    band: severityBand(severity),
    massRatio,
  };
}

function kickScale(band) {
  if (band === 'graze') return 0.45;
  return 0.8;
}

function scarAmount(band) {
  if (band === 'graze') return 0.15;
  if (band === 'battering') return 0.45;
  return 0.85;
}

function separate(bodyA, bodyB, normal, dist) {
  const overlap = bodyA.radius + bodyB.radius - dist + 0.02;
  if (overlap <= 0) return [bodyA, bodyB];
  const push = overlap / 2;
  return [
    {
      ...bodyA,
      position: bodyA.position.map((value, axis) => value - normal[axis] * push),
    },
    {
      ...bodyB,
      position: bodyB.position.map((value, axis) => value + normal[axis] * push),
    },
  ];
}

export function applyImpact(bodyA, bodyB) {
  const impact = measureImpact(bodyA, bodyB);
  if (!impact.approaching || impact.band === 'cataclysm') {
    return { ...impact, merged: impact.band === 'cataclysm' && impact.approaching, bodyA, bodyB };
  }
  const scale = kickScale(impact.band);
  const massSum = bodyA.mass + bodyB.mass;
  const impulse = (2 * bodyA.mass * bodyB.mass * impact.closing) / massSum;
  const deltaA = impact.normal.map((axis) => -(impulse / bodyA.mass) * axis * scale);
  const deltaB = impact.normal.map((axis) => (impulse / bodyB.mass) * axis * scale);
  const permanent = impact.severity >= 0.6;
  const scar = scarAmount(impact.band);
  const kickedA = {
    ...bodyA,
    velocity: bodyA.velocity.map((value, axis) => value + deltaA[axis]),
    scar: Math.min(1, (bodyA.scar || 0) + scar * 0.5),
    orbitPerturbed: true,
    kick: { band: impact.band, permanent, excess: deltaA, severity: impact.severity },
  };
  const kickedB = {
    ...bodyB,
    velocity: bodyB.velocity.map((value, axis) => value + deltaB[axis]),
    scar: Math.min(1, (bodyB.scar || 0) + scar),
    orbitPerturbed: true,
    kick: { band: impact.band, permanent, excess: deltaB, severity: impact.severity },
  };
  const [separatedA, separatedB] = separate(kickedA, kickedB, impact.normal, impact.dist);
  return { ...impact, merged: false, bodyA: separatedA, bodyB: separatedB };
}

export function debrisCountFor(band, unit = 0) {
  const roll = Math.min(0.999, Math.max(0, unit));
  if (band === 'graze') return 0;
  if (band === 'battering') return 6 + Math.floor(roll * 5);
  return 10 + Math.floor(roll * 5);
}

function perpendicular(normal) {
  const axis = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = [
    normal[1] * axis[2] - normal[2] * axis[1],
    normal[2] * axis[0] - normal[0] * axis[2],
    normal[0] * axis[1] - normal[1] * axis[0],
  ];
  const length = Math.hypot(...cross) || 1;
  return cross.map((value) => value / length);
}

export function buildDebris({
  bodyA,
  bodyB,
  band,
  unit = 0,
  existingCount = 0,
  idBase = 'impact',
}) {
  const room = Math.max(0, DEBRIS_CAP - existingCount);
  const count = Math.min(room, debrisCountFor(band, unit));
  if (count === 0) return [];
  const impact = measureImpact(bodyA, bodyB);
  const contact = bodyA.position.map((value, axis) => value + impact.normal[axis] * bodyA.radius);
  const tangent = perpendicular(impact.normal);
  const binormal = [
    impact.normal[1] * tangent[2] - impact.normal[2] * tangent[1],
    impact.normal[2] * tangent[0] - impact.normal[0] * tangent[2],
    impact.normal[0] * tangent[1] - impact.normal[1] * tangent[0],
  ];
  const parentSpeed = Math.max(impact.speed, 0.15);
  const shards = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const spread = 0.35 + (index % 5) * 0.08;
    const direction = impact.normal.map((value, axis) => (
      value * 0.45 + tangent[axis] * Math.cos(angle) * spread + binormal[axis] * Math.sin(angle) * spread
    ));
    const length = Math.hypot(...direction) || 1;
    const mass = 0.00012 + (index % 4) * 0.00005;
    const offset = 0.04 + (index % 3) * 0.02;
    shards.push({
      id: `debris-${idBase}-${index}`,
      name: `Shard ${index + 1}`,
      type: 'rocky',
      archetype: 'desert',
      mass,
      radius: massToRadius(mass, 'rocky'),
      color: index % 2 === 0 ? '#8a7568' : '#c46b3c',
      position: contact.map((value, axis) => value + direction[axis] / length * offset),
      velocity: [
        (bodyA.velocity[0] + bodyB.velocity[0]) / 2 + (direction[0] / length) * parentSpeed * 0.65,
        (bodyA.velocity[1] + bodyB.velocity[1]) / 2 + (direction[1] / length) * parentSpeed * 0.65,
        (bodyA.velocity[2] + bodyB.velocity[2]) / 2 + (direction[2] / length) * parentSpeed * 0.65,
      ],
      isAlive: true,
      isDebris: true,
      trail: [],
      intangibleTicks: 20,
      scar: 0.35,
      spinRate: 0.8 + index * 0.07,
    });
  }
  return shards;
}

export function relaxOrbitKicks(bodies, dt) {
  const fade = 1 - Math.exp(-Math.max(0, dt) / 6);
  return bodies.map((body) => {
    let next = body.intangibleTicks > 0
      ? { ...body, intangibleTicks: body.intangibleTicks - 1 }
      : body;
    if (!next.kick || next.kick.permanent || !next.kick.excess) return next;
    const excess = next.kick.excess;
    const remaining = excess.map((value) => value * (1 - fade));
    const energy = remaining.reduce((sum, value) => sum + value * value, 0);
    return {
      ...next,
      velocity: next.velocity.map((value, axis) => value - excess[axis] * fade),
      kick: energy < 1e-8 ? null : { ...next.kick, excess: remaining },
    };
  });
}
