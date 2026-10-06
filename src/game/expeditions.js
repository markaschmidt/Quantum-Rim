function unit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

const LABELS = [
  'Threshold', 'Collapsed Gallery', 'Resonance Well', 'Sealed Archive',
  'Transit Crypt', 'Guardian Lattice', 'Relic Vault', 'Extraction Gate',
];

export const EXPEDITION_APPROACHES = Object.freeze({
  scan: {
    label: 'Scan', detail: 'Spend energy to lower uncertainty.', bonus: 0.2,
    cost: { credits: -300, commodities: { plasmaCells: -4 } },
  },
  breach: {
    label: 'Breach', detail: 'Use alloys and power to force a route.', bonus: 0.13,
    cost: { credits: 0, commodities: { durasteel: -8, plasmaCells: -7 } },
  },
  negotiate: {
    label: 'Negotiate', detail: 'Spend political capital and supplies.', bonus: 0.16,
    cost: { credits: -800, commodities: { food: -3, water: -3 } },
  },
  bypass: {
    label: 'Bypass', detail: 'Conserve supplies, accepting more risk.', bonus: -0.06,
    cost: { credits: 0, commodities: {} },
  },
});

export function createLocalExpeditionPlan(planet, system) {
  const seed = `${planet.id}:${planet.name}:expedition`;
  const count = 7 + Math.floor(unit(`${seed}:size`) * 2);
  const kinds = ['entry', 'chamber', 'hazard', 'archive', 'chamber', 'hazard', 'vault'];
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: index,
    label: LABELS[Math.min(index, LABELS.length - 1)],
    kind: index === count - 1 ? 'exit' : kinds[Math.min(index, kinds.length - 1)],
    risk: Number(Math.min(0.95, 0.12 + system.routeDanger * 0.55 + unit(`${seed}:${index}:risk`) * 0.2).toFixed(2)),
    reward: Number(Math.min(0.95, 0.15 + planet.suitability.anomaly * 0.55 + unit(`${seed}:${index}:reward`) * 0.2).toFixed(2)),
  }));
  const edgeKeys = new Set(nodes.slice(0, -1).map((_, index) => `${index}:${index + 1}`));
  for (let index = 0; index < nodes.length - 2; index += 1) {
    if (unit(`${seed}:${index}:shortcut`) > 0.58) edgeKeys.add(`${index}:${index + 2}`);
  }
  return {
    expedition_id: `local-${planet.id}`,
    body_id: planet.id,
    title: `${planet.name} ruins expedition`,
    nodes,
    edges: [...edgeKeys].map((edge) => edge.split(':').map(Number)),
    crew_roles: ['scout', 'engineer', 'scientist', 'medic', 'security', 'diplomat'],
    provenance: {
      engine: 'labyrinth', operation: 'Expedition site topology',
      mode: 'classical-fallback', verified: false,
      detail: 'Deterministic connected topology used while Atlas is unavailable.',
    },
  };
}

export function connectedNodeIds(expedition, nodeId) {
  return expedition.edges.flatMap(([left, right]) => (
    left === nodeId ? [right] : right === nodeId ? [left] : []
  ));
}
