import { useState } from 'react';

import {
  useStrategicStore,
  selectSelectedPlanet,
  riskForPlanet,
} from '../../store/useStrategicStore';
import { ACTIVITIES_BY_ID } from '../../game/activities';
import { useQuantumServices } from '../../services/useQuantumServices';
import { QuantumProvenance } from './QuantumProvenance';

export function CrisisConsole() {
  const client = useQuantumServices();
  const [generating, setGenerating] = useState(false);
  const events = useStrategicStore((state) => state.events);
  const galaxy = useStrategicStore((state) => state.galaxy);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const createCrisis = useStrategicStore((state) => state.createCrisis);
  const beginActivity = useStrategicStore((state) => state.beginActivity);
  const openAdvisor = useStrategicStore((state) => state.openAdvisor);
  const selectedBody = useStrategicStore(selectSelectedPlanet);
  const visible = events.slice(0, 5);

  async function generateDrill() {
    if (!selectedBody || generating) return;
    setGenerating(true);
    try {
      const risk = riskForPlanet(galaxy, selectedBody);
      const generated = await client.generateCrisis({
        body: {
          body_id: selectedBody.id,
          body_type: selectedBody.type,
          color: selectedBody.color,
          mass: selectedBody.mass,
          radius: selectedBody.radius,
          composition: selectedBody.composition || {},
          atmosphere: selectedBody.atmosphere,
          seed: selectedBody.id,
        },
        mode: 'emu',
        risk,
      });
      createCrisis(selectedBody, { generated });
    } catch {
      createCrisis(selectedBody);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="crisis-console command-panel">
      <header>
        <div>
          <span className="command-eyebrow">Imperial operations</span>
          <h3>Emergency Console</h3>
        </div>
        <button
          className="command-button command-button--quiet"
          disabled={!selectedBody}
          onClick={generateDrill}
        >
          {generating ? 'Consulting Atlas…' : 'Generate drill'}
        </button>
      </header>
      {visible.length === 0 ? (
        <p className="command-empty">
          Select a planet, then generate a readiness drill. Warnings resolve at their deadline if ignored.
        </p>
      ) : visible.map((event) => {
        const activity = ACTIVITIES_BY_ID[event.activityId];
        return (
          <article className={`crisis-card severity-${Math.ceil(event.severity * 3)}`} key={event.id}>
            <div className="crisis-card__heading">
              <div>
                <span>{event.status}</span>
                <h4>{event.title}</h4>
              </div>
              <strong>{Math.round(event.severity * 100)}%</strong>
            </div>
            <p>{event.bodyName} · {activity?.name}</p>
            {event.eventType === 'small-body-collision' && (
              <p className="crisis-card__trajectory">
                {(event.eventMetadata?.colliders || ['Small body', 'small body']).join(' × ')} · {' '}
                {event.eventMetadata?.debris_trajectory?.edges?.length || 0} mapped debris lanes
              </p>
            )}
            <p className="crisis-card__cause">Cause: {event.cause} · {Math.max(0, event.deadlineTurn - strategicTurn)} cycles remaining</p>
            {event.outcome && <p className="crisis-card__outcome">{event.outcome}</p>}
            <QuantumProvenance provenance={event.quantum?.[0]} compact />
            <div className="crisis-card__actions">
              {event.status !== 'resolved' && (
                <button className="command-button" onClick={() => beginActivity(event.id)}>
                  Open response
                </button>
              )}
              <button className="command-button command-button--quiet" onClick={() => openAdvisor('director-vale', event.id)}>
                Ask advisor
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
