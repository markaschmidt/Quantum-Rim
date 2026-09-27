/**
 * KeyboardShortcuts — global hotkey handler + help overlay.
 *
 * Shows all shortcuts when user presses '?' or 'H'.
 * Also wires up all the non-camera hotkeys.
 */

import { useEffect, useState } from 'react';
import { useSimStore } from '../store/useSimStore';

const SHORTCUTS = [
  { key: 'Space', action: 'Pause / Resume' },
  { key: 'W A S D', action: 'Move camera' },
  { key: '↑ ↓ ← →', action: 'Move camera' },
  { key: 'E / Q', action: 'Camera up / down' },
  { key: 'Shift', action: 'Speed boost (hold)' },
  { key: 'C', action: 'Toggle cinema mode' },
  { key: 'T', action: 'Toggle trails' },
  { key: 'V', action: 'Toggle velocity vectors' },
  { key: 'G', action: 'Toggle grid' },
  { key: 'P', action: 'Toggle orbit predictions' },
  { key: 'L', action: 'Toggle Lagrange points' },
  { key: 'M', action: 'Toggle mini-map' },
  { key: 'R', action: 'Reset to current scenario' },
  { key: '[ / ]', action: 'Slow down / Speed up' },
  { key: 'F', action: 'Focus on selected body' },
  { key: 'N', action: 'Toggle body name labels' },
  { key: '1-7', action: 'Load scenario 1–7' },
  { key: 'H / ?', action: 'Toggle this help' },
  { key: 'Escape', action: 'Deselect / Close help' },
];

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      // Don't capture if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      const store = useSimStore.getState();
      const key = e.code;

      switch (key) {
        case 'Space':
          e.preventDefault();
          store.togglePause();
          break;
        case 'KeyC':
          store.setCinemaMode(!store.cinemaMode);
          break;
        case 'KeyT':
          store.setShowTrails(!store.showTrails);
          break;
        case 'KeyV':
          store.setShowVelocityArrows(!store.showVelocityArrows);
          break;
        case 'KeyG':
          store.setShowGrid(!store.showGrid);
          break;
        case 'KeyP':
          store.setShowPredictions(!store.showPredictions);
          break;
        case 'KeyL':
          store.setShowLagrangePoints(!store.showLagrangePoints);
          break;
        case 'KeyM':
          store.setShowMiniMap(!store.showMiniMap);
          break;
        case 'KeyN':
          store.setShowBodyLabels(!store.showBodyLabels);
          break;
        case 'KeyR': {
          const currentId = store.currentScenarioId;
          if (currentId) store.loadScenario(currentId);
          break;
        }
        case 'KeyF':
          store.focusSelected();
          break;
        case 'BracketLeft':
          store.setTimeScale(store.timeScale * 0.7);
          break;
        case 'BracketRight':
          store.setTimeScale(store.timeScale * 1.4);
          break;
        case 'Digit1': store.loadScenario('figure8'); break;
        case 'Digit2': store.loadScenario('binaryStar'); break;
        case 'Digit3': store.loadScenario('chaos'); break;
        case 'Digit4': store.loadScenario('solarSystem'); break;
        case 'Digit5': store.loadScenario('doubleBinary'); break;
        case 'Digit6': store.loadScenario('figure8_3d'); break;
        case 'Digit7': store.loadScenario('slingshot'); break;
        case 'KeyH':
        case 'Slash':
          if (e.shiftKey || key === 'Slash') setShowHelp((v) => !v);
          else if (key === 'KeyH') setShowHelp((v) => !v);
          break;
        case 'Escape':
          if (showHelp) setShowHelp(false);
          else store.selectBody(null);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);

  if (!showHelp) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 500,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'all',
      }}
      onClick={() => setShowHelp(false)}
    >
      <div
        className="hud-panel"
        style={{
          minWidth: 340,
          maxWidth: 420,
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '20px 28px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 13, marginBottom: 16 }}>⌨ Keyboard Shortcuts</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px 16px' }}>
          {SHORTCUTS.map(({ key, action }) => (
            <>
              <kbd
                key={`k-${key}`}
                style={{
                  background: 'rgba(0,212,255,0.1)',
                  border: '1px solid rgba(0,212,255,0.3)',
                  borderRadius: 3,
                  padding: '2px 6px',
                  color: '#00d4ff',
                  fontSize: 10,
                  textAlign: 'center',
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                {key}
              </kbd>
              <span key={`a-${key}`} style={{ fontSize: 11, color: 'rgba(142,232,255,0.8)' }}>
                {action}
              </span>
            </>
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            textAlign: 'center',
            color: 'rgba(142,232,255,0.4)',
            fontSize: 10,
          }}
        >
          Press H or ESC to close
        </div>
      </div>
    </div>
  );
}
