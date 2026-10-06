export const SKILL_TREE = [
  {
    id: 'fiscal-survey', branch: 'Treasury', name: 'Fiscal survey',
    detail: 'Each rank raises tax collected every cycle by 8%.',
    maxRank: 3, costs: [6000, 12000, 22000], requires: null,
  },
  {
    id: 'customs-charter', branch: 'Treasury', name: 'Customs charter',
    detail: 'Each rank adds 4 cycles of room before a coffer fills.',
    maxRank: 2, costs: [9000, 18000], requires: { id: 'fiscal-survey', rank: 1 },
  },
  {
    id: 'early-warning', branch: 'Command', name: 'Early warning',
    detail: 'Each rank gives new operations 2 extra cycles.',
    maxRank: 2, costs: [7000, 14000], requires: null,
  },
  {
    id: 'crisis-doctrine', branch: 'Command', name: 'Crisis doctrine',
    detail: 'Each rank cuts credit losses from a resolved operation by 12%.',
    maxRank: 2, costs: [10000, 20000], requires: { id: 'early-warning', rank: 1 },
  },
  {
    id: 'civil-works', branch: 'Command', name: 'Civil works',
    detail: 'Each rank reduces population loss from an operation by 15%.',
    maxRank: 2, costs: [8000, 16000], requires: null,
  },
];

export const FACILITIES = [
  {
    id: 'customs-house', name: 'Customs house',
    detail: 'Each rank raises this system’s tax by 15%.',
    maxRank: 3, costs: [5000, 10000, 18000],
  },
  {
    id: 'shield-battery', name: 'Shield battery',
    detail: 'Each rank lowers the severity of new operations here by 6 points.',
    maxRank: 2, costs: [8000, 16000],
  },
  {
    id: 'signal-mast', name: 'Signal mast',
    detail: 'Each rank adds 2 warning cycles to operations raised here.',
    maxRank: 2, costs: [6000, 12000],
  },
  {
    id: 'imperial-vault', name: 'Imperial vault',
    detail: 'Each rank adds 6 cycles of tax storage in this system.',
    maxRank: 2, costs: [7000, 14000],
  },
];

export function emptyWorks() {
  return { skills: {}, facilities: {} };
}

export function skillRank(works, id) {
  return works?.skills?.[id] || 0;
}

export function facilityRank(works, systemId, id) {
  return works?.facilities?.[systemId]?.[id] || 0;
}

export function skillOffer(works, skill) {
  const rank = skillRank(works, skill.id);
  const locked = skill.requires && skillRank(works, skill.requires.id) < skill.requires.rank;
  const cost = rank < skill.maxRank ? skill.costs[rank] : null;
  return { rank, locked, cost, maxed: rank >= skill.maxRank };
}

export function facilityOffer(works, systemId, facility) {
  const rank = facilityRank(works, systemId, facility.id);
  const cost = rank < facility.maxRank ? facility.costs[rank] : null;
  return { rank, cost, maxed: rank >= facility.maxRank };
}

export function operationRelief(works, systemId, sites = []) {
  const fleet = (sites || []).find((site) => (
    site.systemId === systemId && site.type === 'fleet' && site.level > 0 && !site.building && !site.transit
  ));
  const medical = (sites || []).find((site) => (
    site.systemId === systemId && site.type === 'medical' && site.level > 0 && !site.building && !site.transit
  ));
  const port = (sites || []).find((site) => (
    site.systemId === systemId && site.type === 'port' && site.level > 0 && !site.building && !site.transit
  ));
  const fleetRank = fleet?.level || 0;
  return {
    severity: facilityRank(works, systemId, 'shield-battery') * 0.06 + fleetRank * 0.08,
    deadline: skillRank(works, 'early-warning') * 2
      + facilityRank(works, systemId, 'signal-mast') * 2
      + (port?.level || 0) * 2,
    loss: skillRank(works, 'crisis-doctrine') * 0.12 + fleetRank * 0.06,
    population: skillRank(works, 'civil-works') * 0.15 + (medical?.level || 0) * 0.12,
    invasion: fleetRank * 0.12,
    fleet: fleetRank,
  };
}

export const SEVERITY_BANDS = [
  { id: 'watch', label: 'Watch', min: 0 },
  { id: 'elevated', label: 'Elevated', min: 0.35 },
  { id: 'severe', label: 'Severe', min: 0.55 },
  { id: 'critical', label: 'Critical', min: 0.75 },
];

export function severityBand(severity) {
  const value = Number(severity) || 0;
  return [...SEVERITY_BANDS].reverse().find((band) => value >= band.min) || SEVERITY_BANDS[0];
}
