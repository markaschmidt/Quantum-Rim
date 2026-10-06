/**
 * HUD — the main React overlay providing:
 *  - Top-right: simulation controls (play/pause, time scale, scenario picker)
 *  - Bottom-left: selected body info panel (velocity, mass, distance)
 *  - Bottom-right: energy graph + total energy
 *  - Top-left: body list (selectable)
 *  - Center-bottom: toolbar (trails, arrows, Lagrange, cinema mode, export, share)
 */

import { useCallback } from 'react';
import { useSimStore } from '../store/useSimStore';
import { SCENARIO_LIST } from '../presets/scenarios';
import { EnergyGraph } from './EnergyGraph';
import { MiniMap } from './MiniMap';
import { FPSCounter } from './FPSCounter';
import { BodyEditor } from './BodyEditor';
import { TimeRewindControls } from './TimeRewind';
import { STAR_FORMS, tuneQuasarJets } from '../game/starforge.js';
import { recordCanvas } from '../utils/videoExport';
import { takeScreenshot } from '../utils/screenshot';
import { audioEngine } from '../utils/audio';

function fmt(n, decimals = 3) {
  if (typeof n !== 'number') return '—';
  return n.toFixed(decimals);
}

// ── Body List (top-left) ───────────────────────────────────────────────────────
function BodyList() {
  const bodies        = useSimStore((s) => s.bodies);
  const selectedId    = useSimStore((s) => s.selectedBodyId);
  const selectBody    = useSimStore((s) => s.selectBody);
  const dismissFresh  = useSimStore((s) => s.dismissFresh);
  const alive         = bodies.filter((b) => b.isAlive);
  const now           = Date.now();

  return (
    <div className="hud-panel" style={{ minWidth: 160, maxHeight: 300, overflowY: 'auto' }}>
      <h3>Bodies [{alive.length}]</h3>
      {alive.map((b) => {
        const speed = Math.sqrt(b.velocity[0] ** 2 + b.velocity[1] ** 2 + b.velocity[2] ** 2);
        return (
          <div
            key={b.id}
            onClick={() => selectBody(b.id === selectedId ? null : b.id)}
            onMouseEnter={() => { if ((b.freshUntil || 0) > now) dismissFresh(b.id); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '3px 0',
              cursor: 'pointer',
              opacity: b.id === selectedId ? 1 : 0.75,
              borderLeft: b.id === selectedId ? `2px solid ${b.color}` : '2px solid transparent',
              paddingLeft: 6,
            }}
          >
            <span className="body-dot" style={{ background: b.color }} />
            {(b.freshUntil || 0) > now && (
              <span title="Recently added" style={{ color: '#f0c14a', fontSize: 9, marginRight: 4 }}>NEW</span>
            )}
            <span style={{ flex: 1 }}>{b.name}</span>
            <span style={{ color: 'rgba(142,232,255,0.5)', fontSize: 9 }}>
              {fmt(speed, 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Selected Body Panel (bottom-left) ─────────────────────────────────────────
function BodyPanel() {
  const body  = useSimStore((s) => s.bodies.find((b) => b.id === s.selectedBodyId) ?? null);
  const bodies = useSimStore((s) => s.bodies);
  const openInspection = useSimStore((s) => s.openInspection);

  if (!body) return (
    <div className="hud-panel" style={{ minWidth: 180 }}>
      <h3>No Selection</h3>
      <div style={{ color: 'rgba(142,232,255,0.4)', fontSize: 10 }}>
        Click a body to inspect
      </div>
    </div>
  );

  const speed = Math.sqrt(body.velocity[0] ** 2 + body.velocity[1] ** 2 + body.velocity[2] ** 2);

  // Nearest neighbor distance
  const alive = bodies.filter((b) => b.isAlive && b.id !== body.id);
  let nearestDist = Infinity;
  let nearestName = '—';
  for (const b of alive) {
    const dx = b.position[0] - body.position[0];
    const dy = b.position[1] - body.position[1];
    const dz = b.position[2] - body.position[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < nearestDist) { nearestDist = d; nearestName = b.name; }
  }

  return (
    <div className="hud-panel" style={{ minWidth: 200 }}>
      <h3 style={{ color: body.color }}>
        <span className="body-dot" style={{ background: body.color, width: 10, height: 10 }} />
        {body.name}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        <span><label>Type</label></span>
        <span className="value accent">{body.type.replace('_', ' ')}</span>

        <span><label>Mass</label></span>
        <span className="value">{fmt(body.mass)}</span>

        <span><label>Speed</label></span>
        <span className="value green">{fmt(speed)} u/s</span>

        <span><label>Pos X</label></span>
        <span className="value">{fmt(body.position[0])}</span>

        <span><label>Pos Y</label></span>
        <span className="value">{fmt(body.position[1])}</span>

        <span><label>Vel X</label></span>
        <span className="value">{fmt(body.velocity[0])}</span>

        <span><label>Vel Y</label></span>
        <span className="value">{fmt(body.velocity[1])}</span>

        <span><label>Nearest</label></span>
        <span className="value warn" style={{ fontSize: 9 }}>{nearestName}</span>

        <span><label>NN Dist</label></span>
        <span className="value">{nearestDist === Infinity ? '—' : fmt(nearestDist)}</span>
      </div>
      {body.profile && (
        <button className="hud-btn" style={{ marginTop: 9, width: '100%' }} onClick={() => openInspection(body.id)}>
          Open Imperial Registry
        </button>
      )}
    </div>
  );
}

// ── Time & Scenario Controls (top-right) ──────────────────────────────────────
function TimeControls() {
  const isPaused      = useSimStore((s) => s.isPaused);
  const timeScale     = useSimStore((s) => s.timeScale);
  const simTime       = useSimStore((s) => s.simTime);
  const currentId     = useSimStore((s) => s.currentScenarioId);
  const customLabel   = useSimStore((s) => s.customSystemLabel);
  const togglePause   = useSimStore((s) => s.togglePause);
  const setTimeScale  = useSimStore((s) => s.setTimeScale);
  const loadScenario  = useSimStore((s) => s.loadScenario);
  const adoptStarform = useSimStore((s) => s.adoptStarform);

  async function changeStar(formId) {
    adoptStarform(formId);
    if (formId !== 'quasar') return;
    const id = useSimStore.getState().selectedBodyId;
    const jet = await tuneQuasarJets(`${id}:${Date.now()}`);
    if (id) useSimStore.getState().setQuasar(id, jet);
  }

  return (
    <div className="hud-panel" style={{ minWidth: 210 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Simulation Control</span>
        <a href="/" title="Back to home" style={{ color: 'rgba(142,232,255,0.6)', textDecoration: 'none', fontSize: 11, fontWeight: 400 }}>⌂ Home</a>
      </h3>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`hud-btn ${isPaused ? 'active' : ''}`} onClick={togglePause}>
          {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>TIME SCALE &nbsp; <span className="value accent">{timeScale.toFixed(2)}×</span></label>
        <input
          type="range"
          min={Math.log(0.05)}
          max={Math.log(100)}
          step={0.01}
          value={Math.log(timeScale)}
          onChange={(e) => setTimeScale(Math.exp(parseFloat(e.target.value)))}
          style={{ marginTop: 4 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(142,232,255,0.4)' }}>
          <span>0.05×</span><span>1×</span><span>100×</span>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>SCENARIO</label>
        <select
          value={currentId ?? (customLabel ? '__forged__' : '')}
          onChange={(e) => {
            if (e.target.value !== '__forged__') loadScenario(e.target.value);
          }}
          style={{ marginTop: 4 }}
        >
          <option value="" disabled>— Select —</option>
          {customLabel && <option value="__forged__">{customLabel}</option>}
          {SCENARIO_LIST.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>STAR</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {STAR_FORMS.map((form) => (
            <button key={form.id} className="hud-btn" type="button" onClick={() => changeStar(form.id)}>
              {form.label}
            </button>
          ))}
        </div>
      </div>

      <hr className="hud-sep" />
      <label>SIM TIME</label>
      <div className="value" style={{ fontSize: 12, color: '#00d4ff' }}>
        T = {fmt(simTime, 4)} <span style={{ fontSize: 9, color: 'rgba(142,232,255,0.5)' }}>yr equiv.</span>
      </div>
    </div>
  );
}

// ── Toggle Toolbar (bottom-center) ────────────────────────────────────────────
function Toolbar({ canvasRef }) {
  const showTrails        = useSimStore((s) => s.showTrails);
  const showArrows        = useSimStore((s) => s.showVelocityArrows);
  const showLagrange      = useSimStore((s) => s.showLagrangePoints);
  const showEnergy        = useSimStore((s) => s.showEnergyGraph);
  const cinemaMode        = useSimStore((s) => s.cinemaMode);
  const collisionMode     = useSimStore((s) => s.collisionMode);
  const audioEnabled      = useSimStore((s) => s.audioEnabled);
  const showGrid          = useSimStore((s) => s.showGrid);
  const showPreds         = useSimStore((s) => s.showPredictions);
  const showGlow          = useSimStore((s) => s.showGlow);
  const showLabels        = useSimStore((s) => s.showBodyLabels);
  const followCOM         = useSimStore((s) => s.followCOM);
  const rocheEnabled      = useSimStore((s) => s.rocheEnabled);

  const setShowTrails     = useSimStore((s) => s.setShowTrails);
  const setShowArrows     = useSimStore((s) => s.setShowVelocityArrows);
  const setShowLagrange   = useSimStore((s) => s.setShowLagrangePoints);
  const setShowEnergy     = useSimStore((s) => s.setShowEnergyGraph);
  const setCinema         = useSimStore((s) => s.setCinemaMode);
  const setCollision      = useSimStore((s) => s.setCollisionMode);
  const setAudio          = useSimStore((s) => s.setAudioEnabled);
  const setShowGrid       = useSimStore((s) => s.setShowGrid);
  const setShowPreds      = useSimStore((s) => s.setShowPredictions);
  const setShowGlow       = useSimStore((s) => s.setShowGlow);
  const setShowLabels     = useSimStore((s) => s.setShowBodyLabels);
  const setFollowCOM      = useSimStore((s) => s.setFollowCOM);
  const setRocheEnabled   = useSimStore((s) => s.setRocheEnabled);
  const clearTrails       = useSimStore((s) => s.clearTrails);
  const shareURL          = useSimStore((s) => s.shareURL);

  const handleExport = useCallback(async () => {
    if (!canvasRef?.current) return;
    try {
      await recordCanvas(canvasRef.current, 10000);
    } catch {
      alert('Video export is not supported in this browser.');
    }
  }, [canvasRef]);

  const handleScreenshot = useCallback(() => {
    takeScreenshot(canvasRef);
  }, [canvasRef]);

  const handleAudio = useCallback(() => {
    if (!audioEnabled) {
      audioEngine.init();
      audioEngine.resume();
      const { bodies } = useSimStore.getState();
      bodies.filter((b) => b.isAlive).forEach((b) => audioEngine.addBody(b.id, b.mass));
    } else {
      audioEngine.dispose();
    }
    setAudio(!audioEnabled);
  }, [audioEnabled, setAudio]);

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '8px 12px',
        background: 'rgba(0,8,20,0.75)',
        borderRadius: 6,
        border: '1px solid rgba(0,200,255,0.15)',
        backdropFilter: 'blur(10px)',
        pointerEvents: 'all',
        maxWidth: 740,
      }}
    >
      <button className={`hud-btn ${showTrails ? 'active' : ''}`}    onClick={() => setShowTrails(!showTrails)}>Trails</button>
      <button className={`hud-btn ${showArrows ? 'active' : ''}`}    onClick={() => setShowArrows(!showArrows)}>Vectors</button>
      <button className={`hud-btn ${showLagrange ? 'active' : ''}`}  onClick={() => setShowLagrange(!showLagrange)}>Lagrange</button>
      <button className={`hud-btn ${showEnergy ? 'active' : ''}`}    onClick={() => setShowEnergy(!showEnergy)}>Energy</button>
      <button className={`hud-btn ${showGrid ? 'active' : ''}`}      onClick={() => setShowGrid(!showGrid)}>Grid</button>
      <button className={`hud-btn ${showGlow ? 'active' : ''}`}      onClick={() => setShowGlow(!showGlow)}>Glow</button>
      <button className={`hud-btn ${showPreds ? 'active' : ''}`}     onClick={() => setShowPreds(!showPreds)}>Orbits</button>
      <button className={`hud-btn ${showLabels ? 'active' : ''}`}    onClick={() => setShowLabels(!showLabels)}>Labels</button>
      <button className={`hud-btn ${cinemaMode ? 'active' : ''}`}    onClick={() => setCinema(!cinemaMode)}>Cinema</button>
      <button className={`hud-btn ${followCOM ? 'active' : ''}`}     onClick={() => setFollowCOM(!followCOM)}>COM Lock</button>

      <div style={{ width: 1, background: 'rgba(0,212,255,0.2)', margin: '0 4px' }} />

      <button
        className="hud-btn"
        onClick={() => setCollision(collisionMode === 'merge' ? 'elastic' : 'merge')}
        title="Toggle collision mode"
      >
        {collisionMode === 'merge' ? '💥 Merge' : '↩ Bounce'}
      </button>

      <button
        className={`hud-btn ${rocheEnabled ? 'active' : ''}`}
        onClick={() => setRocheEnabled(!rocheEnabled)}
        title="Toggle Roche limit tidal disruption"
      >
        🌊 Roche
      </button>

      <button className={`hud-btn ${audioEnabled ? 'active' : ''}`} onClick={handleAudio}>
        {audioEnabled ? '🔊 Audio' : '🔇 Audio'}
      </button>

      <button className="hud-btn" style={{ color: 'rgba(142,232,255,0.5)' }} onClick={clearTrails}>Clear</button>

      <div style={{ width: 1, background: 'rgba(0,212,255,0.2)', margin: '0 4px' }} />

      <button className="hud-btn" onClick={shareURL} title="Copy shareable URL">🔗 Share</button>
      <button className="hud-btn" onClick={handleScreenshot} title="Save screenshot">📷 Snap</button>
      <button className="hud-btn warn-btn" onClick={handleExport} title="Record 10s video">⏺ Export</button>
    </div>
  );
}

// ── Energy panel (bottom-right) ────────────────────────────────────────────────
function EnergyPanel() {
  const energy      = useSimStore((s) => s.energy);
  const showEnergy  = useSimStore((s) => s.showEnergyGraph);
  if (!showEnergy) return null;
  return (
    <div className="hud-panel" style={{ minWidth: 210 }}>
      <h3>System Energy</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', marginBottom: 8 }}>
        <label>Kinetic</label>
        <span className="value green">{fmt(energy.KE, 4)}</span>
        <label>Potential</label>
        <span className="value warn">{fmt(energy.PE, 4)}</span>
        <label>Total E</label>
        <span className="value accent">{fmt(energy.total, 4)}</span>
      </div>
      <EnergyGraph />
    </div>
  );
}

// ── Root HUD ──────────────────────────────────────────────────────────────────
export function HUD({ canvasRef }) {
  const showMiniMap = useSimStore((s) => s.showMiniMap);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        zIndex: 100,
      }}
    >
      {/* Corner cosmetics */}
      <div className="corner-tl" />
      <div className="corner-tr" />
      <div className="corner-bl" />
      <div className="corner-br" />

      {/* Scanlines overlay */}
      <div className="scanlines" />

      {/* Top-left: body list */}
      <div style={{ position: 'absolute', top: 20, left: 20 }}>
        <BodyList />
      </div>

      {/* Top-right: sim controls */}
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <TimeControls />
      </div>

      {/* Bottom-left: selected body + editor */}
      <div style={{ position: 'absolute', bottom: 70, left: 20 }}>
        <BodyPanel />
        <BodyEditor />
      </div>

      {/* Bottom-right: energy */}
      <div style={{ position: 'absolute', bottom: 70, right: 20 }}>
        <EnergyPanel />
      </div>

      {/* Mini-map (above energy, right side) */}
      {showMiniMap && (
        <div style={{ position: 'absolute', top: 220, right: 20 }}>
          <MiniMap />
        </div>
      )}

      {/* FPS counter (top-left, below body list) */}
      <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)' }}>
        <FPSCounter />
      </div>

      {/* Time rewind controls */}
      <div style={{ position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)' }}>
        <TimeRewindControls />
      </div>

      {/* Bottom-center: toolbar */}
      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)' }}>
        <Toolbar canvasRef={canvasRef} />
      </div>

      {/* Help hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          right: 20,
          fontSize: 9,
          color: 'rgba(142,232,255,0.3)',
          pointerEvents: 'none',
        }}
      >
        Press H for keyboard shortcuts
      </div>
    </div>
  );
}
