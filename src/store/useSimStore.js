/**
 * Global simulation state managed with Zustand.
 *
 * The physics loop lives in PhysicsLoop.jsx (useFrame inside R3F Canvas).
 * It reads/writes to this store at 60 fps without triggering React re-renders
 * for the hot path — only HUD components subscribe to the parts they need.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getScenario, SCENARIO_LIST } from '../presets/scenarios';
import { integrateStep } from '../physics/integrator';
import { processCollisions } from '../physics/collision';
import { relaxOrbitKicks } from '../physics/impact.js';
import { computeEnergies } from '../physics/gravity';
import { checkRocheDisruptions } from '../physics/roche';
import { pushStateToURL, loadStateFromURL } from '../utils/urlState';
import { decorateBody } from '../game/planetProfile';
import { buildStarform } from '../game/starforge.js';
import { massToRadius } from '../physics/bodyScale.js';

export { massToRadius };

const TRAIL_MAX_POINTS = 400;
const TRAIL_SAMPLE_DISTANCE = 0.02; // minimum world-space distance between trail points
const ROCHE_DISSOLVE_DURATION = 2.0; // sim-time seconds for dissolve animation

// ──────────────────────────────────────────
// Load any URL-baked scenario first
// ──────────────────────────────────────────
const urlState = loadStateFromURL();
const defaultScenario = getScenario('figure8');

function prepBodies(rawBodies) {
  return rawBodies.map((b) => decorateBody({
      ...b,
      radius: b.radius ?? massToRadius(b.mass, b.type),
      trail: b.trail ?? [],
      isAlive: b.isAlive !== false,
      mergedInto: b.mergedInto ?? null,
    }));
}

const initialBodies = prepBodies(
  urlState ? urlState.bodies : defaultScenario.bodies,
);

// ──────────────────────────────────────────
// Store definition
// ──────────────────────────────────────────
export const useSimStore = create(
  subscribeWithSelector((set, get) => ({
    // ── Bodies ──────────────────────────────
    bodies: initialBodies,

    // ── Simulation time ──────────────────────
    simTime: 0,
    timeScale: urlState?.timeScale ?? defaultScenario.timeScale ?? 0.3,
    isPaused: false,

    // ── Selection ───────────────────────────
    selectedBodyId: null,
    inspectionBodyId: null,

    // ── Physics settings ──────────────────────
    collisionMode: defaultScenario.collisionMode ?? 'merge',
    showSoftening: false,

    // ── Visuals ───────────────────────────────
    showTrails: true,
    showVelocityArrows: false,
    showLagrangePoints: false,
    showEnergyGraph: true,
    cinemaMode: false,
    audioEnabled: false,
    showGrid: false,
    showPredictions: false,
    showGlow: true,
    showMiniMap: true,
    showBodyLabels: false,
    followCOM: false,
    rocheEnabled: true,

    // ── Energy (updated each frame) ───────────
    energy: { KE: 0, PE: 0, total: 0, momentum: [0, 0, 0] },
    energyHistory: [], // [{t, total}, ...] last 200 frames

    // ── Merger events (for VFX) ───────────────
    mergerEvents: [], // [{id, position, mass, impactSpeed, time}]

    // ── Roche disruption events (for ring VFX) ─
    rocheEvents: [], // [{primaryId, secondaryId, ...}]

    // ── Current scenario ──────────────────────
    currentScenarioId: urlState ? null : 'figure8',
    customSystemLabel: null,

    // ═══════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════

    /**
     * Called every frame by PhysicsLoop.
     * dt is already multiplied by timeScale.
     */
    tick(dt) {
      const { bodies, isPaused, collisionMode, simTime } = get();
      if (isPaused || dt === 0) return;

      const alive = bodies.filter((b) => b.isAlive);
      if (alive.length === 0) return;

      // 1. Integrate
      const integrated = integrateStep(bodies, dt);

      // 2. Collision detection + resolution
      const { newBodies, mergerEvents } = processCollisions(integrated, collisionMode);

      // 3. Update trails
      const withTrails = newBodies.map((b) => {
        if (!b.isAlive) return b;
        const lastPoint = b.trail[b.trail.length - 1];
        let addPoint = !lastPoint;
        if (lastPoint) {
          const dx = b.position[0] - lastPoint[0];
          const dy = b.position[1] - lastPoint[1];
          const dz = b.position[2] - lastPoint[2];
          addPoint = (dx * dx + dy * dy + dz * dz) > TRAIL_SAMPLE_DISTANCE * TRAIL_SAMPLE_DISTANCE;
        }
        if (!addPoint) return b;
        const speed = Math.sqrt(
          b.velocity[0] ** 2 + b.velocity[1] ** 2 + b.velocity[2] ** 2,
        );
        const newTrail = [
          ...b.trail.slice(-(TRAIL_MAX_POINTS - 1)),
          [b.position[0], b.position[1], b.position[2], speed],
        ];
        return { ...b, trail: newTrail };
      });

      // 4. Energy bookkeeping
      const energy = computeEnergies(withTrails.filter((b) => b.isAlive));
      const newHistory = [
        ...get().energyHistory.slice(-199),
        { t: simTime, total: energy.total },
      ];

      // 5. Merger VFX events
      const existingMergers = get().mergerEvents.filter(
        (e) => simTime - e.time < 3.0, // keep events for 3 sim-sec
      );
      const newMergers = mergerEvents.map((e, idx) => ({
        id: `merger-${simTime}-${idx}`,
        position: e.position,
        mass: e.mass,
        impactSpeed: e.impactSpeed,
        band: e.band || 'cataclysm',
        severity: e.severity ?? 1,
        debrisCount: e.debrisCount || 0,
        permanent: Boolean(e.permanent),
        bodyIds: e.bodyIds || [],
        time: simTime,
      }));

      // 6. Roche limit checks — tidal disruption (with dissolve animation)
      let finalBodies = withTrails;
      const newRocheEvents = [];

      if (get().rocheEnabled) {
        // Skip bodies already dissolving
        const rocheCandidates = withTrails.filter((b) => b.isAlive && !b.isDissolving);
        const rocheDisruptions = checkRocheDisruptions(rocheCandidates);

        if (rocheDisruptions.length > 0) {
          const dissolvingIds = new Set(rocheDisruptions.map((e) => e.secondaryId));
          finalBodies = finalBodies.map((b) =>
            dissolvingIds.has(b.id)
              ? { ...b, isDissolving: true, dissolveStart: simTime }
              : b
          );

          for (const ev of rocheDisruptions) {
            newRocheEvents.push({
              ...ev,
              id: `roche-${simTime}-${ev.secondaryId}`,
              time: simTime,
            });
          }
        }
      }

      // Kill bodies whose dissolve animation has completed
      finalBodies = finalBodies.map((b) => {
        if (b.isDissolving && simTime - b.dissolveStart >= ROCHE_DISSOLVE_DURATION) {
          return { ...b, isAlive: false, isDissolving: false };
        }
        return b;
      });

      // Keep existing roche events for 30 seconds (for ring lifetime)
      const existingRoche = get().rocheEvents.filter(
        (e) => simTime - e.time < 30,
      );

      finalBodies = relaxOrbitKicks(finalBodies, dt);

      set({
        bodies: finalBodies,
        simTime: simTime + dt,
        energy,
        energyHistory: newHistory,
        mergerEvents: [...existingMergers, ...newMergers],
        rocheEvents: [...existingRoche, ...newRocheEvents],
      });
    },

    // ── Time controls ────────────────────────
    togglePause() {
      set((s) => ({ isPaused: !s.isPaused }));
    },

    setTimeScale(scale) {
      set({ timeScale: Math.max(0.05, Math.min(100, scale)) });
    },

    // ── Selection ────────────────────────────
    selectBody(id) {
      const body = get().bodies.find((candidate) => candidate.id === id);
      const inspectable = body && ['rocky', 'moon', 'gas_giant'].includes(body.type);
      set({
        selectedBodyId: id,
        inspectionBodyId: inspectable ? id : null,
      });
    },

    openInspection(id) {
      const body = get().bodies.find((candidate) => candidate.id === id);
      if (body) set({ selectedBodyId: id, inspectionBodyId: id });
    },

    closeInspection() {
      set({ inspectionBodyId: null });
    },

    // ── Scenario management ──────────────────
    loadScenario(scenarioId) {
      const scenario = getScenario(scenarioId);
      if (!scenario) return;
      set({
        bodies: prepBodies(scenario.bodies),
        simTime: 0,
        timeScale: scenario.timeScale ?? 0.3,
        collisionMode: scenario.collisionMode ?? 'merge',
        selectedBodyId: null,
        inspectionBodyId: null,
        mergerEvents: [],
        rocheEvents: [],
        energyHistory: [],
        currentScenarioId: scenarioId,
        customSystemLabel: null,
        isPaused: false,
      });
    },

    loadCustomSystem(rawBodies, label = 'Forged system') {
      set({
        bodies: prepBodies(rawBodies),
        simTime: 0,
        timeScale: 0.8,
        collisionMode: 'merge',
        selectedBodyId: null,
        inspectionBodyId: null,
        mergerEvents: [],
        rocheEvents: [],
        energyHistory: [],
        currentScenarioId: null,
        customSystemLabel: label,
        rocheEnabled: false,
        isPaused: false,
      });
    },

    applyViewerOrder(plan) {
      set((state) => {
        const patches = new Map((plan.patches || []).map((patch) => [patch.id, patch]));
        const kicks = new Map((plan.kicks || []).map((kick) => [kick.id, kick.delta]));
        const next = state.bodies.map((body) => {
          const patch = patches.get(body.id);
          const delta = kicks.get(body.id);
          if (!patch && !delta) return body;
          const velocity = delta
            ? body.velocity.map((value, axis) => value + delta[axis])
            : (patch.velocity || body.velocity);
          return {
            ...(patch ? { ...body, ...patch, id: body.id } : body),
            velocity,
            isAlive: body.isAlive !== false,
            ...(delta ? { kick: { band: 'graze', permanent: false, excess: delta } } : {}),
          };
        });
        const freshUntil = Date.now() + 60000;
        const spawned = (plan.simBodies || []).map((body) => decorateBody({
          ...body,
          radius: body.radius ?? massToRadius(body.mass, body.type),
          trail: body.trail ?? [],
          isAlive: true,
          mergedInto: null,
          freshUntil,
        }));
        const last = spawned[spawned.length - 1];
        const inspectable = last && ['rocky', 'moon', 'gas_giant'].includes(last.type);
        return {
          bodies: next.concat(spawned),
          selectedBodyId: last ? last.id : state.selectedBodyId,
          inspectionBodyId: inspectable ? last.id : state.inspectionBodyId,
          focusBodyId: last ? last.id : state.focusBodyId,
          focusAt: last ? Date.now() : state.focusAt,
        };
      });
    },

    dismissFresh(id) {
      set((state) => ({
        bodies: state.bodies.map((body) => (body.id === id ? { ...body, freshUntil: 0 } : body)),
      }));
    },

    adoptStarform(formId) {
      const stamp = Date.now().toString(36);
      set((state) => {
        const stars = state.bodies.filter((body) => (
          body.isAlive !== false && (body.type === 'star' || body.type === 'black_hole' || body.quasar)
        ));
        const anchor = stars[0] || { position: [0, 0, 0], velocity: [0, 0, 0] };
        const rest = state.bodies.filter((body) => !stars.some((star) => star.id === body.id));
        const freshUntil = Date.now() + 60000;
        const spawned = buildStarform(formId, anchor, stamp).map((body) => decorateBody({
          ...body,
          freshUntil,
          trail: body.trail ?? [],
          isAlive: true,
          mergedInto: null,
        }));
        return {
          bodies: rest.concat(spawned),
          selectedBodyId: spawned[0]?.id || null,
          focusBodyId: spawned[0]?.id || null,
          focusAt: Date.now(),
        };
      });
    },

    setQuasar(id, patch) {
      set((state) => ({
        bodies: state.bodies.map((body) => (
          body.id === id && body.quasar ? { ...body, quasar: { ...body.quasar, ...patch } } : body
        )),
      }));
    },

    // ── Add a new body programmatically ──────
    addBody(bodyDef) {
      const newBody = decorateBody({
        ...bodyDef,
        radius: bodyDef.radius ?? massToRadius(bodyDef.mass, bodyDef.type),
        trail: [],
        isAlive: true,
        mergedInto: null,
      });
      set((s) => ({ bodies: [...s.bodies, newBody] }));
    },

    // ── Remove a body ─────────────────────────
    removeBody(id) {
      set((s) => ({
        bodies: s.bodies.filter((b) => b.id !== id),
        selectedBodyId: s.selectedBodyId === id ? null : s.selectedBodyId,
        inspectionBodyId: s.inspectionBodyId === id ? null : s.inspectionBodyId,
      }));
    },

    // ── Reset trails ──────────────────────────
    clearTrails() {
      set((s) => ({
        bodies: s.bodies.map((b) => ({ ...b, trail: [] })),
      }));
    },

    // ── Toggle visibility flags ───────────────
    setShowTrails(v)           { set({ showTrails: v }); },
    setShowVelocityArrows(v)   { set({ showVelocityArrows: v }); },
    setShowLagrangePoints(v)   { set({ showLagrangePoints: v }); },
    setShowEnergyGraph(v)      { set({ showEnergyGraph: v }); },
    setCinemaMode(v)           { set({ cinemaMode: v }); },
    setCollisionMode(v)        { set({ collisionMode: v }); },
    setAudioEnabled(v)         { set({ audioEnabled: v }); },
    setShowGrid(v)             { set({ showGrid: v }); },
    setShowPredictions(v)      { set({ showPredictions: v }); },
    setShowGlow(v)             { set({ showGlow: v }); },
    setShowMiniMap(v)          { set({ showMiniMap: v }); },
    setShowBodyLabels(v)       { set({ showBodyLabels: v }); },
    setFollowCOM(v)            { set({ followCOM: v }); },
    setRocheEnabled(v)         { set({ rocheEnabled: v }); },

    // ── Clear roche events after processing ──
    clearRocheEvents() {
      set({ rocheEvents: [] });
    },

    // ── Focus camera on selected body ────────
    focusSelected() {
      // This is handled by the COMFollower / KeyboardShortcuts
      // For now just a marker; the camera follow logic reads this
      const id = get().selectedBodyId;
      if (!id) return;
      const body = get().bodies.find((b) => b.id === id);
      if (!body) return;
      // Store focused position for external consumers
      set({ _focusTarget: [...body.position] });
    },

    // ── URL sharing ─────────────────────────
    shareURL() {
      const { bodies, timeScale } = get();
      pushStateToURL(bodies.filter((b) => b.isAlive), timeScale);
    },

    // ── Clear a specific merger event ────────
    clearMergerEvent(id) {
      set((s) => ({ mergerEvents: s.mergerEvents.filter((e) => e.id !== id) }));
    },
  })),
);

// Convenience selectors
export const selectBodies        = (s) => s.bodies;
export const selectAliveBodies   = (s) => s.bodies.filter((b) => b.isAlive);
export const selectSelectedBody  = (s) => s.bodies.find((b) => b.id === s.selectedBodyId) ?? null;
export const selectEnergy        = (s) => s.energy;
export const selectIsPaused      = (s) => s.isPaused;
export const selectTimeScale     = (s) => s.timeScale;
export const selectSimTime       = (s) => s.simTime;
export const selectMergerEvents  = (s) => s.mergerEvents;
