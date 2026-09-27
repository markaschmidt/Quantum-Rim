import { useState } from 'react';

import { strategicSystemToSimBodies } from '../../game/systemForge.js';
import { useSimStore } from '../../store/useSimStore.js';
import { useStrategicStore, selectSelectedSystem } from '../../store/useStrategicStore';
import { AdvisorChatModal } from './AdvisorChatModal';
import { CrisisConsole } from './CrisisConsole';
import { EmergencyActivityModal } from './EmergencyActivityModal';
import { ExpeditionModal } from './ExpeditionModal';
import { ImperialStatusBar } from './ImperialStatusBar';
import { PlanetInspectionModal } from './PlanetInspectionModal';
import { PlanetVisual } from './PlanetVisual';
import { SystemForgePanel } from './SystemForgePanel';
import './command-ui.css';

const ZONE_LABELS = {
  core: 'Core Worlds',
  inner: 'Inner Rim',
  outer: 'Outer Rim',
};

function debrisPoint(system, node) {
  const angle = (Number(node.angle_degrees) || 0) * Math.PI / 180;
  const distance = 2 + (Number(node.distance) || 0) * 7;
  return {
    x: system.x + Math.cos(angle) * distance,
    y: system.y + Math.sin(angle) * distance,
  };
}

function RouteLayer({ systems, routes, events }) {
  const debrisPaths = events.flatMap((event) => {
    if (event.status === 'resolved' || event.eventType !== 'small-body-collision') return [];
    const system = systems[event.systemId];
    const trajectory = event.eventMetadata?.debris_trajectory;
    if (!system || !Array.isArray(trajectory?.nodes) || !Array.isArray(trajectory?.edges)) return [];
    const nodes = new Map(trajectory.nodes.map((node) => [node.id, node]));
    return trajectory.edges.map((edge, index) => {
      const fromNode = nodes.get(edge[0]);
      const toNode = nodes.get(edge[1]);
      if (!fromNode || !toNode) return null;
      return {
        id: `${event.id}:debris:${index}`,
        from: debrisPoint(system, fromNode),
        to: debrisPoint(system, toNode),
      };
    }).filter(Boolean);
  });
  return (
    <svg className="galaxy-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {routes.map((route) => {
        const from = systems[route.from];
        const to = systems[route.to];
        if (!from || !to) return null;
        return (
          <line
            key={route.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className={`galaxy-route galaxy-route--${route.status}`}
            style={{ '--route-danger': route.danger }}
          />
        );
      })}
      {debrisPaths.map((path) => (
        <line
          key={path.id}
          x1={path.from.x}
          y1={path.from.y}
          x2={path.to.x}
          y2={path.to.y}
          className="galaxy-debris-path"
        />
      ))}
    </svg>
  );
}

export function GalaxyCommandCenter() {
  const [inspectorTab, setInspectorTab] = useState('survey');
  const galaxy = useStrategicStore((state) => state.galaxy);
  const selectedSystem = useStrategicStore(selectSelectedSystem);
  const selectedPlanetId = useStrategicStore((state) => state.selectedPlanetId);
  const events = useStrategicStore((state) => state.events);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const selectSystem = useStrategicStore((state) => state.selectSystem);
  const selectPlanet = useStrategicStore((state) => state.selectPlanet);
  const openInspection = useStrategicStore((state) => state.openInspection);
  const setViewMode = useStrategicStore((state) => state.setViewMode);
  const advanceStrategicTime = useStrategicStore((state) => state.advanceStrategicTime);
  const loadCustomSystem = useSimStore((state) => state.loadCustomSystem);

  function enterSystem(system) {
    if (!system?.planets?.length && !system?.star) return;
    selectSystem(system.id);
    loadCustomSystem(strategicSystemToSimBodies(system), system.name);
    setViewMode('system');
  }

  const activeBySystem = events.reduce((counts, event) => {
    if (event.status !== 'resolved') counts[event.systemId] = (counts[event.systemId] || 0) + 1;
    return counts;
  }, {});

  return (
    <main className="galaxy-command">
      <ImperialStatusBar />
      <header className="galaxy-command__header">
        <div>
          <span className="command-eyebrow">Imperial strategic command</span>
          <h1>Quantum Rim</h1>
          <p>Cycle {strategicTurn} · Click a system to enter its simulation. Return here to survey the republic.</p>
        </div>
        <div className="galaxy-command__actions">
          <button className="command-button command-button--quiet" onClick={() => advanceStrategicTime(1)}>Advance cycle</button>
          <button className="command-button" disabled={!selectedSystem} onClick={() => enterSystem(selectedSystem)}>Open system simulation</button>
        </div>
      </header>

      <section className="galaxy-layout">
        <div className="galaxy-map" aria-label="Galaxy map with Core, Inner Rim, and Outer Rim systems">
          <div className="galaxy-ring galaxy-ring--outer"><span>Outer Rim</span></div>
          <div className="galaxy-ring galaxy-ring--inner"><span>Inner Rim</span></div>
          <div className="galaxy-ring galaxy-ring--core"><span>Core Worlds</span></div>
          <RouteLayer systems={galaxy.systems} routes={galaxy.routes} events={events} />
          {Object.values(galaxy.systems).map((system) => (
            <button
              key={system.id}
              type="button"
              className={`system-node system-node--${system.zone} ${selectedSystem?.id === system.id ? 'active' : ''}`}
              style={{ left: `${system.x}%`, top: `${system.y}%` }}
              onClick={() => enterSystem(system)}
              aria-label={`${system.name}, ${ZONE_LABELS[system.zone]}`}
            >
              <i style={system.star?.color ? { background: system.star.color, boxShadow: `0 0 16px ${system.star.color}` } : undefined} />
              <span>{system.name}</span>
              {activeBySystem[system.id] ? <b>{activeBySystem[system.id]}</b> : null}
            </button>
          ))}
        </div>

        <aside className="system-inspector command-panel">
          <div className="inspector-tabs" role="tablist" aria-label="System inspector">
            <button type="button" className={inspectorTab === 'survey' ? 'active' : ''} onClick={() => setInspectorTab('survey')}>Survey</button>
            <button type="button" className={inspectorTab === 'forge' ? 'active' : ''} onClick={() => setInspectorTab('forge')}>System Forge</button>
          </div>
          {inspectorTab === 'forge' ? <SystemForgePanel /> : selectedSystem && (
            <>
              <span className="command-eyebrow">{ZONE_LABELS[selectedSystem.zone]}</span>
              <h2>{selectedSystem.name}</h2>
              <p className="system-inspector__summary">
                {galaxy.zones[selectedSystem.zone].description}
              </p>
              <dl className="system-metrics">
                <div><dt>Star</dt><dd>{selectedSystem.starClass}</dd></div>
                <div><dt>Security</dt><dd>{Math.round(selectedSystem.security * 100)}%</dd></div>
                <div><dt>Wealth</dt><dd>{Math.round(selectedSystem.wealth * 100)}%</dd></div>
                <div><dt>Route danger</dt><dd>{Math.round(selectedSystem.routeDanger * 100)}%</dd></div>
              </dl>
              <div className="planet-list" role="list">
                {selectedSystem.planets.map((planet) => (
                  <button
                    type="button"
                    key={planet.id}
                    className={`planet-list__item ${selectedPlanetId === planet.id ? 'active' : ''}`}
                    onClick={() => selectPlanet(planet.id)}
                    onDoubleClick={() => openInspection(planet.id)}
                  >
                    <PlanetVisual planet={planet} />
                    <span><strong>{planet.name}</strong><small>{planet.type} · {planet.settlements.length} settlement</small></span>
                    <em>{Math.round(planet.stability)}%</em>
                  </button>
                ))}
              </div>
              <button
                className="command-button system-inspector__inspect"
                disabled={!selectedPlanetId}
                onClick={() => openInspection(selectedPlanetId)}
              >
                Inspect selected planet
              </button>
            </>
          )}
        </aside>
      </section>

      <CrisisConsole />
      <PlanetInspectionModal />
      <EmergencyActivityModal />
      <ExpeditionModal />
      <AdvisorChatModal />
    </main>
  );
}
