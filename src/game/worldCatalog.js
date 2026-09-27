export const PALETTES = {
  rocky: [
    ['sulfur', '#d6c15a'],
    ['copper', '#c46b3c'],
    ['verdigris', '#2f8f72'],
    ['violet', '#7a4e8a'],
    ['ash', '#8d8678'],
    ['bone', '#e6d3ae'],
    ['blood', '#8e2430'],
    ['abyssal', '#16324f'],
  ],
  gas_giant: [
    ['amber', '#d7b56a'],
    ['rose', '#e08aa0'],
    ['teal', '#2fbfae'],
    ['indigo', '#5c5cc4'],
    ['cream', '#f3e2c2'],
    ['storm', '#6e7c92'],
  ],
  ice: [
    ['glacier', '#d5ecff'],
    ['methane', '#7ed0c4'],
    ['violet-ice', '#c9b6f0'],
    ['slate', '#93a4c4'],
    ['rose-ice', '#f0c9d8'],
  ],
  moon: [
    ['regolith', '#c5c8d4'],
    ['basalt', '#5e564e'],
    ['frost', '#e7f3ff'],
    ['rust', '#a15a3a'],
    ['olivine', '#7d8a4a'],
  ],
};

export const ARCHETYPE_SPECS = {
  lava: {
    family: 'volcanic',
    sources: ['Volcanic.png'],
    atmosphere: 'molten silicate veil',
    texture: 'storm',
  },
  oceanic: {
    family: 'terrestrial',
    sources: ['Terrestrial1.png', 'Terrestrial2.png', 'Terrestrial3.png', 'Terrestrial4.png'],
    atmosphere: 'humid ocean world',
    texture: 'cloudy',
  },
  desert: {
    family: 'martian',
    sources: ['Martian.png'],
    atmosphere: 'dusty carbon-dioxide veil',
    texture: 'dusty',
  },
  jungle: {
    family: 'tropical',
    sources: ['Tropical.png'],
    atmosphere: 'dense photosynthetic canopy',
    texture: 'cloudy',
  },
  crystalline: {
    family: 'icy',
    sources: ['Icy.png'],
    atmosphere: 'thin nitrogen-methane haze',
    texture: 'haze',
  },
  metallic: {
    family: 'alpine',
    sources: ['Alpine.png'],
    atmosphere: 'trace metallic exosphere',
    texture: 'clear',
  },
  volatile: {
    family: 'gaseous',
    sources: ['Gaseous1.png', 'Gaseous2.png', 'Gaseous3.png', 'Gaseous4.png'],
    atmosphere: 'storm-banded hydrogen envelope',
    texture: 'banded',
  },
  venusian: {
    family: 'venusian',
    sources: ['Venusian.png'],
    atmosphere: 'crushing sulfur greenhouse',
    texture: 'haze',
  },
  swamp: {
    family: 'swamp',
    sources: ['Swamp.png'],
    atmosphere: 'methane wetland shroud',
    texture: 'cloudy',
  },
  savannah: {
    family: 'savannah',
    sources: ['Savannah.png'],
    atmosphere: 'dry seasonal sky',
    texture: 'dusty',
  },
};

const CLOUDS = ['Clouds1.png', 'Clouds2.png', 'Clouds3.png', 'Clouds4.png'];

export const ARCHETYPE_INDEX = {
  lava: 1,
  oceanic: 2,
  desert: 3,
  jungle: 4,
  crystalline: 5,
  metallic: 6,
  volatile: 7,
  venusian: 8,
  swamp: 9,
  savannah: 10,
};

export function sampleMass(kind, type, sizeRoll) {
  if (kind === 'moon') return 0.00015 + sizeRoll * 0.012;
  if (type === 'gas_giant') {
    return sizeRoll > 0.72 ? 0.16 + sizeRoll * 0.55 : 0.028 + sizeRoll * 0.2;
  }
  if (type === 'ice') {
    return sizeRoll < 0.34 ? 0.002 + sizeRoll * 0.012 : 0.012 + sizeRoll * 0.11;
  }
  if (sizeRoll < 0.28) return 0.0003 + sizeRoll * 0.006;
  if (sizeRoll > 0.78) return 0.014 + (sizeRoll - 0.78) * 0.16;
  return 0.0016 + sizeRoll * 0.014;
}

export function chooseAppearance(seed, index, type, orbit, scaffold, pick) {
  const paletteKey = type === 'gas_giant' || type === 'ice' || type === 'moon' ? type : 'rocky';
  const [palette, color] = pick(seed, `palette:${index}`, PALETTES[paletteKey]);
  const hot = orbit < scaffold.habitableInner * 0.7;
  const inZone = orbit >= scaffold.habitableInner && orbit <= scaffold.habitableOuter && type === 'rocky';
  let options;
  if (type === 'gas_giant') options = ['volatile'];
  else if (type === 'ice') options = ['crystalline', 'volatile'];
  else if (type === 'moon') options = ['metallic', 'desert', 'crystalline', 'savannah'];
  else if (hot) options = ['lava', 'venusian', 'desert'];
  else if (inZone) options = ['oceanic', 'jungle', 'swamp', 'savannah'];
  else options = ['crystalline', 'metallic', 'desert', 'savannah'];
  const archetype = options.length === 1 ? options[0] : pick(seed, `archetype:${index}`, options);
  const spec = ARCHETYPE_SPECS[archetype];
  const source = pick(seed, `source:${index}`, spec.sources);
  return {
    archetype,
    palette,
    color,
    atmosphere: spec.atmosphere,
    atmosphereTexture: spec.texture,
    texture: {
      family: spec.family,
      source,
      secondary: pick(seed, `clouds:${index}`, CLOUDS),
      seed: `${seed}:tex:${index}`,
      archetype,
      palette,
      url: null,
      mode: 'pending',
    },
  };
}

export function skewSuitability(suitability, archetype) {
  const next = { ...suitability };
  if (archetype === 'lava' || archetype === 'venusian') {
    next.fertility = Math.min(next.fertility, 0.08);
    next.radiation = Math.max(next.radiation, 0.62);
    next.water = Math.min(next.water, 0.08);
  } else if (archetype === 'oceanic') {
    next.water = Math.max(next.water, 0.72);
    next.atmosphere = Math.max(next.atmosphere, 0.6);
  } else if (archetype === 'jungle' || archetype === 'swamp') {
    next.fertility = Math.max(next.fertility, 0.7);
    next.water = Math.max(next.water, 0.55);
  } else if (archetype === 'desert' || archetype === 'savannah') {
    next.water = Math.min(next.water, 0.22);
  } else if (archetype === 'crystalline') {
    next.water = Math.max(next.water, 0.4);
    next.fertility = Math.min(next.fertility, 0.16);
  } else if (archetype === 'metallic') {
    next.gravity = Math.max(next.gravity, 0.55);
    next.fertility = Math.min(next.fertility, 0.12);
  }
  return next;
}
