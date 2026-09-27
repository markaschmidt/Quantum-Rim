/**
 * RocheRings — GPU-instanced ring particles from tidal disruptions.
 *
 * When a body crosses the Roche limit and is destroyed, its mass
 * is converted into a swarm of small particles that orbit the
 * primary body, forming a planetary ring.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';
import { G } from '../physics/gravity';

const MAX_RING_PARTICLES = 500;
const RING_PARTICLE_LIFETIME = 120; // seconds

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function RocheRings() {
  const meshRef = useRef();
  const particlesRef = useRef([]);
  const rocheEvents = useSimStore((s) => s.rocheEvents ?? []);
  const processedRef = useRef(new Set());

  // Process new Roche events
  useEffect(() => {
    if (rocheEvents.length === 0) return;

    for (const event of rocheEvents) {
      if (!event.id || processedRef.current.has(event.id)) continue;
      processedRef.current.add(event.id);
      const { primaryPosition, orbitRadius, orbitalSpeed, secondaryColor, secondaryRadius, particleCount } = event;
      const count = particleCount || 50;

      for (let i = 0; i < count; i++) {
        if (particlesRef.current.length >= MAX_RING_PARTICLES) break;

        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const r = orbitRadius + (Math.random() - 0.5) * secondaryRadius * 6;

        const px = primaryPosition[0] + Math.cos(angle) * r;
        const py = primaryPosition[1] + (Math.random() - 0.5) * secondaryRadius * 0.3;
        const pz = primaryPosition[2] + Math.sin(angle) * r;

        const speed = orbitalSpeed * (0.85 + Math.random() * 0.3);
        const vx = -Math.sin(angle) * speed;
        const vy = (Math.random() - 0.5) * speed * 0.02;
        const vz = Math.cos(angle) * speed;

        particlesRef.current.push({
          position: [px, py, pz],
          velocity: [vx, vy, vz],
          size: secondaryRadius * (0.03 + Math.random() * 0.08),
          color: secondaryColor,
          age: 0,
          primaryId: event.primaryId,
        });
      }
    }
  }, [rocheEvents]);

  // Update particles
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const particles = particlesRef.current;
    const bodies = useSimStore.getState().bodies;

    let aliveCount = 0;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += delta;

      if (p.age > RING_PARTICLE_LIFETIME) {
        particles.splice(i, 1);
        continue;
      }

      // Gravitational attraction toward primary (and all massive bodies)
      for (const body of bodies) {
        if (!body.isAlive) continue;
        const dx = body.position[0] - p.position[0];
        const dy = body.position[1] - p.position[1];
        const dz = body.position[2] - p.position[2];
        const distSq = dx * dx + dy * dy + dz * dz + 0.01;
        const dist = Math.sqrt(distSq);
        const force = G * body.mass / distSq;
        p.velocity[0] += (dx / dist) * force * delta;
        p.velocity[1] += (dy / dist) * force * delta;
        p.velocity[2] += (dz / dist) * force * delta;
      }

      p.position[0] += p.velocity[0] * delta;
      p.position[1] += p.velocity[1] * delta;
      p.position[2] += p.velocity[2] * delta;

      // Set instance transform
      _dummy.position.set(...p.position);
      const s = p.size * (1 - p.age / RING_PARTICLE_LIFETIME * 0.3);
      _dummy.scale.setScalar(Math.max(s, 0.005));
      _dummy.updateMatrix();
      mesh.setMatrixAt(aliveCount, _dummy.matrix);

      _color.set(p.color);
      mesh.setColorAt(aliveCount, _color);

      aliveCount++;
    }

    mesh.count = aliveCount;
    if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_RING_PARTICLES]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
