import { useState } from 'react';

import {
  useStrategicStore,
  selectSelectedPlanet,
  riskForPlanet,
} from '../../store/useStrategicStore';
import { ACTIVITIES_BY_ID } from '../../game/activities';
import { rankAt } from '../../game/facilities';
import { forgeFactionBanner } from '../../game/factionBanner';
import { severityBand } from '../../game/imperialWorks';
import { useQuantumServices } from '../../services/useQuantumServices';
import { NoticeBadge } from './NoticeBadge';
import { QuantumProvenance } from './QuantumProvenance';

export function CrisisConsole() {
  const client = useQuantumServices();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const events = useStrategicStore((state) => state.events);
  const galaxy = useStrategicStore((state) => state.galaxy);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const selectedSystemId = useStrategicStore((state) => state.selectedSystemId);
  const sites = useStrategicStore((state) => state.sites);
  const createCrisis = useStrategicStore((state) => state.createCrisis);
  const attachFactionBanner = useStrategicStore((state) => state.attachFactionBanner);
  const beginActivity = useStrategicStore((state) => state.beginActivity);
  const openAdvisor = useStrategicStore((state) => state.openAdvisor);
  const selectedBody = useStrategicStore(selectSelectedPlanet);
  const unresolved = events.filter((event) => event.status !== 'resolved');
  const resolved = events.filter((event) => event.status === 'resolved');
  const visible = [...unresolved].sort((left, right) => {
    const leftHere = left.systemId === selectedSystemId ? 1 : 0;
    const rightHere = right.systemId === selectedSystemId ? 1 : 0;
    return rightHere - leftHere || right.severity - left.severity;
  }).concat(resolved).slice(0, 8);

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
        defenses: {
          fleet: rankAt(sites, selectedBody.systemId, 'fleet'),
          medical: rankAt(sites, selectedBody.systemId, 'medical'),
        },
      });
      const event = createCrisis(selectedBody, { generated });
      await forgeFactionBanner(client, event, attachFactionBanner);
    } catch {
      const event = createCrisis(selectedBody);
      await forgeFactionBanner(client, event, attachFactionBanner);
    } finally {
      setGenerating(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="crisis-launcher" data-sound="open" onClick={() => setOpen(true)} aria-label={`Show emergency console, ${unresolved.length} active operations`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 2.8 19.2h18.4L12 3z" />
          <path d="M12 9.2v4.4" />
          <circle cx="12" cy="16.4" r="0.8" />
        </svg>
        <span>Operations</span>
        <NoticeBadge count={unresolved.length} label={`${unresolved.length} active operations`} />
      </button>
    );
  }

  return (
    <section className="crisis-console command-panel">
      <header>
        <div>
          <span className="command-eyebrow">Imperial operations</span>
          <h3>Emergency Console</h3>
        </div>
        <div className="crisis-console__tools">
          <button
            className="command-button command-button--quiet"
            disabled={!selectedBody}
            onClick={generateDrill}
          >
            {generating ? 'Consulting Atlas…' : 'Generate drill'}
          </button>
          <button type="button" className="command-icon-button crisis-console__minimize" onClick={() => setOpen(false)} aria-label="Minimize emergency console">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8.5h10" />
            </svg>
          </button>
        </div>
      </header>
      {visible.length === 0 ? (
        <p className="command-empty">
          Select a planet, then generate a readiness drill. Warnings resolve at their deadline if ignored.
        </p>
      ) : visible.map((event) => {
        const activity = ACTIVITIES_BY_ID[event.activityId];
        const system = galaxy.systems[event.systemId];
        const systemName = event.systemName || system?.name || 'Unassigned system';
        const band = severityBand(event.severity);
        return (
          <article
            className={`crisis-card crisis-card--${band.id} ${event.systemId === selectedSystemId ? 'crisis-card--selected' : ''}`}
            key={event.id}
          >
            <div className="crisis-card__heading">
              <div>
                <span>{systemName} · {band.label}</span>
                <h4>{event.title}</h4>
              </div>
              <strong>{Math.round(event.severity * 100)}%</strong>
            </div>
            <p>{systemName} · {event.bodyName} · {activity?.name}</p>
            {event.eventType === 'faction-incursion' && (
              <p className="crisis-card__trajectory">
                {event.eventMetadata?.faction?.bannerUrl && (
                  <img className="faction-banner" src={event.eventMetadata.faction.bannerUrl} alt="" />
                )}
                {event.eventMetadata?.faction?.name || 'Unknown faction'} · {event.eventMetadata?.faction?.doctrine || 'raid'} · {' '}
                {event.eventMetadata?.invasion_lanes?.edges?.length || 0} approach lanes
              </p>
            )}
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
