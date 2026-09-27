import { ACTIVITIES_BY_ID } from '../../game/activities';
import { createPlanetInlineAsset } from '../../game/planetAsset';
import { findPlanet } from '../../game/galaxySeed';
import { useQuantumServices } from '../../services/useQuantumServices';
import { useStrategicStore } from '../../store/useStrategicStore';
import { ModalShell } from './ModalShell';
import { QuantumProvenance } from './QuantumProvenance';
import { ActivityWorkspace } from './ActivityWorkspace';

export function EmergencyActivityModal() {
  const client = useQuantumServices();
  const eventId = useStrategicStore((state) => state.activeActivityEventId);
  const event = useStrategicStore((state) => state.events.find((item) => item.id === eventId));
  const galaxy = useStrategicStore((state) => state.galaxy);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const resolveActivity = useStrategicStore((state) => state.resolveActivity);
  const beginQuantumExecution = useStrategicStore((state) => state.beginQuantumExecution);
  const applyQuantumExecution = useStrategicStore((state) => state.applyQuantumExecution);
  const failQuantumExecution = useStrategicStore((state) => state.failQuantumExecution);
  const dismiss = useStrategicStore((state) => state.dismissActivity);
  if (!event) return null;
  const activity = ACTIVITIES_BY_ID[event.activityId];
  const seconds = Math.max(0, event.deadlineTurn - strategicTurn) * 5;
  const planet = findPlanet(galaxy, event.planetId);

  async function commitResponse(score, metadata) {
    if (!resolveActivity(event.id, score, metadata)) return;
    beginQuantumExecution(event.id);
    try {
      const settlement = planet?.settlements?.[0];
      const execution = await client.executeEvent({
        event_type: event.eventType,
        target_body_id: event.bodyId,
        severity: event.severity,
        mode: 'emu',
        idempotency_key: `${event.id}-aftermath`,
        source_asset: planet ? createPlanetInlineAsset(planet) : null,
        classical: {
          response_performance: score,
          shielding: planet?.suitability?.magneticProtection ?? 0.5,
          defense: (settlement?.defense ?? 50) / 100,
          preparedness: (planet?.stability ?? 50) / 100,
          population_exposed: event.population || 0,
          state_version: strategicTurn,
        },
      });
      applyQuantumExecution(event.id, execution);
    } catch (error) {
      failQuantumExecution(event.id, error?.message);
    }
  }

  return (
    <ModalShell
      eyebrow={`Emergency activity · ${seconds}s remaining`}
      title={activity?.name || 'Emergency response'}
      onClose={dismiss}
      className="activity-modal"
    >
      <p className="command-lede">{activity?.interaction}</p>
      <p className="activity-consequence">{activity?.consequence}</p>
      <ActivityWorkspace activity={activity} event={event} onCommit={commitResponse} />
      <QuantumProvenance provenance={event.quantum} />
      <footer className="command-modal__actions">
        <button className="command-button command-button--quiet" onClick={dismiss}>Return to command</button>
      </footer>
    </ModalShell>
  );
}
