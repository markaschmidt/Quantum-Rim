/** Visual radius from mass and body type. Shared by the simulation store and the system forge. */
export function massToRadius(mass, type) {
  if (type === 'star') return Math.max(0.15, Math.cbrt(mass) * 0.28);
  if (type === 'gas_giant') return Math.max(0.10, Math.cbrt(mass) * 0.55);
  if (type === 'rocky') return Math.max(0.05, Math.cbrt(mass) * 0.60);
  if (type === 'moon') return Math.max(0.03, Math.cbrt(mass) * 0.55);
  if (type === 'black_hole') return Math.max(0.12, Math.cbrt(mass) * 0.15);
  return Math.max(0.06, Math.cbrt(mass) * 0.4);
}
