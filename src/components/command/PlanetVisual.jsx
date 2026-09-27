import { planetAtmosphereTexture, planetVisualClass, planetVisualProperties } from '../../game/planetVisual.js';

function imageValue(url) {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed || /^javascript:/i.test(trimmed)) return undefined;
  const allowed = /^(https?:|blob:|data:image\/)/i.test(trimmed)
    || trimmed.startsWith('/')
    || trimmed.startsWith('./');
  return allowed ? `url(${JSON.stringify(trimmed)})` : undefined;
}

function textureMotion(planet) {
  const salt = String(planet?.texture?.seed || planet?.id || 'world');
  let hash = 0;
  for (let index = 0; index < salt.length; index += 1) {
    hash = (hash * 33 + salt.charCodeAt(index)) % 3600;
  }
  return {
    transform: `rotate(${hash % 360}deg) scale(${(1.15 + (hash % 40) / 100).toFixed(2)})`,
  };
}

export function PlanetVisual({ planet, size = 'thumbnail', className = '' }) {
  const mappedTexture = imageValue(planet?.textureUrl);
  const quantum = planet?.textureMode === 'quantum' || planet?.textureMode === 'emulator';
  const texture = planetAtmosphereTexture(planet);
  const ringed = Boolean(planet?.rings?.present);
  const classes = [
    'planet-visual',
    `planet-visual--${size}`,
    `planet-visual--${planetVisualClass(planet)}`,
    `planet-visual--texture-${texture}`,
    `planet-visual--${planet?.archetype || 'desert'}`,
    ringed ? 'planet-visual--ringed' : '',
    mappedTexture ? 'planet-visual--mapped' : '',
    quantum ? 'planet-visual--quantum' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      style={planetVisualProperties(planet)}
      aria-label={`${planet?.name || 'Planet'} atmospheric survey image`}
      role="img"
    >
      {ringed && <span className="planet-visual__rings" />}
      <span className="planet-visual__surface" />
      {mappedTexture && (
        <span
          className="planet-visual__quantum"
          style={{ backgroundImage: mappedTexture, ...textureMotion(planet) }}
        />
      )}
      <span className={`planet-visual__clouds planet-visual__clouds--${texture}`} />
      <span className="planet-visual__atmosphere" />
      <span className="planet-visual__shade" />
    </span>
  );
}
