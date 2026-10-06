/**
 * App — root component.
 *
 * Renders:
 *  <Scene>   — the full-screen R3F canvas with all 3D content
 *  <HUD>     — the React HTML overlay (controls, info panels, toolbar)
 *
 * The canvas ref is threaded through both so the HUD can trigger recording.
 */

import { useEffect, useRef } from 'react';
import { Scene } from './components/Scene';
import { HUD }   from './components/HUD';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { GalaxyCommandCenter } from './components/command/GalaxyCommandCenter';
import { SystemOrdersMenu } from './components/command/SystemOrdersMenu';
import { StrategicEventDirector } from './components/command/StrategicEventDirector';
import { useStrategicStore } from './store/useStrategicStore';
import { installUiSounds } from './game/uiSound';

export default function App() {
  const canvasRef = useRef(null);
  const viewMode = useStrategicStore((state) => state.viewMode);
  const setViewMode = useStrategicStore((state) => state.setViewMode);

  useEffect(() => {
    installUiSounds();
  }, []);

  return (
    <>
      <StrategicEventDirector />
      {viewMode !== 'system' ? <GalaxyCommandCenter /> : (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
          <ErrorBoundary>
            <Scene canvasRef={canvasRef} />
          </ErrorBoundary>
          <HUD canvasRef={canvasRef} />
          <KeyboardShortcuts />
          <button className="return-to-galaxy" onClick={() => setViewMode('galaxy')}>
            ← Strategic galaxy map
          </button>
          <SystemOrdersMenu />
        </div>
      )}
    </>
  );
}
