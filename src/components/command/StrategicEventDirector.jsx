import { useEffect, useRef } from 'react';

import {
  automaticRiskProfile,
  chooseAutomaticEventTarget,
  shouldTriggerIntermittentEvent,
} from '../../game/eventDirector.js';
import { useQuantumServices } from '../../services/useQuantumServices.js';
import { useStrategicStore } from '../../store/useStrategicStore.js';

const CYCLE_DURATION_MS = 5000;

export function StrategicEventDirector() {
  const client = useQuantumServices();
  const galaxy = useStrategicStore((state) => state.galaxy);
  const events = useStrategicStore((state) => state.events);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const advanceStrategicTime = useStrategicStore((state) => state.advanceStrategicTime);
  const createCrisis = useStrategicStore((state) => state.createCrisis);
  const attemptedTurn = useRef(-1);
  const requestInFlight = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => advanceStrategicTime(1), CYCLE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [advanceStrategicTime]);

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
    }).then((generated) => {
      createCrisis(target.planet, { generated, source: 'event-director' });
    }).catch(() => {
      createCrisis(target.planet, { source: 'event-director-fallback' });
    }).finally(() => {
      requestInFlight.current = false;
    });
  }, [client, createCrisis, events, galaxy, strategicTurn]);

  return null;
}
