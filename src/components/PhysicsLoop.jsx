/**
 * PhysicsLoop — runs inside the R3F Canvas at 60 fps.
 *
 * Hooks into useFrame, applies the simulation timestep each frame,
 * and drives the Zustand store. Physics runs outside React's render cycle
 * so it never causes component re-renders on its own.
 */

import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../store/useSimStore';
import { audioEngine } from '../utils/audio';

export function PhysicsLoop() {
  useFrame((state, delta) => {
    const store = useSimStore.getState();

    // Clamp delta to prevent huge jumps on tab-switch
    const clampedDelta = Math.min(delta, 0.05);
    const { timeScale, isPaused, audioEnabled, bodies } = store;

    if (isPaused) return;

    const simDt = clampedDelta * timeScale;
    store.tick(simDt);

    // Update spatial audio
    if (audioEnabled) {
      const camPos = [
        state.camera.position.x,
        state.camera.position.y,
        state.camera.position.z,
      ];
      bodies.forEach((b) => {
        if (!b.isAlive) return;
        audioEngine.updateBody(b.id, camPos, b.position);
      });
    }
  });

  return null;
}
