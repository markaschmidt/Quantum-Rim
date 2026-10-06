import { depositForSystem } from './deposits.js';

const COMMODITY_KEYS = ['food', 'water', 'plasmaCells', 'tibanna', 'coaxium', 'durasteel', 'doonium', 'beskar', 'hypermatter', 'kyber', 'cortosis'];

function settlement(id, name, population, specialty, overrides = {}) {
  const production = {
    food: specialty === 'agriculture' ? 34 : 12,
    water: specialty === 'water' ? 36 : 15,
    plasmaCells: specialty === 'energy' ? 42 : 18,
    tibanna: 0,
    coaxium: 0,
    durasteel: specialty === 'industry' ? 28 : 8,
    doonium: 0,
    beskar: 0,
    hypermatter: specialty === 'research' ? 6 : 1,
    kyber: 0,
    cortosis: 0,
  };
  const consumption = {
    food: Math.max(8, Math.round(population / 18)),
    water: Math.max(9, Math.round(population / 16)),
    plasmaCells: Math.max(10, Math.round(population / 14)),
    tibanna: 0,
    coaxium: 0,
    durasteel: Math.max(2, Math.round(population / 70)),
    doonium: 0,
    beskar: 0,
    hypermatter: specialty === 'research' ? 2 : 0,
    kyber: 0,
    cortosis: 0,
  };
  return {
    id,
    name,
    population: population * 1_000_000,
    cohorts: {
      settlers: 0.19,
      workers: 0.38,
      scientists: specialty === 'research' ? 0.24 : 0.1,
      merchants: specialty === 'trade' ? 0.21 : 0.12,
      security: 0.11,
    },
    stability: 72,
    housing: 70,
    health: 76,
    infrastructure: 68,
    defense: 58,
    factionInfluence: { imperial: 0.62, guilds: 0.23, frontier: 0.15 },
    production,
    consumption,
    storage: {
      food: 160, water: 190, plasmaCells: 220, tibanna: 12, coaxium: 0,
      durasteel: 90, doonium: 8, beskar: 0, hypermatter: 12, kyber: 1, cortosis: 0,
    },
    imports: [],
    exports: COMMODITY_KEYS.filter((key) => production[key] > consumption[key]),
    activeProjects: [],
    specialty,
    ...overrides,
  };
}

export function createStrategicPlanet(systemId, definition, index) {
  const id = definition.id || `${systemId}-p${index + 1}`;
  const population = definition.population || 0;
  return {
    id,
    systemId,
    name: definition.name,
    type: definition.type || 'rocky',
    color: definition.color || '#6f91b8',
    mass: definition.mass || 1,
    radius: definition.radius || 1,
    composition: definition.composition || { rock: 0.56, metal: 0.2, ice: 0.14, gas: 0.1 },
    atmosphere: definition.atmosphere || 'thin nitrogen-carbon mix',
    suitability: {
      atmosphere: definition.atmosphereScore ?? 0.62,
      water: definition.water ?? 0.58,
      radiation: definition.radiation ?? 0.24,
      fertility: definition.fertility ?? 0.51,
      gravity: definition.gravity ?? 0.71,
      magneticProtection: definition.magneticProtection ?? 0.64,
      anomaly: definition.anomaly ?? 0.16,
    },
    stability: definition.stability ?? 72,
    population: population * 1_000_000,
    appearanceState: 'stable',
    textureUrl: null,
    history: [],
    settlements: population
      ? [settlement(`${id}-capital`, definition.capital || `${definition.name} Prime`, population, definition.specialty || 'industry')]
      : [],
  };
}

const SYSTEM_DEFINITIONS = [
  {
    id: 'aurelia', name: 'Aurelia', zone: 'core', x: 48, y: 47, starClass: 'G2',
    wealth: 0.91, security: 0.88, routeDanger: 0.08,
    planets: [
      { name: 'Crown', color: '#d5b36c', population: 880, specialty: 'research', stability: 91, anomaly: 0.05 },
      { name: 'Vesta-9', color: '#80a8c8', population: 420, specialty: 'trade', water: 0.74 },
    ],
  },
  {
    id: 'bastion', name: 'Bastion Gate', zone: 'core', x: 58, y: 54, starClass: 'F8',
    wealth: 0.82, security: 0.94, routeDanger: 0.1,
    planets: [
      { name: 'Citadel', color: '#a99a8d', population: 350, specialty: 'industry', magneticProtection: 0.82 },
      { name: 'Pelagos', color: '#5d96b8', population: 180, specialty: 'water', water: 0.9 },
    ],
  },
  {
    id: 'meridian', name: 'Meridian Exchange', zone: 'inner', x: 66, y: 35, starClass: 'K4',
    wealth: 0.78, security: 0.62, routeDanger: 0.25,
    planets: [
      { name: 'Mercatoria', color: '#c07b55', population: 290, specialty: 'trade', stability: 77 },
      { name: 'Forge', color: '#895845', population: 210, specialty: 'industry', radiation: 0.42, metal: 0.34 },
    ],
  },
  {
    id: 'helion', name: 'Helion Works', zone: 'inner', x: 36, y: 68, starClass: 'A9',
    wealth: 0.66, security: 0.58, routeDanger: 0.32,
    planets: [
      { name: 'Foundry', color: '#b85d43', population: 240, specialty: 'industry', atmosphereScore: 0.42 },
      { name: 'Cinder', color: '#6e4d45', population: 58, specialty: 'energy', radiation: 0.67, stability: 61 },
    ],
  },
  {
    id: 'selene', name: 'Selene Reach', zone: 'inner', x: 28, y: 37, starClass: 'G8',
    wealth: 0.59, security: 0.55, routeDanger: 0.37,
    planets: [
      { name: 'Arcadia', color: '#6f9f78', population: 195, specialty: 'agriculture', fertility: 0.87 },
      { name: 'Lumen', color: '#b7c6d8', population: 76, specialty: 'research', anomaly: 0.32 },
    ],
  },
  {
    id: 'velorum', name: 'Velorum Frontier', zone: 'outer', x: 81, y: 66, starClass: 'M3',
    wealth: 0.32, security: 0.28, routeDanger: 0.68,
    planets: [
      { name: 'Kestrel', color: '#7d8064', population: 44, specialty: 'industry', stability: 54, anomaly: 0.42 },
      { name: 'Morrow', color: '#5e718d', population: 18, specialty: 'water', water: 0.81, stability: 49 },
    ],
  },
  {
    id: 'nyx', name: 'Nyx Expanse', zone: 'outer', x: 14, y: 73, starClass: 'Black-hole binary',
    wealth: 0.2, security: 0.19, routeDanger: 0.88,
    planets: [
      { name: 'Umbra', color: '#574d74', population: 9, specialty: 'research', radiation: 0.82, anomaly: 0.91, stability: 43 },
      { name: 'Drift', color: '#46566e', type: 'ice', population: 0, water: 0.76, anomaly: 0.67 },
    ],
  },
  {
    id: 'orison', name: 'Orison Ruins', zone: 'outer', x: 74, y: 17, starClass: 'K7',
    wealth: 0.27, security: 0.24, routeDanger: 0.73,
    planets: [
      { name: 'Reliquary', color: '#8d806d', population: 12, specialty: 'research', anomaly: 0.87, stability: 46 },
      { name: 'Ashfall', color: '#76594f', population: 3, specialty: 'industry', atmosphereScore: 0.2, radiation: 0.72 },
    ],
  },
];

const ROUTES = [
  ['aurelia', 'bastion', 3, 0.06], ['aurelia', 'meridian', 5, 0.14],
  ['aurelia', 'selene', 6, 0.18], ['bastion', 'meridian', 4, 0.11],
  ['meridian', 'helion', 7, 0.31], ['selene', 'helion', 5, 0.26],
  ['meridian', 'velorum', 9, 0.58], ['selene', 'nyx', 11, 0.79],
  ['bastion', 'orison', 10, 0.64], ['velorum', 'orison', 8, 0.7],
];

export function createGalaxySeed() {
  const systems = Object.fromEntries(SYSTEM_DEFINITIONS.map((definition) => [
    definition.id,
    {
      ...definition,
      deposits: depositForSystem(definition),
      planets: definition.planets.map((item, index) => createStrategicPlanet(definition.id, item, index)),
      history: [],
    },
  ]));
  const routes = ROUTES.map(([from, to, distance, danger], index) => ({
    id: `route-${index + 1}`,
    from,
    to,
    distance,
    danger,
    tariff: systems[from].zone === systems[to].zone ? 0.06 : 0.12,
    capacity: Math.round(100 - danger * 45),
    status: 'open',
  }));
  return {
    id: 'quantum-rim-galaxy',
    name: 'Quantum Rim',
    zones: {
      core: { id: 'core', name: 'Core Worlds', description: 'Stable, wealthy, regulated and research-heavy.' },
      inner: { id: 'inner', name: 'Inner Rim', description: 'Industrial, commercial and politically contested.' },
      outer: { id: 'outer', name: 'Outer Rim', description: 'Frontier ruins, piracy, anomalies and rare resources.' },
    },
    systems,
    routes,
  };
}

export function findPlanet(galaxy, planetId) {
  for (const system of Object.values(galaxy.systems)) {
    const planet = system.planets.find((candidate) => candidate.id === planetId);
    if (planet) return planet;
  }
  return null;
}

export function findSystemForPlanet(galaxy, planetId) {
  return Object.values(galaxy.systems).find(
    (system) => system.planets.some((planet) => planet.id === planetId),
  ) || null;
}
