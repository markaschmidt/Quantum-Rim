import { lerpHex } from '../utils/colors.js';

function hashUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#668cab';
}

export function planetVisualProperties(planet) {
  const color = safeColor(planet?.color);
  const id = planet?.id || planet?.name || 'unidentified-world';
  const atmosphere = planet?.suitability?.atmosphere ?? 0.5;
  const water = planet?.suitability?.water ?? planet?.composition?.ice ?? 0.25;
  const radiation = planet?.suitability?.radiation ?? 0.2;
  const gas = planet?.composition?.gas ?? 0.1;
  const ice = planet?.composition?.ice ?? 0.1;
  const cloudOpacity = Math.max(0.08, Math.min(0.68, atmosphere * 0.48 + water * 0.24));
  const atmosphereOpacity = Math.max(0.2, Math.min(0.92, atmosphere * 0.72 + 0.18));
  const rings = planet?.rings?.present ? planet.rings : null;
  return {
    '--planet-color': color,
    '--planet-light': lerpHex(color, '#eef8ff', 0.58),
    '--planet-dark': lerpHex(color, '#020610', 0.72),
    '--planet-land': lerpHex(color, radiation > 0.55 ? '#9b4b31' : '#6f8450', 0.38),
    '--planet-ocean': lerpHex(color, '#164d86', Math.max(0.28, water * 0.72)),
    '--planet-atmosphere': lerpHex(color, ice > 0.34 ? '#bfe9ff' : '#63c9ff', 0.62),
    '--planet-cloud-opacity': cloudOpacity.toFixed(3),
    '--planet-atmosphere-opacity': atmosphereOpacity.toFixed(3),
    '--planet-rotation': `${Math.round(hashUnit(`${id}:rotation`) * 300 - 150)}deg`,
    '--planet-offset-x': `${Math.round(18 + hashUnit(`${id}:x`) * 34)}%`,
    '--planet-offset-y': `${Math.round(20 + hashUnit(`${id}:y`) * 46)}%`,
    '--planet-band-scale': (0.72 + gas * 0.9).toFixed(2),
    '--planet-ring-opacity': rings ? Number(rings.opacity ?? 0.7).toFixed(3) : '0',
    '--planet-ring-color': rings?.color || '#d5ecff',
    '--planet-ring-tilt': `${Number(rings?.tilt) || 0}deg`,
    '--planet-gaseousness': Number(planet?.gaseousness ?? gas).toFixed(3),
  };
}

const ATMOSPHERE_TEXTURES = new Set(['banded', 'storm', 'haze', 'cloudy', 'dusty', 'clear', 'trace']);

export function planetAtmosphereTexture(planet) {
  return ATMOSPHERE_TEXTURES.has(planet?.atmosphereTexture) ? planet.atmosphereTexture : 'cloudy';
}

export function planetVisualClass(planet) {
  if (planet?.type === 'gas_giant') return 'gas';
  if (planet?.type === 'ice' || (planet?.composition?.ice ?? 0) > 0.38) return 'ice';
  return 'rocky';
}
