const modules = import.meta.glob('../assets/planets/*.png', { eager: true, import: 'default' });

const BY_NAME = new Map(
  Object.entries(modules).map(([path, url]) => [path.split(/[/\\]/).pop(), url]),
);

export function localPlanetTexture(filename) {
  if (!filename) return null;
  return BY_NAME.get(filename) || null;
}
