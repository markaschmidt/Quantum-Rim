/**
 * VelocityArrow — renders a visual velocity vector for a body.
 *
 * The arrow points in the direction of velocity.
 * Length is proportional to speed (capped for sanity).
 * Color matches the body's trail color at current speed.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';

export function VelocityArrow({ bodyId, color }) {
  const arrowRef = useRef();

  // Arrow shaft + cone geometry
  const { shaftGeo, coneGeo } = useMemo(() => {
    const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
    shaftGeo.translate(0, 0.5, 0);
    const coneGeo = new THREE.ConeGeometry(0.08, 0.25, 8);
    coneGeo.translate(0, 1.125, 0);
    return { shaftGeo, coneGeo };
  }, []);

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: color ?? '#00d4ff',
        transparent: true,
        opacity: 0.85,
      }),
    [color],
  );

  useFrame(() => {
    if (!arrowRef.current) return;

    const body = useSimStore.getState().bodies.find((b) => b.id === bodyId);
    if (!body || !body.isAlive) { arrowRef.current.visible = false; return; }

    const { position, velocity, radius } = body;
    const vx = velocity[0], vy = velocity[1], vz = velocity[2];
    const spd = Math.sqrt(vx * vx + vy * vy + vz * vz);

    if (spd < 0.001) { arrowRef.current.visible = false; return; }
    arrowRef.current.visible = true;

    const len = Math.min(Math.max(spd * 0.4, 0.2), 2.5);
    const nx = vx / spd, ny = vy / spd, nz = vz / spd;

    arrowRef.current.position.set(
      position[0] + nx * (radius ?? 0.2) * 1.2,
      position[1] + ny * (radius ?? 0.2) * 1.2,
      position[2] + nz * (radius ?? 0.2) * 1.2,
    );

    const up  = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(nx, ny, nz);
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(up, dir);
    arrowRef.current.quaternion.copy(quat);
    arrowRef.current.scale.setScalar(len);
  });

  return (
    <group ref={arrowRef}>
      <mesh geometry={shaftGeo} material={mat} />
      <mesh geometry={coneGeo}  material={mat} />
    </group>
  );
}
