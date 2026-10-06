/** Where each graded material can be mined. Rare grades are few and sit on hard ground. */

function hashUnit(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export const MATERIAL_GRADES = Object.freeze([
  { id: 'plasmaCells', label: 'Plasma cells', rarity: 'common' },
  { id: 'tibanna', label: 'Tibanna', rarity: 'uncommon' },
  { id: 'coaxium', label: 'Coaxium', rarity: 'rare' },
  { id: 'durasteel', label: 'Durasteel', rarity: 'common' },
  { id: 'doonium', label: 'Doonium', rarity: 'uncommon' },
  { id: 'beskar', label: 'Beskar', rarity: 'rare' },
  { id: 'hypermatter', label: 'Hypermatter', rarity: 'uncommon' },
  { id: 'kyber', label: 'Kyber', rarity: 'rare' },
  { id: 'cortosis', label: 'Cortosis', rarity: 'rare' },
]);

const RARE_IDS = MATERIAL_GRADES.filter((grade) => grade.rarity === 'rare').map((grade) => grade.id);

export function depositForSystem(system) {
  if (!system) return {};
  const zone = system.zone || 'inner';
  const danger = Number(system.routeDanger) || 0;
  const security = Number(system.security ?? 0.5);
  const mix = {};
  if (zone === 'core') {
    mix.plasmaCells = 8;
    mix.durasteel = 6;
  } else if (zone === 'inner') {
    mix.plasmaCells = 4;
    mix.durasteel = 5;
  } else {
    mix.plasmaCells = 1;
    mix.durasteel = 2;
  }
  if (zone === 'inner' || hashUnit(`${system.id}:tibanna`) > 0.78) {
    mix.tibanna = zone === 'inner' ? 4 : 1;
  }
  if (zone === 'inner' && hashUnit(`${system.id}:doonium`) > 0.28) mix.doonium = 3;
  if (zone === 'inner' && hashUnit(`${system.id}:hypermatter`) > 0.34) mix.hypermatter = 3;
  const hardOuter = zone === 'outer' && danger >= 0.45 && security <= 0.4;
  if (hardOuter) {
    if (hashUnit(`${system.id}:coaxium`) > 0.35) mix.coaxium = 2;
    if (hashUnit(`${system.id}:beskar`) > 0.42) mix.beskar = 1;
    if (hashUnit(`${system.id}:kyber`) > 0.55) mix.kyber = 1;
    if (hashUnit(`${system.id}:cortosis`) > 0.62) mix.cortosis = 1;
  }
  return mix;
}

export function hasRareDeposit(system) {
  const mix = system?.deposits || depositForSystem(system);
  return RARE_IDS.some((id) => (mix[id] || 0) > 0);
}

export function ensureDeposits(galaxy) {
  if (!galaxy?.systems) return galaxy;
  const systems = Object.fromEntries(Object.entries(galaxy.systems).map(([id, system]) => [id, {
    ...system,
    deposits: system.deposits && Object.keys(system.deposits).length
      ? system.deposits
      : depositForSystem(system),
  }]));
  return { ...galaxy, systems };
}
