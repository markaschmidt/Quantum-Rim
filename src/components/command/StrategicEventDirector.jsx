import { useEffect, useRef } from 'react';

import {
  automaticRiskProfile,
  chooseAutomaticEventTarget,
  shouldTriggerIntermittentEvent,
} from '../../game/eventDirector.js';
import { devBuildClockEnabled } from '../../game/devBuildClock.js';
import { rankAt } from '../../game/facilities.js';
import { forgeFactionBanner } from '../../game/factionBanner.js';
import { useQuantumServices } from '../../services/useQuantumServices.js';
import { useStrategicStore } from '../../store/useStrategicStore.js';

const CYCLE_DURATION_MS = 5000;

export function StrategicEventDirector() {
  const client = useQuantumServices();
  const galaxy = useStrategicStore((state) => state.galaxy);
  const events = useStrategicStore((state) => state.events);
  const sites = useStrategicStore((state) => state.sites);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const advanceStrategicTime = useStrategicStore((state) => state.advanceStrategicTime);
  const createCrisis = useStrategicStore((state) => state.createCrisis);
  const attachFactionBanner = useStrategicStore((state) => state.attachFactionBanner);
  const attemptedTurn = useRef(-1);
  const requestInFlight = useRef(false);
  const chartedComets = useRef(new Set());
  const cometRetryAt = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => advanceStrategicTime(1), CYCLE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [advanceStrategicTime]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (devBuildClockEnabled()) useStrategicStore.getState().settleDevBuilds();
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (attemptedTurn.current === strategicTurn || requestInFlight.current) return;
    attemptedTurn.current = strategicTurn;
    const activeEvents = events.filter((event) => event.status !== 'resolved');
    const lastCreatedTurn = events.reduce(
      (latest, event) => Math.max(latest, Number(event.createdAtTurn) || 0),
      0,
    );
    if (!shouldTriggerIntermittentEvent({
      turn: strategicTurn,
      activeEventCount: activeEvents.length,
      lastCreatedTurn,
    })) return;

    const target = chooseAutomaticEventTarget(galaxy, strategicTurn);
    if (!target) return;
    requestInFlight.current = true;
    const risk = automaticRiskProfile(galaxy, target, strategicTurn);
    client.generateCrisis({
      body: {
        body_id: target.planet.id,
        body_type: target.planet.type,
        color: target.planet.color,
        mass: target.planet.mass,
        radius: target.planet.radius,
        composition: target.planet.composition || {},
        atmosphere: target.planet.atmosphere,
        seed: `${target.planet.id}:cycle-${strategicTurn}`,
      },
      mode: 'emu',
      risk,
      defenses: {
        fleet: rankAt(sites, target.planet.systemId, 'fleet'),
        medical: rankAt(sites, target.planet.systemId, 'medical'),
      },
    }).then((generated) => {
      const event = createCrisis(target.planet, { generated, source: 'event-director' });
      return forgeFactionBanner(client, event, attachFactionBanner);
    }).catch(() => {
      const event = createCrisis(target.planet, { source: 'event-director-fallback' });
      return forgeFactionBanner(client, event, attachFactionBanner);
    }).finally(() => {
      requestInFlight.current = false;
    });
  }, [attachFactionBanner, client, createCrisis, events, galaxy, sites, strategicTurn]);

  useEffect(() => {
    if (Date.now() < cometRetryAt.current) return undefined;
    const pending = (useStrategicStore.getState().comets || []).find((comet) => (
      comet.source !== 'labyrinth' && !chartedComets.current.has(comet.id)
    ));
    if (!pending) return undefined;
    chartedComets.current.add(pending.id);
    let cancelled = false;
    client.chartComet({ seed: pending.seed, mode: 'emu' }).then((chart) => {
      if (!cancelled) useStrategicStore.getState().applyCometChart(pending.id, chart);
    }).catch(() => {
      chartedComets.current.delete(pending.id);
      cometRetryAt.current = Date.now() + 60000;
    });
    return () => { cancelled = true; };
  }, [client, strategicTurn]);

  return null;
}
