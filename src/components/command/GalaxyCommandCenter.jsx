import { useEffect, useRef, useState } from 'react';

import { MATERIAL_GRADES } from '../../game/deposits.js';
import { formatCredits } from '../../game/resources.js';
import { strategicSystemToSimBodies } from '../../game/systemForge.js';
import { formatTaxBubble, taxCapacity, taxPerCycle } from '../../game/taxes.js';
import { severityBand } from '../../game/imperialWorks.js';
import { useSimStore } from '../../store/useSimStore.js';
import { useStrategicStore, selectSelectedSystem } from '../../store/useStrategicStore';
import { AdvisorChatModal } from './AdvisorChatModal';
import { CrisisConsole } from './CrisisConsole';
import { EmergencyActivityModal } from './EmergencyActivityModal';
import { ExpeditionModal } from './ExpeditionModal';
import { GalaxySky } from './GalaxySky';
import { ImperialStatusBar } from './ImperialStatusBar';
import { PlanetInspectionModal } from './PlanetInspectionModal';
import { PlanetVisual } from './PlanetVisual';
import { SystemForgePanel } from './SystemForgePanel';
import { SystemSurveyModal } from './SystemSurveyModal';
import './command-ui.css';

const ZONE_LABELS = {
  core: 'Core Worlds',
  inner: 'Inner Rim',
  outer: 'Outer Rim',
};

function FacilityGlyph({ site, dragging, onPointerDown, onPointerUp }) {
  const level = site.level || 0;
  const shown = site.building ? site.building.targetLevel : level;
  const cycles = site.building?.cyclesRemaining ?? site.transit?.cyclesRemaining;
  const dim = Boolean(site.building || site.transit);
  const ring = level >= 5 ? 'is-rank-5' : level >= 3 ? 'is-rank-3' : '';
  const hauler = site.type === 'mining' || site.type === 'processing' || site.type === 'extraction';
  const movable = (hauler && !site.building && !site.transit && !site.offline)
    || (site.type === 'fleet' && level > 0 && !site.building && !site.offline && !site.sortie);
  const stock = Object.entries(site.stock || {}).sort((left, right) => right[1] - left[1])[0];
  return (
    <button
      type="button"
      className={`facility-glyph facility-glyph--${site.type} ${ring} ${dim || site.offline ? 'is-dim' : ''} ${site.offline ? 'is-offline' : ''} ${dragging ? 'is-dragging' : ''}`}
      aria-label={`${site.type} rank ${level}${site.offline ? ', offline' : ''}${cycles ? `, ${cycles} cycles remaining` : ''}`}
      onPointerDown={movable ? onPointerDown : undefined}
      onPointerUp={movable ? onPointerUp : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <svg viewBox={hauler ? '0 0 48 48' : '0 0 24 24'} aria-hidden="true">
        {site.type === 'mining' && (
          <>
            <path d="M22 6h4v28h-4z" />
            <path d="M8 34h32v4H8z" />
            <path d="M14 18h8l2 8H12z" />
            <path d="M18 10h4v8h-4z" />
            <path d="M30 14c6 0 8 6 8 10h-4c0-2-1-6-4-6v8h-4V14h4z" />
          </>
        )}
        {site.type === 'processing' && (
          <>
            <path d="M8 30h32v6H8z" />
            <path d="M12 18h16v12H12z" />
            <path d="M16 8h4v10h-4zM22 6h4v12h-4z" />
            <path d="M32 16h8v14h-8z" />
            <path d="M34 10h4v6h-4z" />
          </>
        )}
        {site.type === 'extraction' && (
          <>
            <path d="M22 4h4v22h-4z" />
            <path d="M16 26h16l4 10H12z" />
            <path d="M10 36h28v4H10z" />
            <path d="M8 14h6v4H8zM34 14h6v4h-6z" />
            <path d="M20 22h8v4h-8z" />
          </>
        )}
        {site.type === 'research' && <path d="M12 2.5 20 7.2v9.6L12 21.5 4 16.8V7.2L12 2.5zm0 3.2L7 8.6v6.8l5 3 5-3V8.6L12 5.7z" />}
        {site.type === 'fleet' && <path d="M3 16.5 12 3.5 21 16.5H15.2L12 11.2 8.8 16.5H3z" />}
        {site.type === 'medical' && <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z" />}
        {site.type === 'port' && <path d="M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6zm0 3.2a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2z" />}
        {!hauler && Array.from({ length: Math.max(0, shown) }, (_, index) => (
          <rect key={index} x={3 + index * 3.6} y="21.2" width="2.4" height="1.6" />
        ))}
      </svg>
      {stock && <em>{stock[0].replace(/([A-Z])/g, ' $1').trim()} {Math.round(stock[1])}</em>}
      {site.offline ? <small>OFF</small> : cycles != null && <small>{cycles}</small>}
    </button>
  );
}

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
  const [surveySystemId, setSurveySystemId] = useState(null);
  const [heatGrade, setHeatGrade] = useState('');
  const [showComets, setShowComets] = useState(true);
  const [showBelts, setShowBelts] = useState(true);
  const [showDust, setShowDust] = useState(true);
  const [dragSiteId, setDragSiteId] = useState(null);
  const [moveNotice, setMoveNotice] = useState('');
  const surveyTimer = useRef(null);
  const galaxy = useStrategicStore((state) => state.galaxy);
  const selectedSystem = useStrategicStore(selectSelectedSystem);
  const selectedPlanetId = useStrategicStore((state) => state.selectedPlanetId);
  const events = useStrategicStore((state) => state.events);
  const strategicTurn = useStrategicStore((state) => state.strategicTurn);
  const taxCoffers = useStrategicStore((state) => state.taxCoffers);
  const imperialWorks = useStrategicStore((state) => state.imperialWorks);
  const sites = useStrategicStore((state) => state.sites) || [];
  const enemies = useStrategicStore((state) => state.enemies) || [];
  const comets = useStrategicStore((state) => state.comets) || [];
  const moveRig = useStrategicStore((state) => state.moveRig);
  const dispatchFleet = useStrategicStore((state) => state.dispatchFleet);
  const collectSystemTax = useStrategicStore((state) => state.collectSystemTax);
  const collectAllTaxes = useStrategicStore((state) => state.collectAllTaxes);
  const selectSystem = useStrategicStore((state) => state.selectSystem);
  const selectPlanet = useStrategicStore((state) => state.selectPlanet);
  const openInspection = useStrategicStore((state) => state.openInspection);
  const setViewMode = useStrategicStore((state) => state.setViewMode);
  const advanceStrategicTime = useStrategicStore((state) => state.advanceStrategicTime);
  const loadCustomSystem = useSimStore((state) => state.loadCustomSystem);

  useEffect(() => () => clearTimeout(surveyTimer.current), []);

  function enterSystem(system) {
    if (!system?.planets?.length && !system?.star) return;
    clearTimeout(surveyTimer.current);
    setSurveySystemId(null);
    selectSystem(system.id);
    loadCustomSystem(strategicSystemToSimBodies(system), system.name);
    setViewMode('system');
  }

  function surveySystem(system) {
    clearTimeout(surveyTimer.current);
    surveyTimer.current = setTimeout(() => {
      selectSystem(system.id);
      setSurveySystemId(system.id);
    }, 220);
  }

  const uncollectedTax = Object.values(taxCoffers).reduce((sum, amount) => sum + Math.max(0, amount || 0), 0);
  const selectedTax = selectedSystem ? (taxCoffers[selectedSystem.id] || 0) : 0;
  const selectedTaxRate = selectedSystem ? taxPerCycle(selectedSystem, imperialWorks, sites) : 0;
  const selectedTaxCap = selectedSystem ? taxCapacity(selectedSystem, imperialWorks, sites) : 0;
  const heatMax = heatGrade
    ? Math.max(1, ...Object.values(galaxy.systems).map((system) => system.deposits?.[heatGrade] || 0))
    : 1;

  function beginRigDrag(event, site) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragSiteId(site.id);
    setMoveNotice('');
  }

  function endRigDrag(event, site) {
    if (dragSiteId !== site.id) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    setDragSiteId(null);
    if (site.type === 'fleet') {
      const enemyId = hit?.closest?.('[data-enemy-id]')?.getAttribute('data-enemy-id');
      if (!enemyId) {
        setMoveNotice('Drop the fleet on a raider to intercept.');
        return;
      }
      const result = dispatchFleet(site.id, enemyId);
      setMoveNotice(result.ok
        ? `Fleet underway. About ${result.cycles} cycles to intercept.`
        : 'That fleet cannot leave its station.');
      return;
    }
    const node = hit?.closest?.('[data-system-id]');
    const toId = node?.getAttribute('data-system-id');
    if (!toId || toId === site.systemId) return;
    const result = moveRig(site.id, toId);
    setMoveNotice(result.ok
      ? `Rig underway. ${result.cycles} cycles until it yields the new seam.`
      : 'That rig cannot move to that system.');
  }

  return (
    <main className="galaxy-command">
      <ImperialStatusBar />
      <header className="galaxy-command__header">
        <div>
          <span className="command-eyebrow">Imperial strategic command</span>
          <h1>Quantum Rim</h1>
          <p>Cycle {strategicTurn} · Click a system to survey it. Double-click to enter its simulation. Drag a defense fleet onto a raider to intercept.</p>
        </div>
        <div className="galaxy-command__actions">
          <button className="command-button command-button--quiet" onClick={() => advanceStrategicTime(1)}>Advance cycle</button>
          <button className="command-button command-button--tax" disabled={uncollectedTax <= 0} onClick={() => collectAllTaxes()}>
            Collect taxes{uncollectedTax > 0 ? ` · ${formatCredits(uncollectedTax)}` : ''}
          </button>
          <button className="command-button" disabled={!selectedSystem} onClick={() => enterSystem(selectedSystem)}>Open system simulation</button>
        </div>
      </header>

      <section className="galaxy-layout">
        <div className="galaxy-map" aria-label="Galaxy map with Core, Inner Rim, and Outer Rim systems">
          <div className="galaxy-ring galaxy-ring--outer"><span>Outer Rim</span></div>
          <div className="galaxy-ring galaxy-ring--inner"><span>Inner Rim</span></div>
          <div className="galaxy-ring galaxy-ring--core"><span>Core Worlds</span></div>
          <div className="galaxy-layers">
            <label className="galaxy-heat-toggle">
              <span>Deposits</span>
              <select value={heatGrade} onChange={(event) => setHeatGrade(event.target.value)} aria-label="Material heat map">
                <option value="">Heat map off</option>
                {MATERIAL_GRADES.map((grade) => (
                  <option key={grade.id} value={grade.id}>{grade.label}</option>
                ))}
              </select>
            </label>
            <label className="galaxy-layer-toggle"><input type="checkbox" checked={showComets} onChange={(event) => setShowComets(event.target.checked)} /> Comets</label>
            <label className="galaxy-layer-toggle"><input type="checkbox" checked={showBelts} onChange={(event) => setShowBelts(event.target.checked)} /> Belts</label>
            <label className="galaxy-layer-toggle"><input type="checkbox" checked={showDust} onChange={(event) => setShowDust(event.target.checked)} /> Dust</label>
          </div>
          {moveNotice && <p className="galaxy-move-notice">{moveNotice}</p>}
          <GalaxySky
            galaxy={galaxy}
            heatGrade={heatGrade}
            heatMax={heatMax}
            showBelts={showBelts}
            showDust={showDust}
            showComets={showComets}
            comets={comets}
            enemies={enemies}
            sites={sites}
          />
          <RouteLayer systems={galaxy.systems} routes={galaxy.routes} events={events} />
          {Object.values(galaxy.systems).map((system) => {
            const stored = taxCoffers[system.id] || 0;
            const cap = taxCapacity(system, imperialWorks, sites);
            const stationed = sites.filter((site) => site.systemId === system.id && !site.sortie);
            const offlineSites = stationed.filter((site) => site.offline);
            const inbound = enemies.filter((enemy) => enemy.targetSystemId === system.id && enemy.status === 'inbound');
            const pressing = enemies.filter((enemy) => enemy.targetSystemId === system.id && enemy.status === 'pressing');
            const engaged = enemies.filter((enemy) => enemy.targetSystemId === system.id && enemy.status === 'engaging');
            const hazard = offlineSites.length
              ? { tone: 'offline', label: 'OFFLINE' }
              : pressing.length
                ? { tone: 'down', label: `KNOCKOUT ${pressing[0].pressRemaining}` }
                : engaged.length
                  ? { tone: 'engaged', label: 'ENGAGED' }
                  : inbound.length
                    ? { tone: 'danger', label: `INBOUND ${inbound[0].cyclesRemaining}` }
                    : null;
            const full = cap > 0 && stored >= cap;
            const operations = events.filter((event) => event.systemId === system.id && event.status !== 'resolved');
            const worst = operations.reduce((peak, event) => (
              !peak || event.severity > peak.severity ? event : peak
            ), null);
            const band = worst ? severityBand(worst.severity) : null;
            return (
              <div
                key={system.id}
                data-system-id={system.id}
                className={`system-node system-node--${system.zone} ${selectedSystem?.id === system.id ? 'active' : ''} ${band ? `system-node--${band.id}` : ''}`}
                style={{ left: `${system.x}%`, top: `${system.y}%` }}
              >
                <button
                  type="button"
                  className="system-node__enter"
                  onClick={() => surveySystem(system)}
                  onDoubleClick={() => enterSystem(system)}
                  aria-label={`${system.name}, ${ZONE_LABELS[system.zone]}`}
                >
                  <i style={system.star?.color ? { background: system.star.color, boxShadow: `0 0 16px ${system.star.color}` } : undefined} />
                  <span>{system.name}</span>
                </button>
                {hazard && (
                  <div className={`system-hazard system-hazard--${hazard.tone}`} aria-label={`${system.name} ${hazard.label}`}>
                    {hazard.label}
                  </div>
                )}
                {stationed.length > 0 && (
                  <div className="system-sites">
                    {stationed.map((site) => (
                      <FacilityGlyph
                        key={site.id}
                        site={site}
                        dragging={dragSiteId === site.id}
                        onPointerDown={(event) => beginRigDrag(event, site)}
                        onPointerUp={(event) => endRigDrag(event, site)}
                      />
                    ))}
                  </div>
                )}
                {worst && (
                  <button
                    type="button"
                    className={`system-threat system-threat--${band.id}`}
                    onClick={() => surveySystem(system)}
                    aria-label={`${system.name}: ${band.label} ${worst.title}, ${Math.round(worst.severity * 100)} percent${operations.length > 1 ? `, ${operations.length} operations` : ''}`}
                  >
                    <strong className="system-threat__score">{Math.round(worst.severity * 100)}</strong>
                    <small>{band.label}{operations.length > 1 ? ` · ${operations.length}` : ''}</small>
                  </button>
                )}
                {stored > 0 && (
                  <button
                    type="button"
                    className={`system-tax ${full ? 'system-tax--full' : ''}`}
                    onClick={() => collectSystemTax(system.id)}
                    aria-label={`Collect ${formatCredits(stored)} tax from ${system.name}${full ? ', coffer full' : ''}`}
                  >
                    {full ? 'Full' : formatTaxBubble(stored)}
                  </button>
                )}
              </div>
            );
          })}
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
                <div><dt>Tax / cycle</dt><dd>{formatCredits(selectedTaxRate)}</dd></div>
                <div><dt>Tax coffer</dt><dd>{formatCredits(selectedTax)}{selectedTaxCap > 0 ? ` / ${formatCredits(selectedTaxCap)}` : ''}</dd></div>
              </dl>
              <button
                className="command-button command-button--tax system-inspector__collect"
                disabled={selectedTax <= 0}
                onClick={() => collectSystemTax(selectedSystem.id)}
              >
                Collect {selectedSystem.name} tax
              </button>
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
      <SystemSurveyModal
        system={surveySystemId ? galaxy.systems[surveySystemId] : null}
        zoneDescription={surveySystemId ? galaxy.zones[galaxy.systems[surveySystemId]?.zone]?.description : ''}
        taxRate={surveySystemId && galaxy.systems[surveySystemId] ? taxPerCycle(galaxy.systems[surveySystemId], imperialWorks) : 0}
        taxStored={surveySystemId ? (taxCoffers[surveySystemId] || 0) : 0}
        taxCap={surveySystemId && galaxy.systems[surveySystemId] ? taxCapacity(galaxy.systems[surveySystemId], imperialWorks) : 0}
        onClose={() => setSurveySystemId(null)}
        onEnter={() => enterSystem(galaxy.systems[surveySystemId])}
        onCollect={() => collectSystemTax(surveySystemId)}
        onInspectPlanet={(planetId) => {
          setSurveySystemId(null);
          openInspection(planetId);
        }}
      />
      <PlanetInspectionModal />
      <EmergencyActivityModal />
      <ExpeditionModal />
      <AdvisorChatModal />
    </main>
  );
}
