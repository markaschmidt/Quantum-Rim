/**
 * COMFollower — optionally locks the camera/OrbitControls target
 *               to the center of mass of all alive bodies.
 *
 * When enabled, smoothly interpolates the controls target toward the COM.
 */

import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';

const _target = new THREE.Vector3();

export function COMFollower({ enabled }) {
  useFrame((state) => {
    if (!enabled) return;
    const { bodies } = useSimStore.getState();
    const alive = bodies.filter((b) => b.isAlive);
    if (alive.length === 0) return;

    let totalMass = 0;
    _target.set(0, 0, 0);
    for (const b of alive) {
      _target.x += b.mass * b.position[0];
      _target.y += b.mass * b.position[1];
      _target.z += b.mass * b.position[2];
      totalMass += b.mass;
    }
    if (totalMass > 0) {
      _target.divideScalar(totalMass);
    }

    // Smoothly interpolate OrbitControls target
    const controls = state.controls;
    if (controls && controls.target) {
      controls.target.lerp(_target, 0.05);
    }
  });

  return null;
}
