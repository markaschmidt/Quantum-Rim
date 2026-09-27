import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { activitiesForCrisis, ACTIVITIES_BY_ID } from '../game/activities.js';
import { createGalaxySeed, findPlanet } from '../game/galaxySeed.js';
import { commitDraftToGalaxy, sanitizeBodyName } from '../game/systemForge.js';
import { connectedNodeIds, EXPEDITION_APPROACHES } from '../game/expeditions.js';
import {
  DEFAULT_COMMODITIES,
  applyResourceTransaction,
  advanceSettlementEconomy,
  calculateCrisisLoss,
} from '../game/resources.js';

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

function chooseEventType(galaxy, planet, turn) {
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
  const transaction = applyResourceTransaction(state.treasury, loss);
  const exposure = event.severity * (1 - protection * 0.78);
  const populationPriority = metadata.priority === 'choice-0' ? 0.6
    : metadata.priority === 'choice-1' ? 1.3 : 1;
  const infrastructurePriority = metadata.priority === 'choice-1' ? 0.65
    : metadata.priority === 'choice-0' ? 1.25 : 1;
  const populationLoss = Math.round((event.population || 0) * exposure * 0.08 * populationPriority);
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

export const useStrategicStore = create(
  persist(
    (set, get) => ({
      schemaVersion: 4,
      galaxy: initialGalaxy,
      forgeDraft: null,
      treasury: makeLedger(),
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
          galaxy, treasury: makeLedger(), events: [], expeditions: [], auditLog: [], strategicTurn: 0,
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
        const eventType = generated?.event_type || chooseEventType(state.galaxy, target, state.strategicTurn);
        const activities = activitiesForCrisis(eventType);
        const activity = generated?.activity
          ? (ACTIVITIES_BY_ID[generated.activity.id] || generated.activity)
          : activities[Math.floor(hashUnit(`${target.id}:${state.strategicTurn}:activity`) * activities.length)];
        const risk = riskForPlanet(state.galaxy, target);
        const riskScore = generated?.risk_score ?? Math.max(...Object.values(risk));
        const severity = generated?.severity
          ?? Number((0.2 + riskScore * 0.65 + (hashUnit(`${target.id}:severity`) - 0.5) * 0.1).toFixed(2));
        const id = `crisis-${state.strategicTurn}-${target.id}-${state.events.length + 1}`;
        const event = {
          id, eventType, title: CRISIS_TITLES[eventType] || 'Strategic emergency',
          planetId: target.id, systemId: target.systemId, bodyId: target.id, bodyName: target.name,
          population: target.population, severity: clamp(severity, 0.1, 0.95), status: 'warning',
          activityId: activity.id, progress: 0, createdAtTurn: state.strategicTurn,
          deadlineTurn: state.strategicTurn + 9,
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
        const launchCost = { credits: -1200, commodities: { energy: -12, food: -6 } };
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
            exoticMatter: node.kind === 'archive' || node.kind === 'vault'
              ? Math.max(1, Math.round(node.reward * 5)) : 0,
            alloys: node.kind === 'chamber' ? Math.round(node.reward * 8) : 0,
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
      advanceStrategicTime(turns = 1) {
        const count = Math.max(1, Math.min(12, Math.round(turns)));
        set((state) => {
          let next = { ...state, strategicTurn: state.strategicTurn + count };
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
      openAdvisor(characterId = 'director-vale', eventId = null) {
        set({ advisorOpen: true, advisorCharacterId: characterId, advisorEventId: eventId });
      },
      closeAdvisor() { set({ advisorOpen: false }); },
      activityFor(event) { return event ? ACTIVITIES_BY_ID[event.activityId] : null; },
    }),
    {
      name: 'quantum-rim-strategic-state',
      version: 4,
      partialize: (state) => ({
        schemaVersion: state.schemaVersion, galaxy: state.galaxy, treasury: state.treasury,
        events: state.events, expeditions: state.expeditions,
        auditLog: state.auditLog, strategicTurn: state.strategicTurn,
        selectedSystemId: state.selectedSystemId, selectedPlanetId: state.selectedPlanetId,
        forgeDraft: state.forgeDraft,
      }),
      migrate: (persisted) => ({
        ...persisted,
        schemaVersion: 4,
        galaxy: persisted?.galaxy || createGalaxySeed(),
        treasury: persisted?.treasury || makeLedger(),
        events: persisted?.events || [],
        expeditions: persisted?.expeditions || [],
        auditLog: persisted?.auditLog || [],
        strategicTurn: persisted?.strategicTurn || 0,
        forgeDraft: persisted?.forgeDraft || null,
      }),
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
