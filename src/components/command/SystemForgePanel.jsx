import { useEffect, useState } from 'react';

import {
  SPECTRAL_CLASSES,
  evolutionAppearance,
  forgeToSimBodies,
  requestForgeBody,
  requestForgeSystem,
} from '../../game/systemForge.js';
import { useQuantumServices } from '../../services/useQuantumServices.js';
import { useSimStore } from '../../store/useSimStore.js';
import { useStrategicStore } from '../../store/useStrategicStore.js';
import { ForgeTimeline } from './ForgeTimeline.jsx';
import { PlanetVisual } from './PlanetVisual.jsx';
import { warmForgeTextures } from '../../game/textureWarm.js';
import { QuantumProvenance } from './QuantumProvenance.jsx';

function BodyNameField({ body, onCommit }) {
  const [text, setText] = useState(body.name);
  return (
    <input
      className="forge-rename"
      aria-label={`Rename ${body.name}`}
      value={text}
      maxLength={48}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (!onCommit(text)) setText(body.name);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function SystemForgePanel() {
  const client = useQuantumServices();
  const draft = useStrategicStore((state) => state.forgeDraft);
  const createForgeSystem = useStrategicStore((state) => state.createForgeSystem);
  const renameForgeBody = useStrategicStore((state) => state.renameForgeBody);
  const appendForgeBody = useStrategicStore((state) => state.appendForgeBody);
  const setForgeTimeline = useStrategicStore((state) => state.setForgeTimeline);
  const discardForge = useStrategicStore((state) => state.discardForge);
  const commitForgeSystem = useStrategicStore((state) => state.commitForgeSystem);
  const setBodyTexture = useStrategicStore((state) => state.setBodyTexture);
  const setViewMode = useStrategicStore((state) => state.setViewMode);
  const loadCustomSystem = useSimStore((state) => state.loadCustomSystem);
  const [spectralClass, setSpectralClass] = useState('');
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const bodies = useStrategicStore.getState().forgeDraft?.bodies;
    if (!bodies?.length) return undefined;
    let cancelled = false;
    warmForgeTextures(client, bodies, (bodyId, look) => {
      if (!cancelled) setBodyTexture(bodyId, look);
    });
    return () => {
      cancelled = true;
    };
  }, [client, draft?.id, draft?.bodies?.length, setBodyTexture]);

  async function generate() {
    setBusy(true);
    setNotice('');
    const next = await requestForgeSystem(client, {
      seed: seed.trim() || null,
      spectralClass: spectralClass || null,
    });
    createForgeSystem(next);
    warmForgeTextures(client, next.bodies, (bodyId, look) => {
      useStrategicStore.getState().setBodyTexture(bodyId, look);
    });
    const fallback = next.provenance?.some((item) => item.mode === 'classical-fallback');
    setNotice(fallback
      ? 'Atlas was offline. This disk used a labelled deterministic seed.'
      : 'Quantum seed applied. Traits below are fixed for this draw.');
    setBusy(false);
  }

  async function addBody(kind) {
    if (!draft || busy) return;
    setBusy(true);
    setNotice('');
    const body = await requestForgeBody(client, draft, kind);
    if (!body || !appendForgeBody(body)) {
      setNotice(kind === 'moon' ? 'Place a planet before adding a moon.' : 'This disk is full.');
    } else {
      warmForgeTextures(client, [body], (bodyId, look) => {
        useStrategicStore.getState().setBodyTexture(bodyId, look);
      });
    }
    setBusy(false);
  }

  function preview() {
    if (!draft) return;
    const phase = draft.timeline ?? 1;
    loadCustomSystem(forgeToSimBodies(draft, phase), `${draft.name} · ${evolutionAppearance(phase)}`);
    setViewMode('system');
  }

  const planets = draft?.bodies.filter((body) => body.kind === 'planet') || [];

  return (
    <div className="forge-panel">
      <span className="command-eyebrow">Quantum system forge</span>
      <h2>Commission a system</h2>
      <p>Draw a star from a quantum seed, then grow planets and moons whose orbits, atmospheres, and rings follow that disk.</p>
      <div className="forge-fields">
        <label>
          Spectral hint
          <select value={spectralClass} onChange={(event) => setSpectralClass(event.target.value)}>
            <option value="">Quantum draw</option>
            {SPECTRAL_CLASSES.map((item) => (
              <option key={item.id} value={item.id}>{item.id}</option>
            ))}
          </select>
        </label>
        <label>
          Seed override
          <input
            value={seed}
            maxLength={128}
            placeholder="Leave blank to draw"
            onChange={(event) => setSeed(event.target.value)}
          />
        </label>
      </div>
      <button className="command-button" type="button" disabled={busy} onClick={generate}>
        {busy ? 'Drawing seed…' : 'Generate system'}
      </button>
      {notice && <p className="forge-note">{notice}</p>}

      {draft && (
        <>
          <h2>{draft.name}</h2>
          <dl className="system-metrics">
            <div><dt>Star</dt><dd>{draft.star.spectralClass} · {draft.star.temperature} K</dd></div>
            <div><dt>Zone</dt><dd>{draft.scaffold.zone}</dd></div>
            <div><dt>Snow line</dt><dd>{draft.scaffold.snowLine}</dd></div>
            <div><dt>Metallicity</dt><dd>{Math.round(draft.scaffold.metallicity * 100)}%</dd></div>
          </dl>
          <ForgeTimeline draft={draft} phase={draft.timeline ?? 1} onPhase={setForgeTimeline} />
          <QuantumProvenance provenance={draft.provenance} compact />
          <div className="planet-list">
            {draft.bodies.map((body) => (
              <div className="forge-body" key={`${body.id}:${body.name}:${body.archetype}:${body.palette}`}>
                <PlanetVisual planet={body} />
                <div>
                  <BodyNameField body={body} onCommit={(name) => renameForgeBody(body.id, name)} />
                  <small>
                    {body.kind} · {body.type.replace('_', ' ')} · {body.atmosphereTexture}
                    {body.rings?.present ? ' · rings' : ''} · orbit {body.orbitRadius}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="forge-actions">
            <button className="command-button command-button--quiet" type="button" disabled={busy || planets.length >= 10} onClick={() => addBody('planet')}>Add planet</button>
            <button className="command-button command-button--quiet" type="button" disabled={busy || planets.length === 0} onClick={() => addBody('moon')}>Add moon</button>
            <button className="command-button command-button--quiet" type="button" onClick={preview}>Preview epoch</button>
            <button className="command-button" type="button" onClick={commitForgeSystem}>Commit to galaxy</button>
            <button className="command-button command-button--quiet" type="button" onClick={discardForge}>Discard</button>
          </div>
        </>
      )}
    </div>
  );
}
