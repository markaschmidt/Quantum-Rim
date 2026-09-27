/**
 * CollisionEffect — 3D collision VFX emitted when two bodies merge.
 *
 * Four layers, all volumetric (no flat rings):
 *  1. CoreFlash     — brief white-hot sphere at the impact point
 *  2. ShockSphere   — main expanding translucent sphere shell (blast wave)
 *  3. SecondarySphere — smaller delayed sphere shells in color
 *  4. ParticleBurst — 80 instanced debris particles flying outward in
 *                     all 3D directions (true volumetric explosion)
 */

import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore, selectMergerEvents } from '../store/useSimStore';

const DURATION = 2.4; // seconds (wall clock)
const BAND_COLOR = { graze: '#9fd7ff', battering: '#ffb45a', cataclysm: '#ff5a3c' };

function bandColor(event) {
  return BAND_COLOR[event.band] || BAND_COLOR.battering;
}

function burstCount(event) {
  if (event.band === 'graze') return 40;
  if (event.band === 'cataclysm') return 140;
  return 80;
}

// Utility: uniform random direction on a unit sphere
function randomSphereDir() {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  ];
}

// ── 1. Brief hot-white core flash ─────────────────────────────────────────────
function CoreFlash({ event }) {
  const meshRef  = useRef();
  const startRef = useRef(Date.now());
  const [dead, setDead] = useState(false);

  useFrame(() => {
    if (!meshRef.current || dead) return;
    const elapsed = (Date.now() - startRef.current) / 1000;
    if (elapsed > 0.35) { setDead(true); return; }
    const t = elapsed / 0.35;
    meshRef.current.scale.setScalar(Math.pow(1 - t, 0.5) * Math.min(event.mass * 0.5 + 0.6, 2.5));
    meshRef.current.material.opacity = 1 - t;
  });

  if (dead) return null;
  return (
    <mesh ref={meshRef} position={event.position}>
      <sphereGeometry args={[1, 16, 8]} />
      <meshBasicMaterial color={bandColor(event)} transparent opacity={1.0}
        blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ── 2. Primary blast sphere shell ─────────────────────────────────────────────
function ShockSphere({ event }) {
  const meshRef  = useRef();
  const startRef = useRef(Date.now());
  const [dead, setDead] = useState(false);

  useFrame(() => {
    if (!meshRef.current || dead) return;
    const elapsed = (Date.now() - startRef.current) / 1000;
    if (elapsed > DURATION) { setDead(true); return; }
    const t = elapsed / DURATION;
    meshRef.current.scale.setScalar(t * Math.min(event.mass * 2.0 + 1.5, 7));
    meshRef.current.material.opacity = Math.pow(1 - t, 1.8) * 0.65;
  });

  if (dead) return null;
  return (
    <mesh ref={meshRef} position={event.position}>
      <sphereGeometry args={[1, 32, 16]} />
      {/* BackSide renders as an inward-facing shell — looks like a bubble */}
      <meshBasicMaterial color={bandColor(event)} transparent opacity={0.65}
        side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ── 3. Secondary delayed sphere shells ────────────────────────────────────────
function SecondarySphere({ event, delay, color, maxScale }) {
  const meshRef  = useRef();
  const startRef = useRef(Date.now() + delay * 1000);
  const [started, setStarted] = useState(false);
  const [dead, setDead]       = useState(false);
  const dur = DURATION * 0.65;

  useFrame(() => {
    const now = Date.now();
    if (!started) { if (now < startRef.current) return; setStarted(true); }
    if (!meshRef.current || dead) return;
    const elapsed = (now - startRef.current) / 1000;
    if (elapsed > dur) { setDead(true); return; }
    const t = elapsed / dur;
    meshRef.current.scale.setScalar(t * Math.min(maxScale ?? (event.mass + 1), 5));
    meshRef.current.material.opacity = Math.pow(1 - t, 2.2) * 0.45;
  });

  if (dead || !started) return null;
  return (
    <mesh ref={meshRef} position={event.position}>
      <sphereGeometry args={[1, 24, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.45}
        side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ── 4. Instanced 3D particle burst ────────────────────────────────────────────
function ParticleBurst({ event }) {
  const meshRef  = useRef();
  const startRef = useRef(Date.now());
  const [dead, setDead] = useState(false);
  const dur = DURATION * 0.85;

  // Generate per-particle velocity vectors once (uniform sphere distribution)
  const particles = useMemo(() => {
    const speedScale = Math.min(event.mass * 0.6 + 0.8, 3.0);
    return Array.from({ length: burstCount(event) }, () => {
      const [dx, dy, dz] = randomSphereDir();
      const speed = (0.4 + Math.random() * 0.6) * speedScale;
      return { dx: dx * speed, dy: dy * speed, dz: dz * speed };
    });
  }, [event]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current || dead) return;
    const elapsed = (Date.now() - startRef.current) / 1000;
    if (elapsed > dur) { setDead(true); return; }
    const t     = elapsed / dur;
    const eased = 1 - Math.pow(1 - Math.min(elapsed, 1), 1.5); // ease-out
    const baseSize = Math.min(event.mass * 0.025 + 0.018, 0.08);

    for (let i = 0; i < particles.length; i++) {
      const { dx, dy, dz } = particles[i];
      dummy.position.set(
        event.position[0] + dx * eased,
        event.position[1] + dy * eased,
        event.position[2] + dz * eased,
      );
      dummy.scale.setScalar(baseSize * (1 - t * 0.7));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.material.opacity = Math.pow(1 - t, 1.4) * 0.95;
  });

  if (dead) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
      <sphereGeometry args={[1, 5, 4]} />
      <meshBasicMaterial color={bandColor(event)} transparent opacity={0.95}
        blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────
export function CollisionEffects() {
  const mergerEvents = useSimStore(selectMergerEvents);

  return (
    <>
      {mergerEvents.map((event) => (
        <group key={event.id}>
          <CoreFlash event={event} />
          <ShockSphere event={event} />
          <SecondarySphere event={event} delay={0.08}  color="#ff6b35" maxScale={event.mass * 1.2 + 0.8} />
          <SecondarySphere event={event} delay={0.20}  color="#ffe066" maxScale={event.mass * 0.8 + 0.5} />
          <SecondarySphere event={event} delay={0.40}  color="#ff3fa4" maxScale={event.mass * 0.5 + 0.3} />
          <ParticleBurst event={event} />
        </group>
      ))}
    </>
  );
}
