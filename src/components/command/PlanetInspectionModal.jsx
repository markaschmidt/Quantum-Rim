import { useEffect, useState } from 'react';

import { useQuantumServices } from '../../services/useQuantumServices';
import {
  useStrategicStore,
  selectInspectionPlanet,
  riskForPlanet,
} from '../../store/useStrategicStore';
import { planQuantumActions } from '../../game/planetProfile';
import { createLocalExpeditionPlan } from '../../game/expeditions';
import { ModalShell } from './ModalShell';
import { PlanetVisual } from './PlanetVisual';
import { QuantumProvenance } from './QuantumProvenance';

function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export function PlanetInspectionModal() {
  const client = useQuantumServices();
  const body = useStrategicStore(selectInspectionPlanet);
  const galaxy = useStrategicStore((state) => state.galaxy);
  const close = useStrategicStore((state) => state.closeInspection);
  const renamePlanet = useStrategicStore((state) => state.renamePlanet);
  const createCrisis = useStrategicStore((state) => state.createCrisis);
  const openAdvisor = useStrategicStore((state) => state.openAdvisor);
  const createExpedition = useStrategicStore((state) => state.createExpedition);
  const [remotePlan, setRemotePlan] = useState(null);
  const [planStatus, setPlanStatus] = useState('idle');
  const [generating, setGenerating] = useState(false);
  const [expeditionPlanning, setExpeditionPlanning] = useState(false);
  const [expeditionError, setExpeditionError] = useState('');

  useEffect(() => {
    if (!body) return undefined;
    let current = true;
    setRemotePlan(null);
    setPlanStatus('loading');
    client.planPlanetQuantumActions({
      body_id: body.id,
      body_type: body.type,
      color: body.color,
      mass: body.mass,
      radius: body.radius,
      composition: body.composition,
      atmosphere: body.atmosphere,
      seed: body.id,
    }).then((plan) => {
      if (current) {
        setRemotePlan(plan);
        setPlanStatus('ready');
      }
    }).catch(() => {
      if (current) setPlanStatus('offline');
    });
    return () => { current = false; };
  }, [body, client]);

  if (!body) return null;
  const settlement = body.settlements[0];
  const system = galaxy.systems[body.systemId];
  const canExplore = body.suitability.anomaly >= 0.25 || system?.zone === 'outer';
  const profile = {
    composition: body.composition,
    atmosphere: body.atmosphere,
    habitability: Math.round((body.suitability.atmosphere + body.suitability.water + body.suitability.fertility) / 3 * 100),
    population: body.population,
    stability: body.stability,
    output: settlement?.production || {},
    classification: settlement ? 'Imperial colony world' : 'Unsettled survey world',
    temperature: body.temperature || (body.suitability.water > 0.65 ? 'temperate' : 'cold'),
  };
  const actions = remotePlan?.steps?.map((step) => ({
    engine: step.engine,
    operation: step.purpose,
    mode: 'planned',
    detail: 'Selected by the Quantum Rim service from this body’s physical traits.',
  })) || planQuantumActions(body, profile);

  async function generateEmergency() {
    if (generating) return;
    setGenerating(true);
    try {
      const generated = await client.generateCrisis({
        body: {
          body_id: body.id, body_type: body.type, color: body.color,
          mass: body.mass, radius: body.radius, composition: body.composition,
          atmosphere: body.atmosphere, seed: body.id,
        },
        mode: 'emu',
        risk: riskForPlanet(galaxy, body),
      });
      createCrisis(body, { generated });
    } catch {
      createCrisis(body);
    } finally {
      setGenerating(false);
      close();
    }
  }

  async function launchExpedition() {
    if (expeditionPlanning) return;
    setExpeditionPlanning(true);
    setExpeditionError('');
    let plan;
    try {
      plan = await client.planExpedition({
        body_id: body.id,
        site_name: `${body.name} survey site`,
        anomaly: body.suitability.anomaly,
        danger: system?.routeDanger || 0.3,
        seed: body.id,
        mode: 'emu',
      }, { timeoutMs: 5000 });
    } catch {
      plan = createLocalExpeditionPlan(body, system);
    }
    const expedition = createExpedition(body, plan);
    setExpeditionPlanning(false);
    if (!expedition) {
      setExpeditionError('Insufficient credits, food, or energy to launch this expedition.');
      return;
    }
    close();
  }

  return (
    <ModalShell
      eyebrow="Imperial celestial registry"
      title={body.name}
      onClose={close}
      className="planet-modal"
    >
      <div className="planet-hero">
        <PlanetVisual planet={body} size="hero" />
        <div>
          <span>{profile.classification}</span>
          <h3>{body.type.replace('_', ' ')}</h3>
          <p>
            {profile.temperature} · {profile.atmosphere}
            {body.atmosphereTexture ? ` · ${body.atmosphereTexture}` : ''}
            {body.rings?.present ? ' · ringed' : ''}
          </p>
          <label className="forge-fields">
            Designation
            <input
              className="forge-rename"
              aria-label={`Rename ${body.name}`}
              defaultValue={body.name}
              key={body.name}
              maxLength={48}
              onBlur={(event) => renamePlanet(body.id, event.target.value)}
            />
          </label>
        </div>
        <div className="planet-stability">
          <span>Stability</span>
          <strong>{profile.stability}%</strong>
        </div>
      </div>

      <div className="planet-grid">
        <section>
          <span className="command-eyebrow">Physical survey</span>
          <dl className="command-data-grid">
            <dt>Mass</dt><dd>{body.mass.toFixed(4)}</dd>
            <dt>Radius</dt><dd>{body.radius.toFixed(3)}</dd>
            <dt>Habitability</dt><dd>{profile.habitability}%</dd>
            <dt>Population</dt><dd>{profile.population ? profile.population.toLocaleString() : 'Uninhabited'}</dd>
          </dl>
          <div className="composition-bars">
            {Object.entries(profile.composition).map(([name, value]) => (
              <div key={name}>
                <span>{name}<b>{percent(value)}</b></span>
                <i><em style={{ width: percent(value) }} /></i>
              </div>
            ))}
          </div>
        </section>
        <section>
          <span className="command-eyebrow">Imperial output / cycle</span>
          <dl className="command-data-grid">
            {Object.entries(profile.output).map(([name, value]) => (
              <div className="data-grid-pair" key={name}><dt>{name}</dt><dd>+{value}</dd></div>
            ))}
          </dl>
          <span className="command-eyebrow">Atlas transformation plan</span>
          <QuantumProvenance provenance={actions} />
          <small className="plan-status">
            {planStatus === 'ready' && 'Service plan synchronized.'}
            {planStatus === 'loading' && 'Requesting service plan…'}
            {planStatus === 'offline' && 'Using identical local planning rules while service is offline.'}
          </small>
          {body.textureUrl && (
            <small className="plan-status">Live Atlas aftermath texture applied.</small>
          )}
          {body.audioUrl && (
            <audio controls preload="none" src={body.audioUrl} aria-label={`${body.name} quantum aftermath audio`} />
          )}
          {settlement && (
            <>
              <span className="command-eyebrow planet-section-title">Settlement</span>
              <dl className="command-data-grid">
                <dt>Name</dt><dd>{settlement.name}</dd>
                <dt>Defense</dt><dd>{Math.round(settlement.defense)}%</dd>
                <dt>Infrastructure</dt><dd>{Math.round(settlement.infrastructure)}%</dd>
                <dt>Shortages</dt><dd>{settlement.shortages?.join(', ') || 'None'}</dd>
              </dl>
            </>
          )}
        </section>
      </div>
      <section className="planet-history">
        <span className="command-eyebrow">Persistent history</span>
        {body.history.length === 0
          ? <p className="command-empty">No recorded transformations or emergencies.</p>
          : body.history.slice().reverse().map((entry) => (
            <article key={entry.id}><strong>{entry.title}</strong><span>Cycle {entry.turn}</span><p>{entry.outcome}</p></article>
          ))}
      </section>
      <footer className="command-modal__actions">
        <button className="command-button command-button--quiet" onClick={() => openAdvisor('director-vale')}>
          Consult science director
        </button>
        <button className="command-button" onClick={generateEmergency} disabled={generating}>
          {generating ? 'Consulting Atlas…' : 'Generate emergency drill'}
        </button>
        {canExplore && (
          <button className="command-button" onClick={launchExpedition} disabled={expeditionPlanning}>
            {expeditionPlanning ? 'Mapping site…' : 'Launch ruins expedition'}
          </button>
        )}
      </footer>
      {expeditionError && <div className="command-error">{expeditionError}</div>}
    </ModalShell>
  );
}
