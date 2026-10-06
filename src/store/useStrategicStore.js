import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { activitiesForCrisis, ACTIVITIES_BY_ID } from '../game/activities.js';
import { createGalaxySeed, findPlanet } from '../game/galaxySeed.js';
import { ensureDeposits } from '../game/deposits.js';
import { cometPathFromLanes, ensureComets, tickComets } from '../game/galaxyChart.js';
import { enemyPosition, tickIncursions } from '../game/incursions.js';
import {
  accrueSiteStock,
  buildOffer,
  completeDevBuilds,
  HAULERS,
  miningYield,
  missingRequirement,
  tickSites,
  transitCycles,
} from '../game/facilities.js';
import { devBuildClockEnabled, limitBuildMs } from '../game/devBuildClock.js';
import { commitDraftToGalaxy, sanitizeBodyName } from '../game/systemForge.js';
import { connectedNodeIds, EXPEDITION_APPROACHES } from '../game/expeditions.js';
import {
  DEFAULT_COMMODITIES,
  applyResourceTransaction,
  migrateCommodityBag,
  advanceSettlementEconomy,
  calculateCrisisLoss,
} from '../game/resources.js';
import { accrueSystemTaxes } from '../game/taxes.js';
import { resolveCachedTexture, scrubBlobUrls } from '../game/textureCache.js';
import {
  emptyWorks,
  FACILITIES,
  facilityOffer,
  operationRelief,
  SKILL_TREE,
  skillOffer,
} from '../game/imperialWorks.js';

const CRISIS_TITLES = {
  'magnetic-pole-shift': 'Magnetic Pole Destabilization',
  'asteroid-collision': 'Near-system Asteroid Emergency',
  'small-body-collision': 'Small-body Collision & Debris Alert',
  'star-implosion': 'Stellar Collapse Warning',
  'black-hole-collision': 'Black-hole Merger Alert',
  'black-hole-entry': 'Rogue Singularity Incursion',
  'trade-disruption': 'Imperial Supply Disruption',
  'piracy-smuggling-network': 'Smuggling Network Detected',
  'colony-unrest': 'Colony Unrest Escalation',
  'ruin-discovery': 'Outer Rim Ruin Signal',
  'quantum-anomaly': 'Quantum Anomaly Bloom',
  'faction-incursion': 'Hostile Fleet Incursion',
};

const EVENT_ORDER = [
  'magnetic-pole-shift',
  'asteroid-collision',
  'small-body-collision',
  'trade-disruption',
  'piracy-smuggling-network',
  'colony-unrest',
  'ruin-discovery',
  'quantum-anomaly',
  'faction-incursion',
];

function hashUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function makeLedger() {
  return { credits: 125000, commodities: { ...DEFAULT_COMMODITIES } };
}

function canAfford(ledger, delta) {
  if (ledger.credits + (delta.credits || 0) < 0) return false;
  return Object.entries(delta.commodities || {}).every(([resource, amount]) => (
    (ledger.commodities[resource] || 0) + amount >= 0
  ));
}

export function riskForPlanet(galaxy, planet) {
  const system = galaxy.systems[planet.systemId];
  const settlement = planet.settlements[0];
  return {
    instability: clamp(1 - planet.stability / 100),
    magnetic_instability: clamp(1 - planet.suitability.magneticProtection),
    radiation: clamp(planet.suitability.radiation),
    population_exposure: clamp((planet.population || 0) / 1_000_000_000),
    route_exposure: clamp(system.routeDanger),
    weak_defense: clamp(1 - (settlement?.defense ?? 42) / 100),
    scarcity: clamp((settlement?.shortages?.length || 0) / 5),
    anomaly: clamp(planet.suitability.anomaly),
    frontier: system.zone === 'outer' ? 0.82 : system.zone === 'inner' ? 0.42 : 0.12,
    nearby_black_hole: system.starClass.toLowerCase().includes('black') ? 0.92 : system.routeDanger * 0.4,
  };
}

function chooseEventType(galaxy, planet, turn, sites = []) {
  const risk = riskForPlanet(galaxy, planet);
  const candidates = planet.type === 'black_hole'
    ? ['black-hole-entry', 'black-hole-collision', 'quantum-anomaly']
    : EVENT_ORDER;
  const scores = candidates.map((eventType) => ({
    eventType,
    score: Math.max(0.05, ({
      'magnetic-pole-shift': risk.magnetic_instability + risk.radiation,
      'asteroid-collision': risk.weak_defense + risk.route_exposure,
      'small-body-collision': risk.route_exposure + risk.anomaly + risk.weak_defense * 0.5,
      'trade-disruption': risk.route_exposure + risk.scarcity,
      'piracy-smuggling-network': risk.route_exposure + risk.weak_defense,
      'colony-unrest': risk.instability + risk.scarcity + risk.population_exposure,
      'ruin-discovery': risk.anomaly + risk.frontier,
      'quantum-anomaly': risk.anomaly + risk.instability,
      'faction-incursion': (risk.weak_defense + risk.route_exposure) * (1 - (operationRelief(null, planet.systemId, sites).invasion || 0)),
      'black-hole-entry': risk.nearby_black_hole,
      'black-hole-collision': risk.nearby_black_hole + risk.anomaly,
    }[eventType] || 0.2)),
  }));
  let cursor = hashUnit(`${planet.id}:${turn}:event`)
    * scores.reduce((sum, item) => sum + item.score, 0);
  for (const item of scores) {
    cursor -= item.score;
    if (cursor <= 0) return item.eventType;
  }
  return candidates[0];
}

function updatePlanet(galaxy, planetId, updater) {
  const next = clone(galaxy);
  for (const system of Object.values(next.systems)) {
    const index = system.planets.findIndex((planet) => planet.id === planetId);
    if (index !== -1) {
      system.planets[index] = updater(system.planets[index], system);
      return next;
    }
  }
  return galaxy;
}

function resolveEventState(state, event, performance, metadata = {}) {
  const requestedPerformance = clamp(performance);
  const requestedCosts = Object.entries(metadata.resourceCost || {})
    .filter(([, amount]) => Number(amount) > 0);
  const resourceCoverage = requestedCosts.length
    ? Math.min(1, ...requestedCosts.map(([resource, amount]) => (
      (state.treasury.commodities[resource] || 0) / Number(amount)
    )))
    : 1;
  const protection = clamp(requestedPerformance * resourceCoverage);
  const loss = calculateCrisisLoss(event, protection);
  for (const [resource, amount] of Object.entries(metadata.resourceCost || {})) {
    loss.commodities[resource] = (loss.commodities[resource] || 0) - Math.max(0, Math.round(amount));
  }
  const relief = operationRelief(state.imperialWorks, event.systemId, state.sites);
  if (loss.credits < 0 && relief.loss > 0) {
    loss.credits = Math.round(loss.credits * (1 - relief.loss));
  }
  const transaction = applyResourceTransaction(state.treasury, loss);
  const exposure = event.severity * (1 - protection * 0.78);
  const populationPriority = metadata.priority === 'choice-0' ? 0.6
    : metadata.priority === 'choice-1' ? 1.3 : 1;
  const infrastructurePriority = metadata.priority === 'choice-1' ? 0.65
    : metadata.priority === 'choice-0' ? 1.25 : 1;
  const populationLoss = Math.round((event.population || 0) * exposure * 0.08 * populationPriority * (1 - relief.population));
  const outcome = protection >= 0.75
    ? 'Response contained the emergency with limited losses.'
    : protection >= 0.45
      ? 'Crisis contained, but the affected system paid a material cost.'
      : 'Response failed to prevent cascading damage across the affected system.';
  const historyEntry = {
    id: `${event.id}:history`, eventId: event.id, turn: state.strategicTurn,
    eventType: event.eventType, title: event.title, performance: protection,
    requestedPerformance, resourceCoverage,
    outcome, quantum: event.quantum, resourceDelta: transaction.appliedDelta,
    appearanceState: `${event.eventType}:${protection >= 0.75 ? 'mitigated' : 'damaged'}`,
  };
  const galaxy = updatePlanet(state.galaxy, event.planetId, (planet, system) => {
    const activity = ACTIVITIES_BY_ID[event.activityId];
    const settlements = planet.settlements.map((settlement) => {
      const storage = Object.fromEntries(Object.entries(settlement.storage).map(([key, value]) => [
        key, Math.max(0, value + (transaction.appliedDelta.commodities[key] || 0)),
      ]));
      const shortages = Object.keys(settlement.consumption).filter(
        (key) => storage[key] < (settlement.consumption[key] || 0) * 2,
      );
      return {
        ...settlement,
        stability: Math.max(0, Math.min(100, settlement.stability - exposure * 12 + protection * 3)),
        health: Math.max(0, Math.min(100, settlement.health - exposure * 8 + (activity?.kind === 'containment' ? protection * 5 : 0))),
        infrastructure: Math.max(0, Math.min(100, settlement.infrastructure - exposure * 10 * infrastructurePriority + (activity?.kind === 'routing' ? protection * 4 : 0))),
        defense: Math.max(0, Math.min(100, settlement.defense - exposure * 5 + (activity?.kind === 'allocation' ? protection * 4 : 0))),
        factionInfluence: {
          ...settlement.factionInfluence,
          imperial: clamp(settlement.factionInfluence.imperial + (protection - 0.5) * 0.06),
        },
        storage,
        shortages,
      };
    });
    system.history = [...(system.history || []), historyEntry].slice(-50);
    return {
      ...planet,
      stability: Math.max(0, Math.min(100, planet.stability - exposure * 18 + protection * 4)),
      population: Math.max(0, planet.population - populationLoss),
      appearanceState: historyEntry.appearanceState,
      history: [...(planet.history || []), historyEntry].slice(-50),
      settlements,
    };
  });
  const activityKind = ACTIVITIES_BY_ID[event.activityId]?.kind;
  if (['routing', 'allocation'].includes(activityKind) || event.eventType === 'trade-disruption') {
    galaxy.routes = galaxy.routes.map((route) => {
      if (route.from !== event.systemId && route.to !== event.systemId) return route;
      const capacity = Math.max(0, Math.min(100, route.capacity
        + Math.round(protection * 10 - exposure * 12)));
      return {
        ...route,
        capacity,
        status: capacity < 20 ? 'closed' : capacity < 45 ? 'restricted' : 'open',
      };
    });
  }
  const eventUpdate = {
    ...event, status: 'resolved', progress: 1, performance: protection,
    resourceDelta: transaction.appliedDelta, requestedResourceDelta: loss,
    outcome, resolvedAtTurn: state.strategicTurn,
    requestedPerformance, resourceCoverage,
    autoResolved: Boolean(metadata.autoResolved),
  };
  return {
    ...state,
    galaxy,
    treasury: transaction.ledger,
    events: state.events.map((candidate) => candidate.id === event.id ? eventUpdate : candidate),
    auditLog: [historyEntry, ...state.auditLog].slice(0, 200),
    activeActivityEventId: state.activeActivityEventId === event.id ? null : state.activeActivityEventId,
  };
}

function applyQuantumExecutionState(state, eventId, execution) {
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (!event) return state;
  const results = Array.isArray(execution?.results) ? execution.results : [];
  const textureUrl = results.find((result) => result?.derived_state?.texture_url)
    ?.derived_state?.texture_url;
  const audioUrl = results.find((result) => result?.derived_state?.audio_url)
    ?.derived_state?.audio_url;
  const provenance = results.map((result) => ({
    engine: result.engine,
    operation: result.derived_state?.purpose || 'Quantum aftermath transformation',
    mode: result.mode,
    detail: result.mode === 'classical-fallback'
      ? result.error || 'Atlas step used a bounded classical fallback.'
      : 'Completed by Atlas and applied to the persistent body state.',
    execution_id: result.execution_id,
    verified: result.mode !== 'classical-fallback',
  }));
  const quantum = [...(Array.isArray(event.quantum) ? event.quantum : []), ...provenance];
  const galaxy = updatePlanet(state.galaxy, event.planetId, (planet) => ({
    ...planet,
    textureUrl: textureUrl || planet.textureUrl,
    audioUrl: audioUrl || planet.audioUrl,
    history: planet.history.map((entry) => entry.eventId === eventId
      ? { ...entry, quantum, textureUrl, audioUrl } : entry),
  }));

  return {
    ...state,
    galaxy,
    events: state.events.map((candidate) => candidate.id === eventId ? {
      ...candidate,
      quantum,
      quantumExecutionId: execution?.execution_id || null,
      quantumExecutionStatus: execution?.status || 'complete',
      textureUrl: textureUrl || candidate.textureUrl,
      audioUrl: audioUrl || candidate.audioUrl,
    } : candidate),
    auditLog: state.auditLog.map((entry) => entry.eventId === eventId
      ? { ...entry, quantum, textureUrl, audioUrl } : entry),
  };
}

const initialGalaxy = createGalaxySeed();
const firstSystem = Object.values(initialGalaxy.systems)[0];
const firstPlanet = firstSystem.planets[0];

function upgradeStrategicState(persisted) {
  const treasury = persisted?.treasury || makeLedger();
  const galaxy = ensureDeposits(persisted?.galaxy || createGalaxySeed());
  for (const system of Object.values(galaxy.systems || {})) {
    for (const planet of system.planets || []) {
      for (const settlement of planet.settlements || []) {
        settlement.storage = migrateCommodityBag(settlement.storage);
        settlement.production = migrateCommodityBag(settlement.production);
        settlement.consumption = migrateCommodityBag(settlement.consumption);
      }
    }
  }
  return {
    ...persisted,
    schemaVersion: 8,
    galaxy,
    treasury: { ...treasury, commodities: migrateCommodityBag(treasury.commodities) },
    taxCoffers: persisted?.taxCoffers || {},
    imperialWorks: persisted?.imperialWorks || emptyWorks(),
    sites: persisted?.sites || [],
    enemies: Array.isArray(persisted?.enemies) ? persisted.enemies : [],
    comets: ensureComets(
      Array.isArray(persisted?.comets) ? persisted.comets : [],
      galaxy,
      persisted?.strategicTurn || 0,
    ),
    events: persisted?.events || [],
    expeditions: persisted?.expeditions || [],
    auditLog: persisted?.auditLog || [],
    strategicTurn: persisted?.strategicTurn || 0,
    forgeDraft: persisted?.forgeDraft || null,
  };
}

export const useStrategicStore = create(
  persist(
    (set, get) => ({
      schemaVersion: 8,
      galaxy: initialGalaxy,
      sites: [],
      enemies: [],
      comets: ensureComets([], initialGalaxy, 0),
      forgeDraft: null,
      treasury: makeLedger(),
      taxCoffers: {},
      imperialWorks: emptyWorks(),
      events: [],
      expeditions: [],
      auditLog: [],
      strategicTurn: 0,
      selectedSystemId: firstSystem.id,
      selectedPlanetId: firstPlanet.id,
      inspectionPlanetId: null,
      activeActivityEventId: null,
      activeExpeditionId: null,
      advisorOpen: false,
      advisorCharacterId: 'director-vale',
      advisorEventId: null,
      viewMode: 'galaxy',

      resetCampaign() {
        const galaxy = createGalaxySeed();
        const system = Object.values(galaxy.systems)[0];
        set({
          galaxy, treasury: makeLedger(), taxCoffers: {}, imperialWorks: emptyWorks(), sites: [], enemies: [],
          comets: ensureComets([], galaxy, 0),
          events: [], expeditions: [], auditLog: [], strategicTurn: 0,
          selectedSystemId: system.id, selectedPlanetId: system.planets[0].id,
          inspectionPlanetId: null, activeActivityEventId: null, activeExpeditionId: null,
          advisorOpen: false, advisorCharacterId: 'director-vale', advisorEventId: null,
          viewMode: 'galaxy', forgeDraft: null,
        });
      },
      createForgeSystem(draft) {
        if (!draft?.bodies?.length) return null;
        set({ forgeDraft: { ...draft, timeline: draft.timeline ?? 1 } });
        return draft.id;
      },
      renameForgeBody(bodyId, name) {
        const clean = sanitizeBodyName(name);
        const draft = get().forgeDraft;
        if (!draft || !clean) return false;
        const duplicate = draft.bodies.some((body) => body.id !== bodyId && body.name.toLowerCase() === clean.toLowerCase());
        if (duplicate) return false;
        set({
          forgeDraft: {
            ...draft,
            bodies: draft.bodies.map((body) => (body.id === bodyId ? {
              ...body,
              name: clean,
              history: [...(body.history || []), {
                id: `${body.id}:rename:${body.history?.length || 0}`,
                turn: get().strategicTurn,
                eventType: 'rename',
                title: 'Designation updated',
                performance: 1,
                outcome: `Renamed from ${body.name} to ${clean}.`,
                appearanceState: 'mature',
              }],
            } : body)),
          },
        });
        return true;
      },
      appendForgeBody(body) {
        const draft = get().forgeDraft;
        if (!draft || !body || draft.bodies.length >= 12) return false;
        set({ forgeDraft: { ...draft, bodies: [...draft.bodies, body] } });
        return true;
      },
      setForgeTimeline(value) {
        const draft = get().forgeDraft;
        if (!draft) return;
        const timeline = Math.max(0, Math.min(1, Number(value) || 0));
        set({ forgeDraft: { ...draft, timeline } });
      },
      discardForge() { set({ forgeDraft: null }); },
      commitForgeSystem() {
        const draft = get().forgeDraft;
        if (!draft?.bodies?.length) return null;
        const committed = commitDraftToGalaxy(get().galaxy, draft);
        set({
          galaxy: committed.galaxy,
          forgeDraft: null,
          selectedSystemId: committed.systemId,
          selectedPlanetId: committed.planetId,
        });
        return committed.systemId;
      },
      setForgeBodyLook(bodyId, look = {}) {
        const draft = get().forgeDraft;
        if (!draft) return false;
        set({
          forgeDraft: {
            ...draft,
            bodies: draft.bodies.map((body) => (body.id === bodyId ? {
              ...body,
              textureUrl: look.textureUrl ?? body.textureUrl,
              textureMode: look.textureMode ?? body.textureMode,
              textureKey: look.textureKey ?? body.textureKey,
              scar: look.scar ?? body.scar,
              texture: body.texture ? {
                ...body.texture,
                url: look.textureUrl ?? body.texture.url,
                mode: look.textureMode ?? body.texture.mode,
              } : body.texture,
            } : body)),
          },
        });
        return true;
      },
      setBodyTexture(bodyId, look = {}) {
        get().setForgeBodyLook(bodyId, look);
        if (!findPlanet(get().galaxy, bodyId)) return false;
        set((state) => ({
          galaxy: updatePlanet(state.galaxy, bodyId, (planet) => ({
            ...planet,
            textureUrl: look.textureUrl ?? planet.textureUrl,
            textureMode: look.textureMode ?? planet.textureMode,
            textureKey: look.textureKey ?? planet.textureKey,
            scar: look.scar ?? planet.scar,
          })),
        }));
        return true;
      },
      noteImpact(event) {
        if (!event?.bodyIds?.length) return false;
        const state = get();
        const trajectory = event.permanent ? 'permanently' : 'temporarily';
        const outcome = `${event.band || 'impact'} at severity ${Number(event.severity || 0).toFixed(2)}. ${event.debrisCount || 0} debris shards. Trajectory changed ${trajectory}.`;
        const entry = {
          id: `impact-${event.id}`,
          turn: state.strategicTurn,
          eventType: 'impact',
          title: `${event.band || 'Impact'} recorded`,
          performance: event.permanent ? 0.25 : 0.7,
          outcome,
        };
        let galaxy = state.galaxy;
        let matched = false;
        for (const bodyId of event.bodyIds) {
          if (!findPlanet(galaxy, bodyId)) continue;
          matched = true;
          galaxy = updatePlanet(galaxy, bodyId, (planet) => ({
            ...planet,
            scar: Math.min(1, (planet.scar || 0) + (event.band === 'cataclysm' ? 0.85 : event.band === 'battering' ? 0.45 : 0.15)),
            orbitPerturbed: true,
            history: [...(planet.history || []), entry].slice(-50),
          }));
        }
        const draft = state.forgeDraft;
        const draftHit = draft?.bodies?.some((body) => event.bodyIds.includes(body.id));
        if (!matched && !draftHit) return false;
        const forgeDraft = draftHit ? {
          ...draft,
          bodies: draft.bodies.map((body) => (event.bodyIds.includes(body.id) ? {
            ...body,
            scar: Math.min(1, (body.scar || 0) + (event.band === 'cataclysm' ? 0.85 : 0.2)),
            history: [...(body.history || []), entry].slice(-50),
          } : body)),
        } : draft;
        set({
          galaxy,
          forgeDraft,
          auditLog: [entry, ...state.auditLog].slice(0, 200),
        });
        return true;
      },
      renamePlanet(planetId, name) {
        const clean = sanitizeBodyName(name);
        const current = findPlanet(get().galaxy, planetId);
        if (!clean || !current || current.name === clean) return false;
        const system = get().galaxy.systems[current.systemId];
        if (system?.planets.some((planet) => planet.id !== planetId && planet.name.toLowerCase() === clean.toLowerCase())) {
          return false;
        }
        set((state) => ({
          galaxy: updatePlanet(state.galaxy, planetId, (planet) => ({
            ...planet,
            name: clean,
            history: [...(planet.history || []), {
              id: `${planet.id}:rename:${state.strategicTurn}`,
              turn: state.strategicTurn,
              eventType: 'rename',
              title: 'Designation updated',
              performance: 1,
              outcome: `Renamed from ${planet.name} to ${clean}.`,
              appearanceState: planet.appearanceState,
            }],
          })),
        }));
        return true;
      },
      setViewMode(viewMode) { set({ viewMode }); },
      selectSystem(systemId) {
        const system = get().galaxy.systems[systemId];
        if (system) set({ selectedSystemId: systemId, selectedPlanetId: system.planets[0]?.id || null });
      },
      selectPlanet(planetId) {
        const planet = findPlanet(get().galaxy, planetId);
        if (planet) set({ selectedSystemId: planet.systemId, selectedPlanetId: planetId });
      },
      admitWorld(systemId, record) {
        if (!record?.id) return null;
        const system = get().galaxy.systems[systemId];
        if (!system || system.planets.some((planet) => planet.id === record.id)) return null;
        const world = { ...record, systemId };
        set((state) => ({
          selectedSystemId: systemId,
          selectedPlanetId: world.id,
          galaxy: {
            ...state.galaxy,
            systems: {
              ...state.galaxy.systems,
              [systemId]: {
                ...state.galaxy.systems[systemId],
                planets: [...state.galaxy.systems[systemId].planets, world],
              },
            },
          },
        }));
        return world;
      },
      reviseWorld(systemId, planetId, fields) {
        const system = get().galaxy.systems[systemId];
        if (!system?.planets.some((planet) => planet.id === planetId) || !fields) return false;
        set((state) => ({
          galaxy: {
            ...state.galaxy,
            systems: {
              ...state.galaxy.systems,
              [systemId]: {
                ...state.galaxy.systems[systemId],
                planets: state.galaxy.systems[systemId].planets.map((planet) => (
                  planet.id === planetId ? { ...planet, ...fields } : planet
                )),
              },
            },
          },
        }));
        return true;
      },
      openInspection(planetId) {
        get().selectPlanet(planetId);
        set({ inspectionPlanetId: planetId });
      },
      closeInspection() { set({ inspectionPlanetId: null }); },

      createCrisis(planet, { generated = null, source = 'manual' } = {}) {
        if (!planet?.id) return null;
        const state = get();
        const target = findPlanet(state.galaxy, planet.id);
        if (!target) return null;
        const eventType = generated?.event_type || chooseEventType(state.galaxy, target, state.strategicTurn, state.sites);
        const activities = activitiesForCrisis(eventType);
        const activity = generated?.activity
          ? (ACTIVITIES_BY_ID[generated.activity.id] || generated.activity)
          : activities[Math.floor(hashUnit(`${target.id}:${state.strategicTurn}:activity`) * activities.length)];
        const risk = riskForPlanet(state.galaxy, target);
        const riskScore = generated?.risk_score ?? Math.max(...Object.values(risk));
        const relief = operationRelief(state.imperialWorks, target.systemId, state.sites);
        const fleetAlreadyApplied = generated?.severity != null ? (relief.fleet || 0) * 0.08 : 0;
        const severity = clamp((generated?.severity
          ?? Number((0.2 + riskScore * 0.65 + (hashUnit(`${target.id}:severity`) - 0.5) * 0.1).toFixed(2)))
          - Math.max(0, relief.severity - fleetAlreadyApplied), 0.1, 0.95);
        const id = `crisis-${state.strategicTurn}-${target.id}-${state.events.length + 1}`;
        const system = state.galaxy.systems[target.systemId];
        const event = {
          id, eventType, title: CRISIS_TITLES[eventType] || 'Strategic emergency',
          planetId: target.id, systemId: target.systemId, systemName: system?.name || 'Unknown system',
          bodyId: target.id, bodyName: target.name,
          population: target.population, severity: clamp(severity, 0.1, 0.95), status: 'warning',
          activityId: activity.id, progress: 0, createdAtTurn: state.strategicTurn,
          deadlineTurn: state.strategicTurn + 9 + relief.deadline,
          cause: generated?.cause || Object.entries(risk).sort((a, b) => b[1] - a[1])[0][0].replaceAll('_', ' '),
          risk, affectedNodes: generated?.affected_nodes || [],
          eventMetadata: generated?.event_metadata || {},
          source,
          quantum: generated?.provenance || [
            { engine: 'coin-toss', operation: 'Crisis branch', mode: 'classical-fallback', detail: 'Deterministic local branch.', verified: false },
            { engine: 'labyrinth', operation: 'Affected routes', mode: 'planned', detail: 'Route graph queued.', verified: false },
          ],
        };
        set((current) => ({ events: [event, ...current.events] }));
        return event;
      },
      beginActivity(eventId) {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event || event.status === 'resolved') return;
        set((state) => ({
          activeActivityEventId: eventId,
          events: state.events.map((candidate) => candidate.id === eventId
            ? { ...candidate, status: 'active' } : candidate),
        }));
      },
      resolveActivity(eventId, performance, metadata = {}) {
        const event = get().events.find((candidate) => candidate.id === eventId);
        if (!event || event.status === 'resolved') return false;
        set((state) => resolveEventState(state, event, performance, metadata));
        return true;
      },
      beginQuantumExecution(eventId) {
        set((state) => ({
          events: state.events.map((event) => event.id === eventId
            ? { ...event, quantumExecutionStatus: 'processing', quantumExecutionError: null }
            : event),
        }));
      },
      applyQuantumExecution(eventId, execution) {
        set((state) => applyQuantumExecutionState(state, eventId, execution));
      },
      failQuantumExecution(eventId, error) {
        set((state) => ({
          events: state.events.map((event) => event.id === eventId ? {
            ...event,
            quantumExecutionStatus: 'fallback',
            quantumExecutionError: String(error || 'Atlas execution unavailable').slice(0, 180),
          } : event),
        }));
      },
      dismissActivity() { set({ activeActivityEventId: null }); },
      createExpedition(planet, plan) {
        if (!planet?.id || !plan?.nodes?.length) return null;
        const state = get();
        const existing = state.expeditions.find(
          (item) => item.planetId === planet.id && item.status === 'active',
        );
        if (existing) {
          set({ activeExpeditionId: existing.id });
          return existing;
        }
        const launchCost = { credits: -1200, commodities: { plasmaCells: -12, food: -6 } };
        if (!canAfford(state.treasury, launchCost)) return null;
        const transaction = applyResourceTransaction(state.treasury, launchCost);
        const firstNode = plan.nodes[0];
        const id = `${plan.expedition_id || `exp-${planet.id}`}-${state.strategicTurn}-${state.expeditions.length + 1}`;
        const expedition = {
          id, title: plan.title || `${planet.name} expedition`, planetId: planet.id,
          systemId: planet.systemId, status: 'active', nodes: plan.nodes, edges: plan.edges,
          crewRoles: plan.crew_roles || [], quantum: plan.provenance,
          currentNodeId: firstNode.id, visitedNodeIds: [firstNode.id],
          discoveredNodeIds: [firstNode.id, ...connectedNodeIds({ edges: plan.edges }, firstNode.id)],
          log: [{ turn: state.strategicTurn, message: `Crew entered ${firstNode.label}.` }],
          resourceDelta: transaction.appliedDelta,
        };
        set((current) => ({
          treasury: transaction.ledger,
          expeditions: [expedition, ...current.expeditions],
          activeExpeditionId: expedition.id,
        }));
        return expedition;
      },
      openExpedition(expeditionId) {
        if (get().expeditions.some((item) => item.id === expeditionId)) {
          set({ activeExpeditionId: expeditionId });
        }
      },
      closeExpedition() { set({ activeExpeditionId: null }); },
      chooseExpeditionNode(expeditionId, nodeId, approachId) {
        const state = get();
        const expedition = state.expeditions.find((item) => item.id === expeditionId);
        const approach = EXPEDITION_APPROACHES[approachId];
        const node = expedition?.nodes.find((item) => item.id === nodeId);
        if (!expedition || expedition.status !== 'active' || !approach || !node) return false;
        if (expedition.visitedNodeIds.includes(nodeId)) return false;
        if (!connectedNodeIds(expedition, expedition.currentNodeId).includes(nodeId)) return false;
        if (!canAfford(state.treasury, approach.cost)) return false;

        const success = hashUnit(`${expedition.id}:${nodeId}:${approachId}`) + approach.bonus
          >= node.risk * 0.72;
        const reward = success ? {
          credits: Math.round(300 + node.reward * 1600),
          commodities: {
            hypermatter: node.kind === 'archive' || node.kind === 'vault'
              ? Math.max(1, Math.round(node.reward * 5)) : 0,
            durasteel: node.kind === 'chamber' ? Math.round(node.reward * 8) : 0,
          },
        } : { credits: 0, commodities: {} };
        const delta = {
          credits: approach.cost.credits + reward.credits,
          commodities: { ...approach.cost.commodities },
        };
        for (const [resource, amount] of Object.entries(reward.commodities)) {
          delta.commodities[resource] = (delta.commodities[resource] || 0) + amount;
        }
        const transaction = applyResourceTransaction(state.treasury, delta);
        const visitedNodeIds = success
          ? [...new Set([...expedition.visitedNodeIds, nodeId])]
          : expedition.visitedNodeIds;
        const discoveredNodeIds = success ? [...new Set([
          ...expedition.discoveredNodeIds,
          ...connectedNodeIds(expedition, nodeId),
        ])] : expedition.discoveredNodeIds;
        const completed = node.kind === 'exit' && success;
        const logEntry = {
          turn: state.strategicTurn,
          nodeId,
          message: success
            ? `${approach.label} succeeded at ${node.label}; the crew secured usable findings.`
            : `${approach.label} failed at ${node.label}; the crew advanced with losses.`,
        };
        const expeditionUpdate = {
          ...expedition,
          status: completed ? 'completed' : 'active',
          currentNodeId: success ? nodeId : expedition.currentNodeId,
          visitedNodeIds,
          discoveredNodeIds,
          log: [...expedition.log, logEntry].slice(-50),
          resourceDelta: transaction.appliedDelta,
          completedAtTurn: completed ? state.strategicTurn : null,
        };
        let galaxy = updatePlanet(state.galaxy, expedition.planetId, (target) => {
          const historyEntry = completed ? {
            id: `${expedition.id}:history`, turn: state.strategicTurn,
            eventType: 'expedition', title: expedition.title, performance: 1,
            outcome: 'The expedition returned with a mapped site and recoverable findings.',
            quantum: expedition.quantum, resourceDelta: transaction.appliedDelta,
            appearanceState: target.appearanceState,
          } : null;
          return {
            ...target,
            stability: Math.max(0, Math.min(100, target.stability + (success ? 0.4 : -1.8))),
            history: historyEntry ? [...target.history, historyEntry].slice(-50) : target.history,
            settlements: target.settlements.map((settlement) => ({
              ...settlement,
              activeProjects: completed
                ? [...new Set([...settlement.activeProjects, `Study ${node.label}`])]
                : settlement.activeProjects,
            })),
          };
        });
        const completionHistory = completed
          ? findPlanet(galaxy, expedition.planetId)?.history.at(-1) : null;
        set((current) => ({
          galaxy,
          treasury: transaction.ledger,
          expeditions: current.expeditions.map((item) => (
            item.id === expedition.id ? expeditionUpdate : item
          )),
          auditLog: completionHistory
            ? [completionHistory, ...current.auditLog].slice(0, 200) : current.auditLog,
        }));
        return { success, completed, resourceDelta: transaction.appliedDelta };
      },
      retreatExpedition(expeditionId) {
        set((state) => ({
          expeditions: state.expeditions.map((item) => item.id === expeditionId
            ? { ...item, status: 'retreated' } : item),
          activeExpeditionId: null,
        }));
      },
      collectSystemTax(systemId) {
        const amount = Math.max(0, Math.round(get().taxCoffers[systemId] || 0));
        if (amount <= 0) return 0;
        set((state) => ({
          taxCoffers: { ...state.taxCoffers, [systemId]: 0 },
          treasury: applyResourceTransaction(state.treasury, { credits: amount }).ledger,
        }));
        return amount;
      },
      collectAllTaxes() {
        const coffers = get().taxCoffers;
        const total = Object.values(coffers).reduce((sum, amount) => sum + Math.max(0, Math.round(amount || 0)), 0);
        if (total <= 0) return 0;
        set((state) => ({
          taxCoffers: Object.fromEntries(Object.keys(state.taxCoffers).map((id) => [id, 0])),
          treasury: applyResourceTransaction(state.treasury, { credits: total }).ledger,
        }));
        return total;
      },
      advanceStrategicTime(turns = 1) {
        const count = Math.max(1, Math.min(12, Math.round(turns)));
        set((state) => {
          const built = tickSites(state.sites || [], count);
          const incursion = tickIncursions({
            enemies: state.enemies || [],
            sites: built,
            galaxy: state.galaxy,
            turns: count,
            turn: state.strategicTurn + count,
          });
          const sites = accrueSiteStock(incursion.sites, state.galaxy, count);
          const yieldDelta = miningYield(sites, state.galaxy, count);
          let next = {
            ...state,
            sites,
            enemies: incursion.enemies,
            comets: ensureComets(tickComets(state.comets || [], state.galaxy, count), state.galaxy, state.strategicTurn + count),
            strategicTurn: state.strategicTurn + count,
            taxCoffers: accrueSystemTaxes(state.taxCoffers, state.galaxy.systems, count, state.imperialWorks, sites),
            treasury: applyResourceTransaction(state.treasury, { commodities: yieldDelta }).ledger,
          };
          if (next.strategicTurn % 3 === 0) {
            next = {
              ...next,
              galaxy: {
                ...next.galaxy,
                systems: Object.fromEntries(Object.entries(next.galaxy.systems).map(([id, system]) => [id, {
                  ...system,
                  planets: system.planets.map((planet) => ({
                    ...planet,
                    settlements: planet.settlements.map(advanceSettlementEconomy),
                  })),
                }])),
              },
            };
          }
          for (const event of next.events) {
            if (event.status !== 'resolved' && event.deadlineTurn <= next.strategicTurn) {
              next = resolveEventState(next, event, 0.24, { autoResolved: true });
            }
          }
          return next;
        });
      },
      purchaseSkill(skillId) {
        const skill = SKILL_TREE.find((item) => item.id === skillId);
        const state = get();
        if (!skill) return { ok: false, reason: 'unknown' };
        const offer = skillOffer(state.imperialWorks, skill);
        if (offer.maxed) return { ok: false, reason: 'maxed' };
        if (offer.locked) return { ok: false, reason: 'locked' };
        if (state.treasury.credits < offer.cost) return { ok: false, reason: 'credits' };
        set({
          treasury: applyResourceTransaction(state.treasury, { credits: -offer.cost }).ledger,
          imperialWorks: {
            ...state.imperialWorks,
            skills: { ...state.imperialWorks.skills, [skill.id]: offer.rank + 1 },
          },
        });
        return { ok: true };
      },
      purchaseFacility(systemId, facilityId) {
        const facility = FACILITIES.find((item) => item.id === facilityId);
        const state = get();
        if (!facility || !state.galaxy.systems[systemId]) return { ok: false, reason: 'unknown' };
        const offer = facilityOffer(state.imperialWorks, systemId, facility);
        if (offer.maxed) return { ok: false, reason: 'maxed' };
        if (state.treasury.credits < offer.cost) return { ok: false, reason: 'credits' };
        const current = state.imperialWorks.facilities[systemId] || {};
        set({
          treasury: applyResourceTransaction(state.treasury, { credits: -offer.cost }).ledger,
          imperialWorks: {
            ...state.imperialWorks,
            facilities: {
              ...state.imperialWorks.facilities,
              [systemId]: { ...current, [facility.id]: offer.rank + 1 },
            },
          },
        });
        return { ok: true };
      },
      startConstruction(systemId, type) {
        const state = get();
        const system = state.galaxy.systems[systemId];
        const offer = buildOffer(state.sites || [], system, type);
        if (!system || !offer.ok) return { ok: false, reason: offer.reason || 'unknown' };
        const short = missingRequirement(state.treasury, offer.cost);
        if (short) return { ok: false, reason: short };
        const commodities = Object.fromEntries(Object.entries(offer.cost.commodities).map(([key, amount]) => [key, -amount]));
        const existing = (state.sites || []).find((site) => site.systemId === systemId && site.type === type);
        const durationMs = devBuildClockEnabled() ? limitBuildMs(offer.cycles) : null;
        const building = {
          targetLevel: offer.nextLevel,
          cyclesRemaining: offer.cycles,
          cyclesTotal: offer.cycles,
          ...(durationMs ? { readyAt: Date.now() + durationMs, durationMs } : {}),
        };
        const sites = existing
          ? state.sites.map((site) => (site.id === existing.id ? { ...site, building } : site))
          : [...(state.sites || []), {
            id: `site-${type}-${systemId}-${state.strategicTurn}`,
            type,
            systemId,
            level: 0,
            building,
            transit: null,
          }];
        set({
          treasury: applyResourceTransaction(state.treasury, { credits: -offer.cost.credits, commodities }).ledger,
          sites,
        });
        return { ok: true, cycles: offer.cycles, durationMs };
      },
      settleDevBuilds() {
        const sites = completeDevBuilds(get().sites || []);
        if (sites !== get().sites) set({ sites });
      },
      moveRig(siteId, toSystemId) {
        const state = get();
        const site = (state.sites || []).find((item) => item.id === siteId);
        if (!site || !HAULERS.has(site.type)) return { ok: false, reason: 'unknown' };
        if (site.building) return { ok: false, reason: 'building' };
        if (site.transit) return { ok: false, reason: 'transit' };
        if (!state.galaxy.systems[toSystemId] || toSystemId === site.systemId) return { ok: false, reason: 'same' };
        if ((state.sites || []).some((item) => item.type === site.type && item.systemId === toSystemId)) {
          return { ok: false, reason: 'occupied' };
        }
        const cycles = transitCycles(state.galaxy, site.systemId, toSystemId, state.sites);
        set({
          sites: state.sites.map((item) => (item.id === siteId ? {
            ...item,
            transit: { toSystemId, cyclesRemaining: cycles, cyclesTotal: cycles },
          } : item)),
        });
        return { ok: true, cycles };
      },
      dispatchFleet(siteId, enemyId) {
        const state = get();
        const site = (state.sites || []).find((item) => item.id === siteId);
        const enemy = (state.enemies || []).find((item) => item.id === enemyId);
        if (!site || site.type !== 'fleet' || site.level < 1 || site.building || site.offline) return { ok: false };
        if (site.sortie && !site.sortie.returning) return { ok: false, reason: 'sortie' };
        if (!enemy || enemy.status === 'repelled') return { ok: false };
        const home = state.galaxy.systems[site.systemId];
        if (!home) return { ok: false };
        const from = site.sortie ? { x: site.sortie.x, y: site.sortie.y } : { x: home.x, y: home.y };
        const target = enemyPosition(enemy, state.galaxy);
        const distance = Math.hypot(target.x - from.x, target.y - from.y);
        const speed = Math.max(3.2, distance / 5);
        set({
          sites: state.sites.map((item) => (item.id === siteId ? {
            ...item,
            sortie: { enemyId, x: from.x, y: from.y, speed, returning: false },
          } : item)),
        });
        return { ok: true, cycles: Math.max(1, Math.round(distance / speed)) };
      },
      applyCometChart(cometId, chart) {
        if (!chart?.nodes?.length) return;
        set((state) => ({
          comets: (state.comets || []).map((comet) => {
            if (comet.id !== cometId) return comet;
            const charted = {
              ...comet,
              heading: chart.heading || comet.heading,
              source: chart.source || 'labyrinth',
              provenance: chart.provenance || [],
            };
            if (comet.progress > 0.2) return charted;
            return {
              ...charted,
              path: cometPathFromLanes(chart, comet.seed, state.galaxy.systems),
            };
          }),
        }));
      },
      attachFactionBanner(eventId, bannerUrl, provenance = []) {
        set((state) => ({
          events: state.events.map((event) => {
            if (event.id !== eventId) return event;
            const faction = { ...(event.eventMetadata?.faction || {}), bannerUrl };
            return {
              ...event,
              eventMetadata: { ...(event.eventMetadata || {}), faction },
              quantum: provenance.length ? [...(event.quantum || []), ...provenance] : event.quantum,
            };
          }),
        }));
      },
      openAdvisor(characterId = 'director-vale', eventId = null) {
        set({ advisorOpen: true, advisorCharacterId: characterId, advisorEventId: eventId });
      },
      closeAdvisor() { set({ advisorOpen: false }); },
      activityFor(event) { return event ? ACTIVITIES_BY_ID[event.activityId] : null; },
    }),
    {
      name: 'quantum-rim-strategic-state',
      version: 8,
      partialize: (state) => ({
        schemaVersion: state.schemaVersion, galaxy: state.galaxy, treasury: state.treasury,
        taxCoffers: state.taxCoffers, imperialWorks: state.imperialWorks, sites: state.sites,
        enemies: state.enemies, comets: state.comets,
        events: state.events, expeditions: state.expeditions,
        auditLog: state.auditLog, strategicTurn: state.strategicTurn,
        selectedSystemId: state.selectedSystemId, selectedPlanetId: state.selectedPlanetId,
        forgeDraft: state.forgeDraft,
      }),
      migrate: (persisted) => upgradeStrategicState(persisted),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const upgraded = upgradeStrategicState(state);
        const next = {
          ...upgraded,
          galaxy: scrubBlobUrls(upgraded.galaxy),
          events: scrubBlobUrls(upgraded.events || []),
          expeditions: scrubBlobUrls(upgraded.expeditions || []),
          forgeDraft: upgraded.forgeDraft ? scrubBlobUrls(upgraded.forgeDraft) : null,
        };
        Object.assign(state, next);
        queueMicrotask(() => {
          useStrategicStore.setState(next);
          restoreCachedPlanetTextures();
        });
      },
    },
  ),
);

export const selectSelectedSystem = (state) => state.galaxy.systems[state.selectedSystemId] || null;
export const selectSelectedPlanet = (state) => findPlanet(state.galaxy, state.selectedPlanetId);
export const selectInspectionPlanet = (state) => findPlanet(state.galaxy, state.inspectionPlanetId);
export const selectActiveEvents = (state) => state.events.filter((event) => event.status !== 'resolved');
export const selectActiveExpedition = (state) => (
  state.expeditions.find((item) => item.id === state.activeExpeditionId) || null
);

function restoreCachedPlanetTextures() {
  const { galaxy, setBodyTexture } = useStrategicStore.getState();
  const planets = Object.values(galaxy?.systems || {}).flatMap((system) => system.planets || []);
  planets.forEach(async (planet) => {
    if (planet.textureUrl) return;
    const key = planet.textureKey || planet.texture?.seed;
    if (!key) return;
    const url = await resolveCachedTexture(key);
    if (url) setBodyTexture(planet.id, { textureUrl: url });
  });
}
