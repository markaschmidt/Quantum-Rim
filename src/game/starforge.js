import { massToRadius } from '../physics/bodyScale.js';
import { quantumRimApi } from '../services/quantumRimApi.js';

function hashUnit(salt) {
  let hash = 2166136261;
  const text = String(salt);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function starBody(anchor, spec, offset, velocity) {
  const type = spec.type || 'star';
  return {
    id: spec.id,
    name: spec.name,
    type,
    mass: spec.mass,
    radius: spec.radius ?? massToRadius(spec.mass, type),
    color: spec.color,
    position: anchor.position.map((value, axis) => value + offset[axis]),
    velocity: anchor.velocity.map((value, axis) => value + velocity[axis]),
    isAlive: true,
    trail: [],
    quasar: spec.quasar || null,
  };
}

function localJet(seed) {
  return {
    azimuth: hashUnit(`${seed}:az`) * Math.PI * 2,
    polar: 0.2 + hashUnit(`${seed}:pol`) * 1.1,
    spontaneity: 0.25 + hashUnit(`${seed}:sp`) * 0.6,
    source: 'deterministic-fallback',
    provenance: [],
  };
}

export async function tuneQuasarJets(seed) {
  try {
    const chart = await quantumRimApi.chartComet({ seed: `quasar:${seed}`, mode: 'emu' });
    const heading = chart.heading || 'outer';
    const azimuth = heading === 'inner' ? 1.15 : heading === 'core' ? 2.55 : 0.35;
    const speeds = (chart.nodes || []).map((node) => Number(node.speed) || 0.5);
    const mean = speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : 0.5;
    return {
      azimuth: azimuth + (hashUnit(`${seed}:wander`) - 0.5) * 0.4,
      polar: 0.25 + mean * 0.9,
      spontaneity: Math.max(0.15, Math.min(0.92, mean)),
      source: chart.source || 'labyrinth',
      provenance: chart.provenance || [],
    };
  } catch {
    return localJet(seed);
  }
}

export const STAR_FORMS = [
  { id: 'blue-giant', label: 'Blue giant' },
  { id: 'white-dwarf', label: 'White dwarf' },
  { id: 'binary', label: 'Binary' },
  { id: 'trinary', label: 'Trinary' },
  { id: 'black-hole', label: 'Black hole' },
  { id: 'quasar', label: 'Quasar' },
];

export function buildStarform(formId, anchor, stamp) {
  const origin = anchor?.position || [0, 0, 0];
  const coast = anchor?.velocity || [0, 0, 0];
  const host = { position: origin, velocity: coast };
  if (formId === 'blue-giant') {
    return [starBody(host, {
      id: `star-${stamp}`, name: 'Blue giant', type: 'star', mass: 4.5, radius: 1.7, color: '#9bb6ff',
    }, [0, 0, 0], [0, 0, 0])];
  }
  if (formId === 'white-dwarf') {
    return [starBody(host, {
      id: `star-${stamp}`, name: 'White dwarf', type: 'star', mass: 1.05, radius: 0.16, color: '#f4fbff',
    }, [0, 0, 0], [0, 0, 0])];
  }
  if (formId === 'black-hole') {
    return [starBody(host, {
      id: `star-${stamp}`, name: 'Event horizon', type: 'black_hole', mass: 3.2, radius: 0.34, color: '#b9a0ff',
    }, [0, 0, 0], [0, 0, 0])];
  }
  if (formId === 'quasar') {
    const jet = localJet(stamp);
    return [starBody(host, {
      id: `star-${stamp}`,
      name: 'Quasar',
      type: 'black_hole',
      mass: 3.6,
      radius: 0.4,
      color: '#ffb45a',
      quasar: { power: 1.15, opening: 0.2, ...jet },
    }, [0, 0, 0], [0, 0, 0])];
  }
  const mass = formId === 'trinary' ? 1.4 : 1.8;
  const sep = 1.5;
  const speed = Math.sqrt(mass / (2 * sep));
  const primary = starBody(host, {
    id: `star-a-${stamp}`, name: 'Primary', type: 'star', mass, radius: 0.55, color: '#ffe0a8',
  }, [-sep / 2, 0, 0], [0, 0, speed]);
  const secondary = starBody(host, {
    id: `star-b-${stamp}`, name: 'Companion', type: 'star', mass: mass * 0.72, radius: 0.38, color: '#ffd0c2',
  }, [sep / 2, 0, 0], [0, 0, -speed * (mass / (mass * 0.72))]);
  if (formId !== 'trinary') return [primary, secondary];
  const tertiarySpeed = Math.sqrt((mass * 1.72) / 4.2);
  const tertiary = starBody(host, {
    id: `star-c-${stamp}`, name: 'Outrider', type: 'star', mass: 0.8, radius: 0.32, color: '#c9dcff',
  }, [0, 0, 4.2], [tertiarySpeed, 0, 0]);
  return [primary, secondary, tertiary];
}
