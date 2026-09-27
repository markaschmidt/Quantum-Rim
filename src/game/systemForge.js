import { createStrategicPlanet } from './galaxySeed.js';
import { planQuantumActions } from './planetProfile.js';
import { chooseAppearance, sampleMass, skewSuitability } from './worldCatalog.js';
import { massToRadius } from '../physics/bodyScale.js';
import { SOFTENING } from '../physics/gravity.js';
import { circOrb3D } from '../presets/scenarios.js';

export const SPECTRAL_CLASSES = [
  { id: 'O5', temperature: 40000, color: '#9bb0ff', mass: 18, radius: 6.6, luminosity: 20000 },
  { id: 'B5', temperature: 15000, color: '#aabfff', mass: 5.9, radius: 3.8, luminosity: 800 },
  { id: 'A5', temperature: 8200, color: '#cad7ff', mass: 1.9, radius: 1.7, luminosity: 12 },
  { id: 'F5', temperature: 6500, color: '#f8f7ff', mass: 1.3, radius: 1.3, luminosity: 3.2 },
  { id: 'G2', temperature: 5770, color: '#fff4ea', mass: 1, radius: 1, luminosity: 1 },
  { id: 'K4', temperature: 4500, color: '#ffd2a1', mass: 0.7, radius: 0.78, luminosity: 0.2 },
  { id: 'M3', temperature: 3300, color: '#ffb07a', mass: 0.35, radius: 0.42, luminosity: 0.04 },
];

const NAME_STEMS = ['Aure', 'Vel', 'Nyx', 'Hel', 'Sol', 'Kael', 'Or', 'Mir', 'Ves', 'Lun', 'Kor', 'Sha', 'Eri', 'Thal', 'Quin', 'Bra', 'Isk', 'Pha', 'Tor', 'Yel'];
const NAME_ENDINGS = ['ion', 'ara', 'os', 'ea', 'yx', 'is', 'or', 'une', 'ath', 'eon', 'a', 'um', 'ix', 'el'];
const SYSTEM_TITLES = ['Reach', 'Gate', 'Expanse', 'Works', 'Crown', 'Verge', 'Harbor', 'March'];
const RING_COLORS = {
  gas_giant: '#e6d3a1',
  ice: '#d5ecff',
  rocky: '#c8b8a2',
  moon: '#d9d9d9',
};
const ZONE_RADIUS = { core: 12, inner: 28, outer: 40 };

export function forgeUnit(seed, salt) {
  const value = `${seed}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function round3(value) {
  return Number(value.toFixed(3));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pick(seed, salt, items) {
  const mixed = (forgeUnit(seed, salt) + forgeUnit(`${salt}:spread`, seed)) % 1;
  const index = Math.min(items.length - 1, Math.floor(mixed * items.length));
  return items[index];
}

function hexUnit(seed, salt) {
  return Math.floor(forgeUnit(seed, salt) * 0xfffffff).toString(16).padStart(7, '0');
}

export function sanitizeBodyName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  return clean.length ? clean : null;
}

function uniqueName(seed, salt, used, style) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const stem = pick(seed, `${salt}:stem:${attempt}`, NAME_STEMS);
    const ending = pick(seed, `${salt}:end:${attempt}`, NAME_ENDINGS);
    const title = pick(seed, `${salt}:title:${attempt}`, SYSTEM_TITLES);
    const name = style === 'system' ? `${stem}${ending} ${title}` : `${stem}${ending}`;
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
  }
  const fallback = style === 'system' ? `Forge ${used.size + 1}` : `World ${used.size + 1}`;
  used.add(fallback.toLowerCase());
  return fallback;
}

function normalizeComposition(parts) {
  const total = Object.values(parts).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, round3(value / total)]));
}

function classicalProvenance(detail) {
  return [{
    engine: 'coin-toss',
    operation: 'System entropy seed',
    mode: 'classical-fallback',
    detail: detail || 'Deterministic local seed; Atlas was not consulted.',
    verified: false,
  }];
}

export function sampleStar(seed, spectralClass) {
  const hinted = SPECTRAL_CLASSES.find((item) => item.id === spectralClass);
  const base = hinted || pick(seed, 'class', SPECTRAL_CLASSES);
  const jitter = (forgeUnit(seed, 'temp') - 0.5) * 0.08;
  const massSolar = round3(base.mass * (0.92 + forgeUnit(seed, 'mass') * 0.16));
  const luminosity = round3(base.luminosity * (0.9 + forgeUnit(seed, 'lum') * 0.2));
  return {
    spectralClass: base.id,
    temperature: Math.round(base.temperature * (1 + jitter)),
    color: base.color,
    massSolar,
    radiusSolar: round3(base.radius * (0.94 + forgeUnit(seed, 'radius') * 0.12)),
    luminosity,
    simMass: round3(massSolar * 8),
  };
}

export function sampleScaffold(seed, star, diskMassHint) {
  const diskMass = diskMassHint == null
    ? round3(0.012 + forgeUnit(seed, 'disk') * 0.07)
    : round3(clamp(Number(diskMassHint) || 0.02, 0.005, 0.2));
  const metallicity = round3(forgeUnit(seed, 'metal'));
  const luminosityRoot = Math.sqrt(Math.max(star.luminosity, 0.01));
  const zone = metallicity > 0.66 ? 'core' : metallicity > 0.36 ? 'inner' : 'outer';
  const security = round3(zone === 'core' ? 0.72 + metallicity * 0.2 : zone === 'inner' ? 0.48 + metallicity * 0.2 : 0.22 + metallicity * 0.2);
  return {
    diskMass,
    metallicity,
    snowLine: round3(2.2 + luminosityRoot * 3.2),
    habitableInner: round3(luminosityRoot * 1.6),
    habitableOuter: round3(luminosityRoot * 2.8),
    planetCount: 3 + Math.min(4, Math.floor(forgeUnit(seed, 'count') * 5)),
    zone,
    wealth: round3(clamp(0.22 + metallicity * 0.55 + (star.spectralClass === 'G2' ? 0.08 : 0), 0.15, 0.95)),
    security,
    routeDanger: round3(clamp(1 - security * 0.82, 0.08, 0.92)),
  };
}

function initialOrbit(star) {
  return round3(Math.max(0.85, 0.55 + star.radiusSolar * 0.12));
}

function nextOrbit(seed, salt, previousOrbit) {
  const gap = 1.32 + forgeUnit(seed, salt) * 0.48;
  const expanded = Math.max(previousOrbit * gap, previousOrbit + 0.5);
  return round3(expanded > 36 ? previousOrbit + 0.5 : expanded);
}

function temperatureWord(orbit, scaffold) {
  if (orbit < scaffold.habitableInner * 0.7) return 'hot';
  if (orbit > scaffold.snowLine * 1.4) return 'cryogenic';
  if (orbit > scaffold.snowLine) return 'cold';
  return 'temperate';
}

function localQuantumPlan(body) {
  const actions = planQuantumActions(body, { composition: body.composition });
  const steps = actions.map((action) => ({
    engine: action.engine,
    purpose: action.operation,
    params: {},
    requires_source_asset: action.engine === 'tessa-image' || action.engine === 'blur',
    requires_secondary_asset: false,
  }));
  steps.push({
    engine: 'telablur',
    purpose: 'Proto-disk to mature surface transition',
    params: { transition: 'proto-to-mature' },
    requires_source_asset: true,
    requires_secondary_asset: true,
  });
  return {
    selectionMode: 'deterministic',
    rationale: actions.map((action) => action.reason),
    steps,
  };
}

function buildBody(seed, star, scaffold, priorPlanets, index, used, kind, parent) {
  const orbit = kind === 'moon'
    ? parent.orbitRadius
    : priorPlanets.length
      ? nextOrbit(seed, `gap:${index}`, priorPlanets[priorPlanets.length - 1].orbitRadius)
      : initialOrbit(star);
  const gasRoll = forgeUnit(seed, `gas:${index}`);
  const gaseousness = kind === 'moon'
    ? round3(0.02 + gasRoll * 0.08)
    : round3(Math.min(0.98, scaffold.diskMass * 6 * (0.35 + gasRoll) + (orbit >= scaffold.snowLine ? 0.28 : 0)));
  let type = 'rocky';
  if (kind === 'moon') type = 'moon';
  else if (orbit >= scaffold.snowLine && gaseousness >= 0.42) type = 'gas_giant';
  else if (orbit >= scaffold.snowLine * 1.15 && gaseousness < 0.42) type = 'ice';
  const sizeRoll = forgeUnit(seed, `size:${index}`);
  const mass = round3(sampleMass(kind, type, sizeRoll));
  const ringUnit = forgeUnit(seed, `ring:${index}`);
  const ringsPresent = type === 'gas_giant' ? ringUnit > 0.28 : type === 'ice' ? ringUnit > 0.5 : ringUnit > 0.72;
  const inZone = orbit >= scaffold.habitableInner && orbit <= scaffold.habitableOuter && type === 'rocky';
  const populationMillions = inZone ? round3(4 + forgeUnit(seed, `pop:${index}`) * 36) : 0;
  const composition = type === 'gas_giant'
    ? normalizeComposition({ rock: 0.05, metal: 0.04, ice: 0.16, gas: 0.62 + gaseousness * 0.2 })
    : type === 'ice'
      ? normalizeComposition({ rock: 0.18, metal: 0.07, ice: 0.58, gas: 0.12 })
      : normalizeComposition({
        rock: 0.48 + forgeUnit(seed, `rock:${index}`) * 0.2,
        metal: 0.12 + forgeUnit(seed, `metal:${index}`) * 0.18,
        ice: 0.08 + forgeUnit(seed, `ice:${index}`) * 0.16,
        gas: 0.04 + gaseousness * 0.12,
      });
  const appearance = chooseAppearance(seed, index, type, orbit, scaffold, pick);
  const body = {
    id: `b-${hexUnit(seed, `body:${kind}:${index}`)}`,
    name: uniqueName(seed, `name:${kind}:${index}`, used, 'body'),
    kind,
    type,
    parentId: parent?.id || null,
    archetype: appearance.archetype,
    palette: appearance.palette,
    color: appearance.color,
    mass,
    radius: round3(massToRadius(mass, type === 'ice' ? 'rocky' : type)),
    orbitRadius: orbit,
    moonDistance: kind === 'moon' ? round3(0.16 + forgeUnit(seed, `moon-dist:${index}`) * 0.3) : null,
    inclination: round3((0.02 + forgeUnit(seed, `inc:${index}`) * 0.08) * (1 + orbit / 20)),
    theta: round3(forgeUnit(seed, `theta:${index}`) * 6.283185),
    ascNode: round3(forgeUnit(seed, `asc:${index}`) * 6.283185),
    composition,
    atmosphereTexture: appearance.atmosphereTexture,
    atmosphere: appearance.atmosphere,
    texture: appearance.texture,
    gaseousness,
    temperature: temperatureWord(orbit, scaffold),
    rings: {
      present: ringsPresent,
      opacity: ringsPresent ? round3(0.4 + ringUnit * 0.45) : 0,
      tilt: Math.round((ringUnit - 0.5) * 36),
      color: RING_COLORS[type] || RING_COLORS.rocky,
    },
    suitability: skewSuitability({
      atmosphere: round3(type === 'gas_giant' ? 0.16 : inZone ? 0.58 + forgeUnit(seed, `atmo:${index}`) * 0.3 : 0.22),
      water: round3(type === 'ice' ? 0.78 : inZone ? 0.52 + forgeUnit(seed, `water:${index}`) * 0.3 : 0.16),
      radiation: round3(orbit < scaffold.habitableInner ? 0.62 : 0.18 + forgeUnit(seed, `rad:${index}`) * 0.2),
      fertility: round3(inZone ? 0.48 + forgeUnit(seed, `fert:${index}`) * 0.4 : 0.08),
      gravity: round3(clamp(mass / 0.012, 0.08, 0.96)),
      magneticProtection: round3(type === 'gas_giant' ? 0.74 : 0.36 + forgeUnit(seed, `mag:${index}`) * 0.4),
      anomaly: round3(forgeUnit(seed, `anom:${index}`) * (scaffold.zone === 'outer' ? 0.85 : 0.34)),
    }, appearance.archetype),
    populationMillions,
    stability: Math.round(48 + forgeUnit(seed, `stab:${index}`) * 40 + (inZone ? 8 : 0)),
    history: [],
  };
  body.quantumPlan = localQuantumPlan(body);
  return body;
}

export function generateForgeLocally(seed, options = {}) {
  const cleanSeed = String(seed || 'classical-forge').slice(0, 128);
  const used = new Set();
  const name = uniqueName(cleanSeed, 'system', used, 'system');
  const star = { ...sampleStar(cleanSeed, options.spectralClass), name: name.split(' ')[0] };
  const scaffold = sampleScaffold(cleanSeed, star, options.diskMass);
  const bodies = [];
  for (let index = 0; index < scaffold.planetCount; index += 1) {
    const planets = bodies.filter((body) => body.kind === 'planet');
    bodies.push(buildBody(cleanSeed, star, scaffold, planets, index, used, 'planet', null));
  }
  const draft = {
    id: `sys-${hexUnit(cleanSeed, 'system')}`,
    name,
    seed: cleanSeed,
    selectionMode: options.selectionMode || 'deterministic',
    provenance: options.provenance || classicalProvenance(options.detail),
    star,
    scaffold,
    bodies,
    timeline: 1,
  };
  draft.bodies = draft.bodies.map((body) => withFormationHistory(body, draft));
  return draft;
}

function withFormationHistory(body, draft) {
  return {
    ...body,
    history: [{
      id: `${body.id}:forged`,
      turn: 0,
      eventType: 'forge',
      title: 'Quantum formation record',
      performance: 1,
      outcome: `${body.name} condensed from the ${draft.name} protoplanetary disk.`,
      quantum: draft.provenance,
      appearanceState: 'proto',
    }, ...(body.history || [])],
  };
}

export function sampleAdditionalBody(draft, kind, parentId) {
  const used = new Set([draft.name.toLowerCase(), ...draft.bodies.map((body) => body.name.toLowerCase())]);
  const planets = draft.bodies.filter((body) => body.kind === 'planet');
  const index = draft.bodies.length;
  if (kind === 'moon') {
    const parent = planets.find((body) => body.id === parentId) || planets[planets.length - 1];
    if (!parent) return null;
    return withFormationHistory(buildBody(draft.seed, draft.star, draft.scaffold, planets, index, used, 'moon', parent), draft);
  }
  if (planets.length >= 10) return null;
  return withFormationHistory(buildBody(draft.seed, draft.star, draft.scaffold, planets, index, used, 'planet', null), draft);
}

function mapQuantumPlan(plan) {
  if (!plan) return null;
  return {
    selectionMode: plan.selection_mode || plan.selectionMode || 'deterministic',
    rationale: plan.rationale || [],
    steps: plan.steps || [],
  };
}

function mapProvenance(items) {
  return (items || []).map((item) => ({
    engine: item.engine,
    operation: item.operation,
    mode: item.mode,
    detail: item.detail,
    execution_id: item.execution_id || null,
    verified: Boolean(item.verified),
  }));
}

export function bodyFromService(body, provenance) {
  const mapped = {
    id: body.id,
    name: body.name,
    kind: body.kind,
    type: body.body_type || body.type,
    parentId: body.parent_id || body.parentId || null,
    color: body.color,
    archetype: body.archetype || 'desert',
    palette: body.palette || null,
    texture: body.texture || null,
    textureUrl: body.texture?.url || body.textureUrl || null,
    textureMode: body.texture?.mode || body.textureMode || null,
    mass: body.mass,
    radius: body.radius,
    orbitRadius: body.orbit_radius ?? body.orbitRadius,
    moonDistance: body.moon_distance ?? body.moonDistance ?? null,
    inclination: body.inclination,
    theta: body.theta,
    ascNode: body.asc_node ?? body.ascNode,
    composition: body.composition,
    atmosphere: body.atmosphere,
    atmosphereTexture: body.atmosphere_texture || body.atmosphereTexture,
    gaseousness: body.gaseousness,
    temperature: body.temperature,
    rings: body.rings,
    suitability: body.suitability,
    populationMillions: body.population_millions ?? body.populationMillions ?? 0,
    stability: body.stability,
    quantumPlan: mapQuantumPlan(body.quantum_plan || body.quantumPlan),
    history: [],
  };
  return withFormationHistory(mapped, { name: body.system_name || 'forged system', provenance: mapProvenance(provenance) });
}

export function draftFromService(payload) {
  const provenance = mapProvenance(payload.provenance);
  const draft = {
    id: `sys-${hexUnit(payload.seed, 'system')}`,
    name: payload.name,
    seed: payload.seed,
    selectionMode: payload.selection_mode || payload.selectionMode || 'stochastic',
    provenance,
    star: {
      name: payload.star.name,
      spectralClass: payload.star.spectral_class || payload.star.spectralClass,
      temperature: payload.star.temperature,
      color: payload.star.color,
      massSolar: payload.star.mass_solar ?? payload.star.massSolar,
      radiusSolar: payload.star.radius_solar ?? payload.star.radiusSolar,
      luminosity: payload.star.luminosity,
      simMass: payload.star.sim_mass ?? payload.star.simMass,
    },
    scaffold: {
      diskMass: payload.scaffold.disk_mass ?? payload.scaffold.diskMass,
      metallicity: payload.scaffold.metallicity,
      snowLine: payload.scaffold.snow_line ?? payload.scaffold.snowLine,
      habitableInner: payload.scaffold.habitable_inner ?? payload.scaffold.habitableInner,
      habitableOuter: payload.scaffold.habitable_outer ?? payload.scaffold.habitableOuter,
      planetCount: payload.scaffold.planet_count ?? payload.scaffold.planetCount,
      zone: payload.scaffold.zone,
      wealth: payload.scaffold.wealth,
      security: payload.scaffold.security,
      routeDanger: payload.scaffold.route_danger ?? payload.scaffold.routeDanger,
    },
    bodies: (payload.bodies || []).map((body) => bodyFromService({ ...body, system_name: payload.name }, provenance)),
    timeline: 1,
  };
  return draft;
}

export async function requestForgeSystem(client, request = {}) {
  try {
    const payload = await client.generateSystem({
      seed: request.seed || null,
      spectral_class: request.spectralClass || null,
      disk_mass: request.diskMass ?? null,
      mode: 'emu',
    });
    return draftFromService(payload);
  } catch (error) {
    const fallbackSeed = request.seed || `classical-${Math.floor(forgeUnit(String(Date.now()), 'offline') * 1e9).toString(36)}`;
    return generateForgeLocally(fallbackSeed, {
      spectralClass: request.spectralClass,
      diskMass: request.diskMass,
      detail: `Quantum Rim Services unreachable (${String(error?.message || error).slice(0, 140)}).`,
    });
  }
}

export async function requestForgeBody(client, draft, kind, parentId) {
  const planets = draft.bodies.filter((body) => body.kind === 'planet');
  const parent = planets.find((body) => body.id === parentId) || planets[planets.length - 1] || null;
  try {
    const payload = await client.generateBody({
      system_seed: draft.seed,
      kind,
      spectral_class: draft.star.spectralClass,
      disk_mass: draft.scaffold.diskMass,
      existing_ids: draft.bodies.map((body) => body.id),
      existing_orbits: planets.map((body) => body.orbitRadius),
      existing_names: [draft.name, ...draft.bodies.map((body) => body.name)],
      parent_id: kind === 'moon' ? parent?.id || null : null,
      parent_orbit: kind === 'moon' ? parent?.orbitRadius || null : null,
      mode: 'emu',
    });
    return bodyFromService({ ...payload.body, system_name: draft.name }, payload.provenance || draft.provenance);
  } catch (error) {
    const local = sampleAdditionalBody(draft, kind, parent?.id);
    if (!local) return null;
    return {
      ...local,
      history: local.history.map((entry) => ({
        ...entry,
        quantum: classicalProvenance(`Additional body used a local seed (${String(error?.message || error).slice(0, 80)}).`),
      })),
    };
  }
}

export function placeForgedSystem(galaxy, draft) {
  const existing = Object.values(galaxy.systems || {});
  const radius = ZONE_RADIUS[draft.scaffold.zone] || ZONE_RADIUS.inner;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = forgeUnit(draft.seed, `place:${attempt}`) * Math.PI * 2;
    const span = radius * (0.72 + forgeUnit(draft.seed, `place-rad:${attempt}`) * 0.5);
    const x = round3(clamp(50 + Math.cos(angle) * span, 8, 92));
    const y = round3(clamp(50 + Math.sin(angle) * span * 0.92, 8, 92));
    const crowded = existing.some((system) => (system.x - x) ** 2 + (system.y - y) ** 2 < 36);
    if (!crowded) return { x, y };
  }
  return { x: 50, y: 50 };
}

function uniqueSystemId(galaxy, baseId) {
  if (!galaxy.systems[baseId]) return baseId;
  let suffix = 2;
  while (galaxy.systems[`${baseId}-${suffix}`]) suffix += 1;
  return `${baseId}-${suffix}`;
}

export function commitDraftToGalaxy(galaxy, draft) {
  const id = uniqueSystemId(galaxy, draft.id);
  const position = placeForgedSystem(galaxy, draft);
  const system = {
    id,
    name: draft.name,
    zone: draft.scaffold.zone,
    x: position.x,
    y: position.y,
    starClass: draft.star.spectralClass,
    star: draft.star,
    scaffold: draft.scaffold,
    seed: draft.seed,
    provenance: draft.provenance,
    wealth: draft.scaffold.wealth,
    security: draft.scaffold.security,
    routeDanger: draft.scaffold.routeDanger,
    history: [{
      id: `${id}:forged`,
      turn: 0,
      eventType: 'forge',
      title: 'System commissioned',
      performance: 1,
      outcome: `${draft.name} joined the republic from a quantum-seeded protoplanetary disk.`,
      quantum: draft.provenance,
    }],
    planets: draft.bodies.map((body, index) => {
      const record = createStrategicPlanet(id, {
        id: body.id,
        name: body.name,
        type: body.type,
        color: body.color,
        archetype: body.archetype,
        palette: body.palette,
        texture: body.texture,
        textureUrl: body.textureUrl,
        textureMode: body.textureMode,
        mass: body.mass,
        radius: body.radius,
        composition: body.composition,
        atmosphere: body.atmosphere,
        atmosphereScore: body.suitability.atmosphere,
        water: body.suitability.water,
        radiation: body.suitability.radiation,
        fertility: body.suitability.fertility,
        gravity: body.suitability.gravity,
        magneticProtection: body.suitability.magneticProtection,
        anomaly: body.suitability.anomaly,
        stability: body.stability,
        population: body.populationMillions,
        specialty: body.suitability.fertility > 0.6 ? 'agriculture' : 'research',
        capital: `${body.name} Landing`,
      }, index);
      return {
        ...record,
        atmosphereTexture: body.atmosphereTexture,
        archetype: body.archetype,
        palette: body.palette,
        texture: body.texture,
        textureUrl: body.textureUrl,
        textureMode: body.textureMode,
        gaseousness: body.gaseousness,
        temperature: body.temperature,
        rings: body.rings,
        orbitRadius: body.orbitRadius,
        inclination: body.inclination,
        theta: body.theta,
        ascNode: body.ascNode,
        moonDistance: body.moonDistance,
        parentId: body.parentId,
        kind: body.kind,
        quantumPlan: body.quantumPlan,
        history: body.history || [],
      };
    }),
  };
  const nearest = Object.values(galaxy.systems).sort((left, right) => (
    (left.x - position.x) ** 2 + (left.y - position.y) ** 2
    - ((right.x - position.x) ** 2 + (right.y - position.y) ** 2)
  ))[0];
  const route = nearest ? {
    id: `route-${id}`,
    from: nearest.id,
    to: id,
    distance: Math.max(3, Math.round(Math.hypot(nearest.x - position.x, nearest.y - position.y) / 4)),
    danger: round3((nearest.routeDanger + system.routeDanger) / 2),
    tariff: nearest.zone === system.zone ? 0.06 : 0.12,
    capacity: Math.round(100 - system.routeDanger * 45),
    status: 'open',
  } : null;
  return {
    galaxy: {
      ...galaxy,
      systems: { ...galaxy.systems, [id]: system },
      routes: route ? [...galaxy.routes, route] : galaxy.routes,
    },
    systemId: id,
    planetId: system.planets[0]?.id || null,
  };
}

function safeOrbit(starMass, requested, bodyRadius = 0.08) {
  const starRadius = massToRadius(starMass, 'star');
  return Math.max(requested, starRadius + bodyRadius + 0.35);
}

function orbitalState(starMass, body) {
  const radius = body.radius || 0.08;
  return circOrb3D(
    starMass,
    safeOrbit(starMass, Math.max(0.4, body.orbitRadius || 0.4), radius),
    body.theta || 0,
    body.inclination || 0,
    body.ascNode || 0,
  );
}

export function forgeToSimBodies(draft, phase = 1) {
  const starMass = draft.star.simMass;
  const star = {
    id: `${draft.id}-star`,
    name: draft.star.name || draft.name,
    type: 'star',
    mass: starMass,
    radius: massToRadius(starMass, 'star'),
    color: draft.star.color,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
  };
  if (phase < 0.35) {
    const embryos = draft.bodies.filter((body) => body.kind === 'planet').flatMap((body, index) => (
      [0, 1, 2].map((slot) => {
        const orbit = body.orbitRadius * (0.72 + forgeUnit(draft.seed, `proto:${index}:${slot}`) * 0.2);
        const theta = (body.theta || 0) + slot * 2.094;
        const motion = circOrb3D(
          starMass,
          safeOrbit(starMass, Math.max(0.45, orbit), 0.08),
          theta,
          (body.inclination || 0) * 1.8,
          body.ascNode || 0,
        );
        const mass = round3(0.0008 + forgeUnit(draft.seed, `proto-mass:${index}:${slot}`) * 0.004);
        return {
          id: `${body.id}-proto-${slot}`,
          name: `Proto-${index + 1}${slot + 1}`,
          type: 'rocky',
          mass,
          radius: massToRadius(mass, 'rocky'),
          color: body.color,
          position: motion.position,
          velocity: motion.velocity,
        };
      })
    ));
    return [star, ...embryos];
  }

  const planets = draft.bodies.filter((body) => body.kind !== 'moon').map((body) => {
    const motion = orbitalState(starMass, body);
    return {
      id: body.id,
      name: body.name,
      type: body.type === 'ice' ? 'rocky' : body.type,
      archetype: body.archetype,
      textureUrl: body.textureUrl || null,
      scar: body.scar || 0,
      mass: body.mass,
      radius: body.radius,
      color: body.color,
      spinRate: 0.12 + forgeUnit(body.id, 'spin') * 1.6,
      position: motion.position,
      velocity: motion.velocity,
    };
  });
  const moons = draft.bodies.filter((body) => body.kind === 'moon').flatMap((body) => {
    const parent = planets.find((planet) => planet.id === body.parentId) || planets[planets.length - 1];
    if (!parent) return [];
    const local = circOrb3D(Math.max(parent.mass || 0.01, 0.01), body.moonDistance || 0.22, body.theta || 0, body.inclination || 0, 0);
    return {
      id: body.id,
      name: body.name,
      type: 'moon',
      archetype: body.archetype,
      textureUrl: body.textureUrl || null,
      scar: body.scar || 0,
      spinRate: 0.2 + forgeUnit(body.id, 'spin') * 0.8,
      mass: body.mass,
      radius: body.radius,
      color: body.color,
      position: parent.position.map((value, axis) => value + local.position[axis]),
      velocity: parent.velocity.map((value, axis) => value + local.velocity[axis]),
    };
  });
  return [star, ...planets, ...moons];
}

export function evolutionAppearance(phase) {
  if (phase < 0.34) return 'proto';
  if (phase < 0.67) return 'accretion';
  return 'mature';
}

/** Moons stay inside this share of the Hill sphere, where the planet's pull beats the star's tides. */
export const MOON_HILL_FRACTION = 0.3;

/** Gap past both surfaces. Close moons sit in the softened-gravity zone, so this pad absorbs the remaining wobble. */
export function moonLane(hostRadius, moonRadius) {
  return hostRadius + moonRadius + 0.08;
}

/** Smallest star-orbit that gives this lane a Hill sphere the moon can live in. */
export function orbitForBoundMoon(starMass, planetMass, lane) {
  const factor = Math.cbrt(Math.max(planetMass, 1e-6) / (3 * Math.max(starMass, 1e-6)));
  return (lane / MOON_HILL_FRACTION) / Math.max(factor, 1e-4);
}

/**
 * Circular speed in the same softened gravity the integrator uses.
 * Point-mass speed is too fast once the separation is comparable to the softening length,
 * and the moon flies out of the planet's gravity.
 */
export function softCircOrb3D(centerMass, radius, theta, inc = 0, ascNode = 0) {
  const motion = circOrb3D(centerMass, radius, theta, inc, ascNode);
  const safe = Math.max(radius, 1e-4);
  const kepler = Math.sqrt(Math.max(centerMass, 0) / safe);
  const denom = (safe * safe + SOFTENING * SOFTENING) ** 1.5;
  const speed = safe * Math.sqrt(Math.max(centerMass, 0) / denom);
  const scale = kepler > 1e-8 ? speed / kepler : 1;
  return {
    position: motion.position,
    velocity: motion.velocity.map((value) => value * scale),
  };
}

/** Slide a circular orbit outward in its current plane and retune the speed. */
export function widenCircular(position, velocity, radius, centralMass) {
  const current = Math.hypot(...position) || 1;
  const next = position.map((value) => value * (radius / current));
  const speed = Math.sqrt(Math.max(centralMass, 0) / Math.max(radius, 1e-4));
  const oldSpeed = Math.hypot(...velocity);
  const direction = oldSpeed > 1e-8
    ? velocity
    : [-next[1], next[0], 0];
  const scale = speed / (Math.hypot(...direction) || 1);
  return {
    position: next,
    velocity: direction.map((value) => value * scale),
  };
}

function surveyMass(body, type) {
  if (body.orbitRadius && Number.isFinite(body.mass) && body.mass > 0 && body.mass < 2) return body.mass;
  if (type === 'gas_giant') return 0.08;
  if (type === 'moon') return 0.0006;
  if (body.type === 'ice') return 0.012;
  return 0.004;
}

/** Live N-body bodies for a galaxy system, including seeded worlds that have no stored orbit. */
export function strategicSystemToSimBodies(system) {
  if (!system?.planets) return [];
  const spectral = SPECTRAL_CLASSES.find((item) => item.id === system.starClass)
    || SPECTRAL_CLASSES.find((item) => item.id === 'G2');
  const starMass = system.star?.simMass || round3((spectral?.mass || 1) * 8);
  const star = {
    id: `${system.id}-star`,
    name: system.star?.name || system.name,
    type: 'star',
    mass: starMass,
    radius: massToRadius(starMass, 'star'),
    color: system.star?.color || spectral?.color || '#fff4ea',
    position: [0, 0, 0],
    velocity: [0, 0, 0],
  };
  const worlds = system.planets.filter((body) => body.kind !== 'moon' && body.type !== 'moon');
  const moons = system.planets.filter((body) => body.kind === 'moon' || body.type === 'moon');
  const planets = worlds.map((body, slot) => {
    const type = body.type === 'ice' ? 'rocky' : (body.type || 'rocky');
    const simType = ['gas_giant', 'rocky', 'black_hole'].includes(type) ? type : 'rocky';
    const mass = surveyMass(body, simType);
    const radius = body.orbitRadius && body.radius > 0 && body.radius < 1.5
      ? body.radius
      : massToRadius(mass, simType);
    const orbit = body.orbitRadius || round3(1.15 * (1.48 ** slot));
    const motion = circOrb3D(
      starMass,
      safeOrbit(starMass, orbit, radius),
      body.theta ?? slot * 1.7,
      body.inclination ?? 0.05 + slot * 0.03,
      body.ascNode ?? slot * 0.4,
    );
    return {
      id: body.id,
      name: body.name,
      type: simType,
      archetype: body.archetype,
      textureUrl: body.textureUrl || null,
      scar: body.scar || 0,
      mass,
      radius,
      color: body.color,
      spinRate: 0.2 + forgeUnit(body.id, 'spin') * 0.6,
      position: motion.position,
      velocity: motion.velocity,
    };
  });
  const simMoons = moons.flatMap((body) => {
    const parent = planets.find((planet) => planet.id === body.parentId) || planets[planets.length - 1];
    if (!parent) return [];
    const mass = surveyMass(body, 'moon');
    const radius = body.orbitRadius && body.radius > 0 && body.radius < 0.4
      ? body.radius
      : massToRadius(mass, 'moon');
    const lane = moonLane(parent.radius, radius);
    const needed = orbitForBoundMoon(starMass, parent.mass, lane);
    if (Math.hypot(...parent.position) < needed) {
      const lifted = widenCircular(parent.position, parent.velocity, needed, starMass);
      parent.position = lifted.position;
      parent.velocity = lifted.velocity;
    }
    const factor = Math.cbrt(Math.max(parent.mass, 1e-6) / (3 * starMass));
    const hill = Math.hypot(...parent.position) * factor;
    const distance = Math.min(
      Math.max(body.moonDistance || lane, lane),
      Math.max(lane, hill * MOON_HILL_FRACTION),
    );
    const total = parent.mass + mass;
    const local = softCircOrb3D(total, distance, body.theta ?? 0, body.inclination ?? 0.2, 0);
    const parentShare = mass / total;
    const moonShare = parent.mass / total;
    const baryPosition = parent.position.slice();
    const baryVelocity = parent.velocity.slice();
    parent.position = baryPosition.map((value, axis) => value - local.position[axis] * parentShare);
    parent.velocity = baryVelocity.map((value, axis) => value - local.velocity[axis] * parentShare);
    return {
      id: body.id,
      name: body.name,
      type: 'moon',
      archetype: body.archetype,
      textureUrl: body.textureUrl || null,
      scar: body.scar || 0,
      mass,
      radius,
      color: body.color,
      position: baryPosition.map((value, axis) => value + local.position[axis] * moonShare),
      velocity: baryVelocity.map((value, axis) => value + local.velocity[axis] * moonShare),
    };
  });
  return [star, ...planets, ...simMoons];
}
