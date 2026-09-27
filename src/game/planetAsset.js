function hashUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function createPlanetInlineAsset(planet) {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;
  const radius = size * 0.45;

  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();

  const surface = context.createRadialGradient(
    size * 0.34,
    size * 0.28,
    size * 0.04,
    center,
    center,
    radius,
  );
  surface.addColorStop(0, '#ffffff');
  surface.addColorStop(0.18, planet.color);
  surface.addColorStop(1, '#07101d');
  context.fillStyle = surface;
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 28; index += 1) {
    const x = hashUnit(`${planet.id}:x:${index}`) * size;
    const y = hashUnit(`${planet.id}:y:${index}`) * size;
    const patchRadius = 2 + hashUnit(`${planet.id}:r:${index}`) * 11;
    const alpha = 0.05 + hashUnit(`${planet.id}:a:${index}`) * 0.12;
    context.fillStyle = `rgba(6, 18, 30, ${alpha})`;
    context.beginPath();
    context.arc(x, y, patchRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  return {
    kind: 'image',
    media_type: 'image/png',
    filename: `${planet.id.replace(/[^a-z0-9_-]/gi, '-')}-surface.png`,
    data_base64: canvas.toDataURL('image/png').split(',', 2)[1],
  };
}
