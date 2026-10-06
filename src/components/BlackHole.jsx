/**
 * BlackHole — special rendering for black hole type bodies.
 *
 * Renders:
 *  1. An event horizon (pure black sphere)
 *  2. A photon ring (bright ring at the Schwarzschild radius)
 *  3. Background distortion shader (gravitational lensing visual)
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  varying vec2  vUv;

  void main() {
    // Ring glow centered around the midpoint of the torus cross-section
    float r = length(vUv - 0.5) * 2.0;
    float glow = exp(-r * r * 8.0);
    
    // Flickering
    float flicker = 0.8 + 0.2 * sin(uTime * 3.0 + vUv.x * 20.0);
    
    vec3 col = uColor * glow * flicker * 2.0;
    float alpha = glow * 0.9;
    
    gl_FragColor = vec4(col, alpha);
  }
`;

export const BlackHole = memo(function BlackHole({ bodyId, radius }) {
  const groupRef = useRef();
  const ringRef = useRef();
  const timeRef = useRef(0);

  const ringMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1.0, 0.6, 0.2) },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    timeRef.current += delta;
    ringMat.uniforms.uTime.value = timeRef.current;

    const body = useSimStore.getState().bodies.find((b) => b.id === bodyId);
    if (!body || !body.isAlive) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    groupRef.current.position.set(...body.position);

    // Slowly rotate the ring
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.3;
    }
  });

  const photonRingRadius = radius * 2.6;

  return (
    <group
      ref={groupRef}
      onPointerOver={(event) => {
        event.stopPropagation();
        const live = useSimStore.getState().bodies.find((item) => item.id === bodyId);
        if (live?.freshUntil > Date.now()) useSimStore.getState().dismissFresh(bodyId);
      }}
    >
      {/* Event horizon — pure black */}
      <mesh>
        <sphereGeometry args={[radius, 48, 24]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Inner dark zone */}
      <mesh>
        <sphereGeometry args={[radius * 1.5, 32, 16]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>

      {/* Photon ring / accretion ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[photonRingRadius, radius * 0.15, 16, 64]} />
        <primitive object={ringMat} attach="material" />
      </mesh>

      {/* Additional thin hot inner ring */}
      <mesh rotation={[Math.PI / 2, 0.3, 0]}>
        <torusGeometry args={[radius * 1.8, radius * 0.05, 8, 48]} />
        <meshBasicMaterial
          color="#ffaa44"
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});
