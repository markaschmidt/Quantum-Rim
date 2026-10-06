import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { useSimStore } from '../store/useSimStore';

function hashUnit(salt) {
  let hash = 2166136261;
  const text = String(salt);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function axisFrom(quasar, time, id) {
  const wander = (hashUnit(`${id}:${Math.floor(time * (1 + quasar.spontaneity))}`) - 0.5) * quasar.spontaneity * 0.45;
  const azimuth = (quasar.azimuth || 0) + wander;
  const polar = (quasar.polar || 0.6) + wander * 0.35;
  return new THREE.Vector3(
    Math.sin(polar) * Math.cos(azimuth),
    Math.cos(polar),
    Math.sin(polar) * Math.sin(azimuth),
  ).normalize();
}

export function QuasarJets() {
  const meshRef = useRef([]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffd27a',
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const quasars = useSimStore.getState().bodies.filter((body) => body.isAlive !== false && body.quasar);
    meshRef.current.forEach((mesh) => {
      if (mesh) mesh.visible = false;
    });
    quasars.forEach((body, index) => {
      const mesh = meshRef.current[index];
      if (!mesh) return;
      const jet = body.quasar;
      const bucket = Math.floor(time * (0.6 + jet.spontaneity * 4));
      const burst = hashUnit(`${body.id}:burst:${bucket}`) < 0.28 + jet.spontaneity * 0.62;
      const direction = axisFrom(jet, time, body.id);
      const length = (8 + jet.power * 14) * (burst ? 1 : 0.35);
      const width = Math.max(0.08, body.radius * (1.2 + jet.opening * 4));
      mesh.visible = true;
      mesh.position.set(...body.position);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      mesh.scale.set(width * (burst ? 1 : 0.45), length, width * (burst ? 1 : 0.45));
      mesh.material.opacity = burst ? 0.82 : 0.18;
    });
  });

  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => { meshRef.current[index] = node; }}
          visible={false}
          material={material}
        >
          <cylinderGeometry args={[1, 0.08, 1, 16, 1, true]} />
        </mesh>
      ))}
    </>
  );
}
