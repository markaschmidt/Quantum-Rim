function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed, offset = 0) {
  let value = (seed + Math.imul(offset + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967295;
}

function normalizeComposition(parts) {
  const total = Object.values(parts).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [key, Number((value / total).toFixed(2))]),
  );
}

export function planQuantumActions(body, profile) {
  const actions = [{
    engine: 'tessa-image',
    operation: 'Planetary palette and atmospheric identity',
    reason: 'Maps the generated color and composition into a stable visual identity.',
    mode: 'planned',
  }];
  const volatile = (profile.composition.gas || 0) + (profile.composition.ice || 0);
  if (body.type === 'gas_giant' || volatile >= 0.45) {
    actions.push({
      engine: 'blur',
      operation: 'Atmospheric band and storm transformation',
      reason: 'Volatile-rich worlds benefit from non-local cloud structures.',
      mode: 'planned',
    });
  }
  if ((profile.composition.rock || 0) >= 0.5 || (profile.composition.metal || 0) >= 0.25) {
    actions.push({
      engine: 'labyrinth',
      operation: 'Terrain regions and infrastructure graph',
      reason: 'Rock and metal regions become survey, settlement, and crisis nodes.',
      mode: 'planned',
    });
  }
  if (body.mass >= 0.08) {
    actions.push({
      engine: 'retrocausal-echo',
      operation: 'Sensor and inspection audio identity',
      reason: 'Large bodies receive a distinctive anomaly signature.',
      mode: 'planned',
    });
  }
  if (body.radius >= 0.8 && !actions.some((action) => action.engine === 'blur')) {
    actions.push({
      engine: 'blur',
      operation: 'Large-scale albedo and weather variation',
      reason: 'The world is large enough for regional changes to remain legible from the galaxy view.',
      mode: 'planned',
    });
  }
  return actions;
}

export function deriveBodyProfile(body) {
  const sourceFingerprint = `${body.type}:${body.color}:${body.mass.toFixed(8)}:${body.radius.toFixed(8)}`;
  if (body.profile?.sourceFingerprint === sourceFingerprint) return body.profile;
  const seed = hashString(`${body.id}:${body.name}:${sourceFingerprint}`);
  const rocky = body.type === 'rocky' || body.type === 'moon';
  const gasGiant = body.type === 'gas_giant';
  const composition = normalizeComposition({
    rock: rocky ? 0.52 + randomFrom(seed, 1) * 0.28 : 0.04 + randomFrom(seed, 1) * 0.12,
    metal: rocky ? 0.12 + randomFrom(seed, 2) * 0.28 : 0.03 + randomFrom(seed, 2) * 0.08,
    ice: 0.04 + randomFrom(seed, 3) * (gasGiant ? 0.34 : 0.28),
    gas: gasGiant ? 0.65 + randomFrom(seed, 4) * 0.25 : 0.03 + randomFrom(seed, 4) * 0.16,
  });
  const atmosphere = gasGiant
    ? 'deep hydrogen-helium envelope'
    : randomFrom(seed, 5) > 0.7
      ? 'dense reactive atmosphere'
      : randomFrom(seed, 5) > 0.35
        ? 'thin nitrogen-carbon mix'
        : 'trace exosphere';
  const habitability = rocky
    ? Math.round((0.18 + randomFrom(seed, 6) * 0.68) * 100)
    : Math.round(randomFrom(seed, 6) * 12);
  const population = rocky && habitability > 42
    ? Math.round((habitability / 100) * (40 + randomFrom(seed, 7) * 960)) * 1000000
    : 0;
  const profile = {
    sourceFingerprint,
    seed,
    classification: gasGiant ? 'Imperial gas reserve' : rocky ? 'Colonial terrestrial' : body.type.replace('_', ' '),
    composition,
    atmosphere,
    temperature: ['cryogenic', 'cold', 'temperate', 'hot'][Math.floor(randomFrom(seed, 8) * 4)],
    habitability,
    population,
    stability: Math.round((0.42 + randomFrom(seed, 9) * 0.5) * 100),
    output: {
      energy: Math.round(8 + randomFrom(seed, 10) * 75),
      alloy: Math.round(5 + composition.metal * 100),
      food: population ? Math.round(12 + habitability * 0.5) : 0,
    },
  };
  profile.quantumActions = planQuantumActions(body, profile);
  return profile;
}

export function decorateBody(body) {
  if (!['rocky', 'moon', 'gas_giant'].includes(body.type)) return body;
  return { ...body, profile: deriveBodyProfile(body) };
}
