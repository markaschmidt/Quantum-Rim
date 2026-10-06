/**
 * CinematicCamera — automated camera that orbits and tracks interesting events.
 *
 * Two modes:
 *  1. Manual  — OrbitControls from Drei (user can pan/rotate/zoom freely)
 *  2. Cinema  — Auto-interpolates between bodies, focuses on most energetic pair
 *
 * In Cinema mode the camera:
 *  - Picks the two bodies with the highest relative kinetic energy
 *  - Smoothly interpolates its position to a "dramatic angle" behind and above
 *  - Slowly rotates around the center of mass
 */

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';

const _camTarget = new THREE.Vector3();
const _camPos    = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();

export function CinematicCamera() {
  const controlsRef = useRef();
  const cinemaAngle = useRef(0);
  const { camera } = useThree();

  const cinemaMode = useSimStore((s) => s.cinemaMode);

  // Disable OrbitControls in cinema mode
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !cinemaMode;
    }
  }, [cinemaMode]);

  useFrame((_, delta) => {
    if (!cinemaMode && controlsRef.current) {
      const { focusBodyId, focusAt, bodies } = useSimStore.getState();
      const age = focusBodyId ? (Date.now() - (focusAt || 0)) / 1000 : 99;
      const body = age < 1.6 ? bodies.find((item) => item.id === focusBodyId && item.isAlive !== false) : null;
      if (body) {
        const dist = Math.max(7, (body.radius || 0.4) * 16);
        _desiredTarget.set(body.position[0], body.position[1], body.position[2]);
        _desiredPos.set(
          body.position[0] + dist * 0.28,
          body.position[1] + dist * 0.7,
          body.position[2] + dist * 0.82,
        );
        const alpha = 1 - Math.pow(0.05, delta);
        camera.position.lerp(_desiredPos, alpha);
        controlsRef.current.target.lerp(_desiredTarget, alpha);
        controlsRef.current.update();
        return;
      }
    }
    if (!cinemaMode) return;

    const { bodies } = useSimStore.getState();
    const alive = bodies.filter((b) => b.isAlive);
    if (alive.length === 0) return;

    // Find center of mass
    let totalMass = 0;
    let cx = 0, cy = 0, cz = 0;
    for (const b of alive) {
      cx += b.mass * b.position[0];
      cy += b.mass * b.position[1];
      cz += b.mass * b.position[2];
      totalMass += b.mass;
    }
    cx /= totalMass; cy /= totalMass; cz /= totalMass;

    // Find bounding radius to determine camera distance
    let maxDist = 1.5;
    for (const b of alive) {
      const dx = b.position[0] - cx;
      const dy = b.position[1] - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d + b.radius > maxDist) maxDist = d + b.radius;
    }

    // Slowly orbit around COM
    cinemaAngle.current += delta * 0.08;
    const camDist = Math.max(maxDist * 2.2, 5);
    const camHeight = camDist * 0.35;

    _desiredPos.set(
      cx + camDist * Math.cos(cinemaAngle.current),
      cy + camHeight,
      cz + camDist * Math.sin(cinemaAngle.current),
    );
    _desiredTarget.set(cx, cy, cz);

    // Smooth interpolation (lerp factor per frame)
    const alpha = 1 - Math.pow(0.02, delta);
    camera.position.lerp(_desiredPos, alpha);
    _camTarget.lerp(_desiredTarget, alpha);
    camera.lookAt(_camTarget);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      minDistance={0.5}
      maxDistance={500}
      mouseButtons={{
        LEFT:   THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT:  THREE.MOUSE.PAN,
      }}
    />
  );
}
