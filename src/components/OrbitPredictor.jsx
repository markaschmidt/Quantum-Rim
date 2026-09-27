/**
 * OrbitPredictor — shows predicted future orbit paths for alive bodies.
 *
 * Runs a lightweight "ghost" simulation forward N steps from the current state,
 * then renders the predicted positions as dashed lines.
 * Unlike trails which show history, these show the future.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';
import { computeAccelerations } from '../physics/gravity';

const PREDICTION_STEPS = 300;
const PREDICTION_DT = 0.004;

// Simple Euler integration for prediction (RK4 too expensive for real-time ghosts)
function predictOrbits(bodies, steps, dt) {
  const alive = bodies.filter((b) => b.isAlive);
  if (alive.length < 1) return {};

  // Deep copy alive bodies for simulation
  let state = alive.map((b) => ({
    id: b.id,
    mass: b.mass,
    isAlive: true,
    position: [...b.position],
    velocity: [...b.velocity],
  }));

  const paths = {};
  alive.forEach((b) => (paths[b.id] = [b.position.slice()]));

  for (let s = 0; s < steps; s++) {
    const accs = computeAccelerations(state);
    for (let i = 0; i < state.length; i++) {
      if (!state[i].isAlive) continue;
      state[i].velocity[0] += accs[i][0] * dt;
      state[i].velocity[1] += accs[i][1] * dt;
      state[i].velocity[2] += accs[i][2] * dt;
      state[i].position[0] += state[i].velocity[0] * dt;
      state[i].position[1] += state[i].velocity[1] * dt;
      state[i].position[2] += state[i].velocity[2] * dt;
    }
    // Sample every 3rd step for performance
    if (s % 3 === 0) {
      state.forEach((b) => {
        if (paths[b.id]) paths[b.id].push([...b.position]);
      });
    }
  }

  return paths;
}

function PredictionLine({ points, color }) {
  const lineRef = useRef();

  const { geo, line } = useMemo(() => {
    const maxPts = Math.ceil(PREDICTION_STEPS / 3) + 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3));
    g.setDrawRange(0, 0);

    const m = new THREE.LineDashedMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.35,
      dashSize: 0.15,
      gapSize: 0.1,
      depthWrite: false,
    });

    const l = new THREE.Line(g, m);
    l.frustumCulled = false;
    return { geo: g, line: l };
  }, [color]);

  // Update geometry when points change
  useEffect(() => {
    if (!points || points.length < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    const posAttr = geo.attributes.position;
    const n = Math.min(points.length, posAttr.count);
    for (let i = 0; i < n; i++) {
      posAttr.setXYZ(i, points[i][0], points[i][1], points[i][2]);
    }
    posAttr.needsUpdate = true;
    geo.setDrawRange(0, n);
  }, [points, geo]);

  useFrame(() => {
    if (lineRef.current) lineRef.current.computeLineDistances();
  });

  return <primitive ref={lineRef} object={line} />;
}

export function OrbitPredictor() {
  const pathsRef = useRef({});
  const frameCounter = useRef(0);
  const [paths, setPaths] = useState({});

  useFrame(() => {
    // Only recompute every 30 frames (~0.5s at 60fps) to save CPU
    frameCounter.current++;
    if (frameCounter.current % 30 !== 0) return;

    const { bodies } = useSimStore.getState();
    const newPaths = predictOrbits(bodies, PREDICTION_STEPS, PREDICTION_DT);
    pathsRef.current = newPaths;
    setPaths(newPaths);
  });

  const bodies = useSimStore((s) => s.bodies);
  const alive = bodies.filter((b) => b.isAlive);

  return (
    <>
      {alive.map((b) =>
        paths[b.id] && paths[b.id].length > 2 ? (
          <PredictionLine key={b.id} points={paths[b.id]} color={b.color} />
        ) : null,
      )}
    </>
  );
}
