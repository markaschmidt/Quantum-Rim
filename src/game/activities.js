const ACTIVITY_KIND = {
  'magnetic-field-alignment': 'alignment',
  'lens-calibration': 'alignment',
  'quantum-echo': 'signal',
  'signal-decoding': 'signal',
  'aurora-grid-rerouting': 'routing',
  'emergency-evacuation': 'routing',
  'jump-gate-repair': 'routing',
  'quantum-lane-survey': 'routing',
  'debris-sweep': 'routing',
  'asteroid-interception': 'allocation',
  'supply-chain-triage': 'allocation',
  'black-hole-exclusion': 'allocation',
  'fleet-command': 'allocation',
  'manifest-inspection': 'investigation',
  'sabotage-investigation': 'investigation',
  'containment-protocol': 'containment',
  'atmosphere-seal': 'containment',
  'ruins-expedition': 'choice',
  'colony-referendum': 'choice',
  'terraforming-balance': 'balance',
};

const ACTIVITY_CONSEQUENCE = {
  alignment: 'Reduces radiation, atmosphere loss, and sensor uncertainty.',
  signal: 'Improves warning time and reveals reliable event evidence.',
  routing: 'Preserves route capacity and reduces stranded populations.',
  allocation: 'Trades finite reserves for lower casualties and infrastructure loss.',
  investigation: 'Improves stability and exposes hidden faction or cargo risks.',
  containment: 'Limits casualties and prevents hazardous spread through settlements.',
  choice: 'Creates a persistent political or expedition outcome.',
  balance: 'Improves habitability without overloading planetary systems.',
};

export const ACTIVITY_CATALOG = [
  ['magnetic-field-alignment', 'Magnetic-field alignment', 'Rotate field coils until their waveforms overlap.', ['tessa-image', 'blur']],
  ['aurora-grid-rerouting', 'Aurora-grid rerouting', 'Move shield power into safe population corridors.', ['labyrinth']],
  ['asteroid-interception', 'Asteroid interception', 'Allocate satellites, timing, and defensive energy.', ['coin-toss', 'blur']],
  ['emergency-evacuation', 'Emergency evacuation routing', 'Connect ships and safe systems through viable lanes.', ['labyrinth']],
  ['jump-gate-repair', 'Jump-gate repair', 'Match damaged gate nodes to compatible components.', ['labyrinth']],
  ['manifest-inspection', 'Trade manifest inspection', 'Find contradictions in cargo, routes, and prices.', ['coin-toss']],
  ['supply-chain-triage', 'Supply-chain triage', 'Prioritize food, water, medicine, energy, and alloy.', ['labyrinth']],
  ['signal-decoding', 'Distress-signal decoding', 'Reassemble fragments by frequency and timestamp.', ['retrocausal-echo']],
  ['debris-sweep', 'Orbital debris sweep', 'Assign drones to the most dangerous debris clusters.', ['labyrinth']],
  ['atmosphere-seal', 'Atmosphere-seal response', 'Rapidly isolate breached colony districts.', ['labyrinth']],
  ['black-hole-exclusion', 'Black-hole exclusion zone', 'Reroute traffic and triage assets inside the hazard zone.', ['labyrinth', 'coin-toss']],
  ['lens-calibration', 'Gravitational lens calibration', 'Align distorted stellar readings.', ['blur']],
  ['quantum-lane-survey', 'Quantum lane survey', 'Probe uncertain route branches.', ['labyrinth']],
  ['ruins-expedition', 'Ruins expedition choices', 'Breach, scan, negotiate, bypass, extract, or retreat.', ['coin-toss', 'labyrinth']],
  ['containment-protocol', 'Containment protocol', 'Quarantine, study, destroy, or move suspicious samples.', ['coin-toss']],
  ['sabotage-investigation', 'Sabotage investigation', 'Compare timelines, access logs, and motives.', ['coin-toss']],
  ['colony-referendum', 'Colony referendum', 'Offer subsidies, promises, and concessions.', ['coin-toss']],
  ['fleet-command', 'Fleet-command burst', 'Protect civilians, secure a gate, or pursue raiders.', ['coin-toss', 'labyrinth']],
  ['terraforming-balance', 'Terraforming balance', 'Balance water, energy, atmosphere, and biodiversity.', ['tessa-image', 'blur']],
  ['quantum-echo', 'Quantum echo listening', 'Match an echo to the most credible clue.', ['retrocausal-echo']],
].map(([id, name, interaction, quantumEngines]) => ({
  id,
  name,
  interaction,
  kind: ACTIVITY_KIND[id] || 'choice',
  consequence: ACTIVITY_CONSEQUENCE[ACTIVITY_KIND[id] || 'choice'],
  quantumEngines,
  durationSeconds: [20, 90],
}));

export const ACTIVITIES_BY_ID = Object.fromEntries(
  ACTIVITY_CATALOG.map((activity) => [activity.id, activity]),
);

const CRISIS_ACTIVITY_MAP = {
  'magnetic-pole-shift': ['magnetic-field-alignment', 'aurora-grid-rerouting'],
  'asteroid-collision': ['asteroid-interception', 'debris-sweep', 'atmosphere-seal'],
  'small-body-collision': ['debris-sweep', 'asteroid-interception', 'emergency-evacuation'],
  'star-implosion': ['emergency-evacuation', 'signal-decoding', 'debris-sweep'],
  'black-hole-collision': ['black-hole-exclusion', 'lens-calibration', 'fleet-command'],
  'black-hole-entry': ['black-hole-exclusion', 'quantum-lane-survey', 'emergency-evacuation'],
  'trade-disruption': ['manifest-inspection', 'supply-chain-triage', 'sabotage-investigation'],
  'piracy-smuggling-network': ['manifest-inspection', 'fleet-command', 'sabotage-investigation'],
  'colony-unrest': ['colony-referendum', 'sabotage-investigation', 'supply-chain-triage'],
  'ruin-discovery': ['ruins-expedition', 'containment-protocol', 'quantum-lane-survey'],
  'quantum-anomaly': ['quantum-echo', 'signal-decoding', 'containment-protocol'],
};

export function activitiesForCrisis(eventType) {
  return (CRISIS_ACTIVITY_MAP[eventType] || ['containment-protocol', 'colony-referendum'])
    .map((id) => ACTIVITIES_BY_ID[id]);
}
