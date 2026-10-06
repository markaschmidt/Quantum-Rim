import { formatCredits } from '../../game/resources.js';
import { ModalShell } from './ModalShell';
import { PlanetVisual } from './PlanetVisual';
import { SystemTopDown } from './SystemTopDown';

const ZONE_LABELS = {
  core: 'Core Worlds',
  inner: 'Inner Rim',
  outer: 'Outer Rim',
};

export function SystemSurveyModal({
  system,
  zoneDescription,
  taxRate,
  taxStored,
  taxCap,
  onClose,
  onEnter,
  onCollect,
  onInspectPlanet,
}) {
  if (!system) return null;
  const population = system.planets.reduce((sum, planet) => sum + (planet.population || 0), 0);
  return (
    <ModalShell
      eyebrow="Imperial system registry"
      title={system.name}
      onClose={onClose}
      className="system-survey-modal"
    >
      <div className="system-survey">
        <SystemTopDown system={system} />
        <div>
          <span className="command-eyebrow">{ZONE_LABELS[system.zone] || system.zone}</span>
          <p className="system-inspector__summary">{zoneDescription}</p>
          <dl className="system-metrics">
            <div><dt>Star</dt><dd>{system.starClass}</dd></div>
            <div><dt>Worlds</dt><dd>{system.planets.length}</dd></div>
            <div><dt>Population</dt><dd>{population ? population.toLocaleString() : 'Uninhabited'}</dd></div>
            <div><dt>Security</dt><dd>{Math.round(system.security * 100)}%</dd></div>
            <div><dt>Wealth</dt><dd>{Math.round(system.wealth * 100)}%</dd></div>
            <div><dt>Route danger</dt><dd>{Math.round(system.routeDanger * 100)}%</dd></div>
            <div><dt>Tax / cycle</dt><dd>{formatCredits(taxRate)}</dd></div>
            <div><dt>Tax coffer</dt><dd>{formatCredits(taxStored)}{taxCap > 0 ? ` / ${formatCredits(taxCap)}` : ''}</dd></div>
          </dl>
        </div>
      </div>
      <div className="planet-list system-survey__worlds" role="list">
        {system.planets.map((planet) => (
          <button
            type="button"
            key={planet.id}
            className="planet-list__item"
            onClick={() => onInspectPlanet(planet.id)}
          >
            <PlanetVisual planet={planet} />
            <span>
              <strong>{planet.name}</strong>
              <small>{planet.type} · {planet.settlements.length} settlement</small>
            </span>
            <em>{Math.round(planet.stability)}%</em>
          </button>
        ))}
      </div>
      <footer className="command-modal__actions">
        <button className="command-button command-button--tax" disabled={taxStored <= 0} onClick={onCollect}>
          Collect {system.name} tax
        </button>
        <button className="command-button" onClick={onEnter}>Enter simulation</button>
      </footer>
    </ModalShell>
  );
}
