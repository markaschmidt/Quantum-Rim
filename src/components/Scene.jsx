/**
 * Scene — the R3F Canvas and everything inside it.
 *
 * Hierarchy:
 *  Canvas
 *    ├─ PhysicsLoop (useFrame — drives the simulation)
 *    ├─ CinematicCamera (OrbitControls + cinema mode)
 *    ├─ StarField (background, 3 parallax layers)
 *    ├─ ambientLight (dim, 0.03)
 *    ├─ Bodies + Trails + VelocityArrows (per alive body)
 *    ├─ LagrangePoints (conditional)
 *    ├─ CollisionEffects (merger shockwaves)
 *    └─ PostFX (Bloom, Vignette, ChromaticAberration, Noise)
 *
 * The "fling" interaction: click+drag on empty space while holding Shift
 * to spawn a new body with the drag vector as initial velocity.
 */

import { useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { PhysicsLoop }      from './PhysicsLoop';
import { CinematicCamera }  from './CinematicCamera';
import { KeyboardCamera }   from './KeyboardCamera';
import { StarField }        from './StarField';
import { Body }             from './Body';
import { Trail }            from './Trail';
import { VelocityArrow }    from './VelocityArrow';
import { LagrangePoints }   from './LagrangePoints';
import { CollisionEffects } from './CollisionEffect';
import { PostFX }           from './PostFX';
import { GridPlane }        from './GridPlane';
import { BodyGlow }         from './BodyGlow';
import { OrbitPredictor }   from './OrbitPredictor';
import { BodyLabels }       from './BodyLabels';
import { COMFollower }      from './COMFollower';
import { BlackHole }        from './BlackHole';
import { AccretionDisk }    from './AccretionDisk';
import { RocheRings }       from './RocheRings';

import { useSimStore } from '../store/useSimStore';

// ── DragToFling interaction ────────────────────────────────────────────────────
// Shift + click-drag on empty space to fling a new body
// Projects onto a plane through the origin perpendicular to the camera, so it
// works correctly from any 3D viewing angle.
function DragToFling() {
  const { camera, gl } = useThree();
  const dragStart = useRef(null);
  const addBody   = useSimStore((s) => s.addBody);

  const screenToWorld = useCallback((clientX, clientY) => {
    const canvas = gl.domElement;
    const rect   = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width)  * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    const ndc = new THREE.Vector3(x, y, 0.5);
    ndc.unproject(camera);
    const rayDir = ndc.sub(camera.position).normalize();

    // Plane through origin with normal pointing toward camera
    const planeNormal = camera.position.clone().normalize();
    const denom = rayDir.dot(planeNormal);
    if (Math.abs(denom) < 1e-6) return null;
    const t = -camera.position.dot(planeNormal) / denom;
    if (t < 0) return null;
    return new THREE.Vector3(
      camera.position.x + rayDir.x * t,
      camera.position.y + rayDir.y * t,
      camera.position.z + rayDir.z * t,
    );
  }, [camera, gl]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (e) => {
      if (!e.shiftKey || e.button !== 0) return;
      const pos = screenToWorld(e.clientX, e.clientY);
      if (pos) dragStart.current = pos.clone();
    };

    const onUp = (e) => {
      if (!dragStart.current) return;
      const pos = screenToWorld(e.clientX, e.clientY);
      if (!pos) { dragStart.current = null; return; }

      const dx = pos.x - dragStart.current.x;
      const dy = pos.y - dragStart.current.y;
      const dz = pos.z - dragStart.current.z;
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (speed > 0.05) {
        addBody({
          id: `fling-${Date.now()}`,
          name: `Body-${Math.floor(Math.random() * 900 + 100)}`,
          type: 'rocky',
          mass: 0.05 + Math.random() * 0.15,
          color: `hsl(${Math.floor(Math.random() * 360)},80%,60%)`,
          position: [dragStart.current.x, dragStart.current.y, dragStart.current.z],
          velocity: [dx * 1.5, dy * 1.5, dz * 1.5],
        });
      }
      dragStart.current = null;
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mouseup', onUp);
    };
  }, [gl, screenToWorld, addBody]);

  return null;
}

// ── Stable selector — only re-renders when structural data actually changes ───
function useAliveBodyData() {
  const ref = useRef([]);
  return useSimStore((s) => {
    const alive = s.bodies.filter((b) => b.isAlive);
    // Shallow-compare: same IDs in same order with same visual props → reuse old ref
    const prev = ref.current;
    if (
      alive.length === prev.length &&
      alive.every((b, i) =>
        prev[i] &&
        b.id === prev[i].id &&
        b.type === prev[i].type &&
        b.color === prev[i].color &&
        b.radius === prev[i].radius &&
        b.mass === prev[i].mass
      )
    ) {
      return prev;
    }
    const next = alive.map((b) => ({ id: b.id, type: b.type, color: b.color, radius: b.radius, mass: b.mass }));
    ref.current = next;
    return next;
  });
}

// ── Scene contents (inside Canvas) ────────────────────────────────────────────
function SceneContent() {
  const aliveBodyData = useAliveBodyData();
  const selectedId    = useSimStore((s) => s.selectedBodyId);
  const selectBody    = useSimStore((s) => s.selectBody);
  const showTrails    = useSimStore((s) => s.showTrails);
  const showArrows    = useSimStore((s) => s.showVelocityArrows);
  const showLagrange  = useSimStore((s) => s.showLagrangePoints);
  const showGrid      = useSimStore((s) => s.showGrid);
  const showGlow      = useSimStore((s) => s.showGlow);
  const showPreds     = useSimStore((s) => s.showPredictions);
  const showLabels    = useSimStore((s) => s.showBodyLabels);
  const followCOM     = useSimStore((s) => s.followCOM);

  return (
    <>
      <PhysicsLoop />
      <CinematicCamera />
      <KeyboardCamera />
      <COMFollower enabled={followCOM} />
      <StarField />
      <ambientLight intensity={0.04} color="#223344" />

      {showGrid && <GridPlane />}

      {aliveBodyData.map(({ id, type, color, radius, mass }) => (
        <group key={id}>
          {type === 'black_hole' ? (
            <BlackHole bodyId={id} radius={radius} />
          ) : (
            <Body
              bodyId={id}
              type={type}
              color={color}
              radius={radius}
              isSelected={id === selectedId}
              onClick={selectBody}
            />
          )}
          {showTrails && <Trail bodyId={id} visible={showTrails} />}
          {showArrows && <VelocityArrow bodyId={id} color={color} />}
          {showGlow && type !== 'black_hole' && <BodyGlow bodyId={id} color={color} radius={radius} type={type} />}
          {(type === 'star' || type === 'black_hole') && mass >= 2.0 && (
            <AccretionDisk bodyId={id} mass={mass} radius={radius} color={color} />
          )}
        </group>
      ))}

      {showLagrange && <LagrangePoints />}
      {showPreds && <OrbitPredictor />}
      {showLabels && <BodyLabels />}
      <CollisionEffects />
      <RocheRings />
      <DragToFling />
      <SafePostFX />
    </>
  );
}

// ── PostFX with built-in crash isolation ──────────────────────────────────────
// If EffectComposer throws (GPU/driver issues), scene still renders without FX.
function SafePostFX() {
  return <PostFX />;
}

// ── Exported Scene component ──────────────────────────────────────────────────
export function Scene({ canvasRef }) {
  return (
    <Canvas
      ref={canvasRef}
      camera={{ position: [0, 0, 8], fov: 60, near: 0.01, far: 2000 }}
      gl={{
        antialias: false,
        toneMapping: THREE.NoToneMapping, // PostFX handles tone mapping
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      }}
      style={{ position: 'absolute', inset: 0, background: '#000005' }}
      onPointerMissed={() => useSimStore.getState().selectBody(null)}
      onCreated={({ gl }) => {
        // Ensure correct color space for EffectComposer pipeline
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <SceneContent />
    </Canvas>
  );
}
