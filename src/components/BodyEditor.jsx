/**
 * BodyEditor — inline panel for editing selected body's properties.
 *
 * When a body is selected, shows sliders for mass, velocity, and buttons
 * to delete or split the body.
 */

import { useState, useCallback, useEffect } from 'react';
import { useSimStore } from '../store/useSimStore';
import { decorateBody } from '../game/planetProfile';

export function BodyEditor() {
  const body = useSimStore(
    (s) => s.bodies.find((b) => b.id === s.selectedBodyId) ?? null,
  );
  const removeBody = useSimStore((s) => s.removeBody);

  const [massScale, setMassScale] = useState(1);
  const [velScale, setVelScale] = useState(1);

  // Reset sliders when selection changes
  useEffect(() => {
    setMassScale(1);
    setVelScale(1);
  }, [body?.id]);

  const applyMass = useCallback(() => {
    if (!body) return;
    const store = useSimStore.getState();
    const newBodies = store.bodies.map((b) => {
      if (b.id !== body.id) return b;
      const newMass = Math.max(0.001, body.mass * massScale);
      return decorateBody({ ...b, mass: newMass, profile: null });
    });
    useSimStore.setState({ bodies: newBodies });
  }, [body, massScale]);

  const applyVelocity = useCallback(() => {
    if (!body) return;
    const store = useSimStore.getState();
    const newBodies = store.bodies.map((b) => {
      if (b.id !== body.id) return b;
      return {
        ...b,
        velocity: [
          b.velocity[0] * velScale,
          b.velocity[1] * velScale,
          b.velocity[2] * velScale,
        ],
      };
    });
    useSimStore.setState({ bodies: newBodies });
  }, [body, velScale]);

  const splitBody = useCallback(() => {
    if (!body) return;
    const store = useSimStore.getState();
    const halfMass = body.mass / 2;
    const offset = body.radius * 1.5;

    // Reduce original mass
    const newBodies = store.bodies.map((b) => {
      if (b.id !== body.id) return b;
      return decorateBody({ ...b, mass: halfMass, radius: b.radius * Math.cbrt(0.5), profile: null });
    });

    // Add fragment
    const fragment = {
      id: `split-${Date.now()}`,
      name: `${body.name}-B`,
      type: body.type,
      mass: halfMass,
      radius: body.radius * Math.cbrt(0.5),
      color: body.color,
      position: [
        body.position[0] + offset,
        body.position[1],
        body.position[2],
      ],
      velocity: [
        body.velocity[0] + 0.2,
        body.velocity[1] - 0.2,
        body.velocity[2],
      ],
      trail: [],
      isAlive: true,
      mergedInto: null,
    };

    useSimStore.setState({ bodies: newBodies });
    useSimStore.getState().addBody(fragment);
  }, [body]);

  if (!body) return null;

  return (
    <div className="hud-panel" style={{ minWidth: 200, marginTop: 10 }}>
      <h3>Edit Body</h3>

      <div style={{ marginBottom: 10 }}>
        <label>
          MASS SCALE &nbsp;
          <span className="value accent">{massScale.toFixed(2)}×</span>
        </label>
        <input
          type="range"
          min={-2}
          max={2}
          step={0.01}
          value={Math.log2(massScale)}
          onChange={(e) => setMassScale(Math.pow(2, parseFloat(e.target.value)))}
        />
        <button
          className="hud-btn"
          style={{ marginTop: 4, width: '100%' }}
          onClick={applyMass}
        >
          Apply Mass
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>
          VELOCITY SCALE &nbsp;
          <span className="value accent">{velScale.toFixed(2)}×</span>
        </label>
        <input
          type="range"
          min={-2}
          max={2}
          step={0.01}
          value={Math.log2(velScale)}
          onChange={(e) => setVelScale(Math.pow(2, parseFloat(e.target.value)))}
        />
        <button
          className="hud-btn"
          style={{ marginTop: 4, width: '100%' }}
          onClick={applyVelocity}
        >
          Apply Velocity
        </button>
      </div>

      <hr className="hud-sep" />

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="hud-btn"
          style={{ flex: 1 }}
          onClick={splitBody}
          title="Split into two bodies"
        >
          ✂ Split
        </button>
        <button
          className="hud-btn warn-btn"
          style={{ flex: 1 }}
          onClick={() => removeBody(body.id)}
        >
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
