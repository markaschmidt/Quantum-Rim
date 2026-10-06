import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

import hullDarkUrl from '../../assets/stations/hull-dark.jpg';
import hullDarkNormalUrl from '../../assets/stations/hull-dark-normal.jpg';
import hullWornUrl from '../../assets/stations/hull-worn.jpg';
import hullWornNormalUrl from '../../assets/stations/hull-worn-normal.jpg';
import hullHazardUrl from '../../assets/stations/hull-hazard.jpg';

function useHullMaps() {
  const maps = useTexture({
    dark: hullDarkUrl,
    darkNormal: hullDarkNormalUrl,
    worn: hullWornUrl,
    wornNormal: hullWornNormalUrl,
    hazard: hullHazardUrl,
  });
  useLayoutEffect(() => {
    Object.entries(maps).forEach(([key, tex]) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2.4, 2.4);
      tex.anisotropy = 8;
      if (!key.includes('Normal')) tex.colorSpace = THREE.SRGBColorSpace;
    });
  }, [maps]);
  return maps;
}

function Hull({
  maps, args, position, rotation, scale, variant = 'dark', tint = '#d7e2ec',
}) {
  const worn = variant === 'worn';
  const hazard = variant === 'hazard';
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        map={hazard ? maps.hazard : worn ? maps.worn : maps.dark}
        normalMap={worn ? maps.wornNormal : maps.darkNormal}
        color={tint}
        metalness={hazard ? 0.55 : 0.72}
        roughness={hazard ? 0.42 : worn ? 0.5 : 0.34}
        normalScale={worn ? [0.55, 0.55] : [0.85, 0.85]}
        envMapIntensity={1.2}
        onUpdate={(material) => {
          const lift = hazard ? 1.35 : worn ? 4.4 : 5.4;
          if (material.userData.lift === lift) return;
          material.color.set(tint).multiplyScalar(lift);
          material.userData.lift = lift;
        }}
      />
    </mesh>
  );
}

function Round({
  maps, args, position, rotation, variant = 'dark', tint = '#d7e2ec', geometry = 'cylinder',
}) {
  const worn = variant === 'worn';
  return (
    <mesh position={position} rotation={rotation}>
      {geometry === 'sphere' && <sphereGeometry args={args} />}
      {geometry === 'torus' && <torusGeometry args={args} />}
      {geometry === 'cone' && <coneGeometry args={args} />}
      {geometry === 'cylinder' && <cylinderGeometry args={args} />}
      <meshStandardMaterial
        map={worn ? maps.worn : maps.dark}
        normalMap={worn ? maps.wornNormal : maps.darkNormal}
        color={tint}
        metalness={0.7}
        roughness={worn ? 0.48 : 0.32}
        onUpdate={(material) => {
          const lift = 4.6;
          if (material.userData.lift === lift) return;
          material.color.set(tint).multiplyScalar(lift);
          material.userData.lift = lift;
        }}
      />
    </mesh>
  );
}

function Glow({ position, args = [0.08, 0.05, 0.02], color = '#9ad7ff', intensity = 1.4 }) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
    </mesh>
  );
}

function windows(z, y, count, span) {
  return Array.from({ length: count }, (_, index) => {
    const x = -span / 2 + (span / (count - 1 || 1)) * index;
    return <Glow key={`${z}-${index}`} position={[x, y, z]} />;
  });
}

function Mining({ maps }) {
  return (
    <group>
      <Hull maps={maps} args={[1.45, 0.22, 0.5]} position={[0, 0.28, 0]} />
      <Hull maps={maps} args={[0.7, 0.16, 0.36]} position={[-0.15, 0.46, 0]} variant="worn" />
      <Hull maps={maps} args={[0.9, 0.05, 0.52]} position={[0.1, 0.4, 0]} variant="hazard" tint="#f2c14a" />
      <Round maps={maps} args={[0.05, 0.05, 0.7, 8]} position={[-0.15, 0.85, 0]} />
      <Hull maps={maps} args={[0.7, 0.05, 0.05]} position={[0.2, 1.12, 0]} />
      <Hull maps={maps} args={[0.16, 0.14, 0.16]} position={[0.52, 0.98, 0]} variant="hazard" tint="#f2c14a" />
      <Round maps={maps} args={[0.12, 0.16, 0.18, 10]} position={[-0.72, 0.28, 0]} rotation={[0, 0, Math.PI / 2]} variant="worn" />
      <Glow position={[-0.84, 0.28, 0]} args={[0.06, 0.1, 0.1]} color="#ff9a4a" intensity={2} />
      {windows(0.26, 0.32, 5, 0.9)}
    </group>
  );
}

function Processing({ maps }) {
  return (
    <group>
      <Hull maps={maps} args={[1.15, 0.42, 0.62]} position={[0, 0.32, 0]} variant="worn" />
      <Hull maps={maps} args={[0.7, 0.22, 0.48]} position={[0.05, 0.6, 0]} />
      <Hull maps={maps} args={[1.18, 0.06, 0.66]} position={[0, 0.5, 0]} variant="hazard" tint="#f2c14a" />
      <Round maps={maps} args={[0.07, 0.09, 0.42, 8]} position={[-0.22, 0.86, 0]} />
      <Round maps={maps} args={[0.06, 0.08, 0.55, 8]} position={[0.24, 0.92, 0]} />
      <Glow position={[-0.22, 1.08, 0]} args={[0.08, 0.04, 0.08]} color="#ffb15a" intensity={2.2} />
      <Glow position={[0.24, 1.2, 0]} args={[0.07, 0.04, 0.07]} color="#ffb15a" intensity={2.2} />
      {windows(0.32, 0.34, 4, 0.7)}
    </group>
  );
}

function Extraction({ maps }) {
  const drill = useRef(null);
  useFrame((_, delta) => {
    if (drill.current) drill.current.rotation.y += delta * 2.2;
  });
  return (
    <group>
      <Round maps={maps} args={[0.62, 0.72, 0.12, 6]} position={[0, 0.16, 0]} variant="worn" />
      <Round maps={maps} args={[0.035, 0.035, 0.7, 6]} position={[-0.38, 0.42, 0]} rotation={[0, 0, 0.4]} />
      <Round maps={maps} args={[0.035, 0.035, 0.7, 6]} position={[0.38, 0.42, 0]} rotation={[0, 0, -0.4]} />
      <group ref={drill} position={[0, 0.48, 0]}>
        <Round maps={maps} args={[0.14, 0.55, 8]} position={[0, 0, 0]} rotation={[Math.PI, 0, 0]} geometry="cone" tint="#b7fff0" />
      </group>
      <Glow position={[0.42, 0.24, 0.28]} color="#7dffe0" />
      <Glow position={[-0.42, 0.24, -0.28]} color="#7dffe0" />
    </group>
  );
}

function Research({ maps }) {
  const crystal = useRef(null);
  useFrame((_, delta) => {
    if (crystal.current) crystal.current.rotation.y += delta * 0.8;
  });
  return (
    <group>
      <Round maps={maps} args={[0.42, 0.48, 0.28, 12]} position={[0, 0.28, 0]} />
      <Round maps={maps} args={[0.62, 0.04, 10, 28]} position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]} geometry="torus" />
      <mesh ref={crystal} position={[0, 0.78, 0]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#d7f6ff" emissive="#7ad7ff" emissiveIntensity={1.6} metalness={0.2} roughness={0.08} toneMapped={false} />
      </mesh>
      <Round maps={maps} args={[0.18, 0.18, 0.05, 12]} position={[0.55, 0.55, 0]} rotation={[0.5, 0, -0.4]} />
      {windows(0.4, 0.3, 3, 0.28)}
    </group>
  );
}

function Fleet({ maps }) {
  return (
    <group rotation={[0, 0.5, 0]}>
      <Hull maps={maps} args={[1.35, 0.16, 0.42]} position={[0, 0.32, 0]} tint="#e7d7b0" />
      <Round maps={maps} args={[0.16, 0.42, 4]} position={[0.78, 0.32, 0]} rotation={[0, 0, -Math.PI / 2]} geometry="cone" tint="#f0e2c0" />
      <Hull maps={maps} args={[0.28, 0.16, 0.22]} position={[-0.15, 0.46, 0]} variant="worn" tint="#efe6d2" />
      <Hull maps={maps} args={[0.55, 0.04, 0.72]} position={[-0.2, 0.32, 0]} />
      <Glow position={[-0.62, 0.32, 0.1]} args={[0.08, 0.08, 0.08]} color="#ffb15a" intensity={2.4} />
      <Glow position={[-0.62, 0.32, -0.1]} args={[0.08, 0.08, 0.08]} color="#ffb15a" intensity={2.4} />
      {windows(0.2, 0.38, 4, 0.55)}
    </group>
  );
}

function Medical({ maps }) {
  return (
    <group>
      <Round maps={maps} args={[0.28, 0.28, 0.7, 16]} position={[0, 0.36, 0]} rotation={[0, 0, Math.PI / 2]} />
      <Round maps={maps} args={[0.46, 0.03, 8, 20]} position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]} geometry="torus" />
      <Glow position={[0, 0.68, 0]} args={[0.08, 0.28, 0.04]} color="#ff5d6c" intensity={1.8} />
      <Glow position={[0, 0.68, 0]} args={[0.28, 0.08, 0.04]} color="#ff5d6c" intensity={1.8} />
      {windows(0.3, 0.36, 3, 0.4)}
    </group>
  );
}

function Port({ maps }) {
  return (
    <group>
      <Round maps={maps} args={[0.62, 0.055, 12, 32]} position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} geometry="torus" />
      <Round maps={maps} args={[0.16, 16, 16]} position={[0, 0.4, 0]} geometry="sphere" />
      <Hull maps={maps} args={[1.25, 0.04, 0.05]} position={[0, 0.4, 0]} />
      <Hull maps={maps} args={[0.05, 0.04, 1.25]} position={[0, 0.4, 0]} />
      <Hull maps={maps} args={[0.22, 0.1, 0.12]} position={[0.78, 0.4, 0]} variant="worn" />
      <Glow position={[0.78, 0.48, 0.08]} color="#9ad7ff" />
    </group>
  );
}

function Customs({ maps }) {
  return (
    <group>
      <Hull maps={maps} args={[1.25, 0.18, 0.55]} position={[0, 0.2, 0]} tint="#e6d3b0" />
      <Hull maps={maps} args={[0.08, 0.55, 0.08]} position={[-0.42, 0.52, 0]} />
      <Hull maps={maps} args={[0.08, 0.55, 0.08]} position={[0.42, 0.52, 0]} />
      <Hull maps={maps} args={[0.92, 0.08, 0.08]} position={[0, 0.78, 0]} variant="hazard" tint="#f2c14a" />
      {windows(0.29, 0.26, 4, 0.7)}
    </group>
  );
}

function Shield({ maps }) {
  return (
    <group>
      <Round maps={maps} args={[0.16, 0.22, 0.28, 8]} position={[0, 0.22, 0]} />
      <Round maps={maps} args={[0.42, 0.42, 0.06, 20]} position={[0, 0.58, 0]} rotation={[0.7, 0.2, 0]} />
      <Glow position={[0, 0.72, 0.18]} args={[0.08, 0.08, 0.04]} color="#8fd0ff" intensity={2} />
    </group>
  );
}

function Signal({ maps }) {
  const lamp = useRef(null);
  useFrame(({ clock }) => {
    if (lamp.current) lamp.current.material.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 5) * 0.8;
  });
  return (
    <group>
      <Hull maps={maps} args={[0.45, 0.1, 0.45]} position={[0, 0.12, 0]} variant="worn" />
      <Round maps={maps} args={[0.035, 0.05, 1.15, 6]} position={[0, 0.68, 0]} />
      <Round maps={maps} args={[0.16, 0.16, 0.04, 12]} position={[0.16, 0.95, 0]} rotation={[0.4, 0, -0.6]} />
      <Round maps={maps} args={[0.12, 0.12, 0.04, 12]} position={[-0.12, 0.7, 0.08]} rotation={[0.8, 0.4, 0.5]} />
      <mesh ref={lamp} position={[0, 1.28, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color="#ffe3a6" emissive="#ffb15a" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Vault({ maps }) {
  return (
    <group>
      <Hull maps={maps} args={[0.95, 0.62, 0.7]} position={[0, 0.4, 0]} variant="worn" tint="#c5ced8" />
      <Hull maps={maps} args={[1.02, 0.08, 0.76]} position={[0, 0.28, 0]} />
      <Hull maps={maps} args={[1.02, 0.08, 0.76]} position={[0, 0.55, 0]} />
      <Round maps={maps} args={[0.16, 0.035, 8, 18]} position={[0, 0.4, 0.36]} geometry="torus" />
      <Glow position={[0, 0.4, 0.38]} args={[0.06, 0.06, 0.02]} color="#f2c14a" intensity={1.6} />
    </group>
  );
}

const MODELS = {
  mining: Mining,
  processing: Processing,
  extraction: Extraction,
  research: Research,
  fleet: Fleet,
  medical: Medical,
  port: Port,
  'customs-house': Customs,
  'shield-battery': Shield,
  'signal-mast': Signal,
  'imperial-vault': Vault,
};

function Starfield() {
  const positions = useMemo(() => {
    const count = 140;
    const array = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      array[index * 3] = (Math.random() - 0.5) * 7;
      array[index * 3 + 1] = (Math.random() - 0.5) * 5;
      array[index * 3 + 2] = -1.2 - Math.random() * 3.5;
    }
    return array;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#d5e6ff" size={0.025} sizeAttenuation />
    </points>
  );
}

function StationScene({ type }) {
  const spin = useRef(null);
  const maps = useHullMaps();
  const Model = MODELS[type] || Mining;
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.35;
  });
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 5, 3]} intensity={3.2} />
      <directionalLight position={[-3, 1.5, -2]} intensity={1.3} color="#d5e6ff" />
      <Starfield />
      <group ref={spin} position={[0, -0.15, 0]}>
        <Model maps={maps} />
      </group>
    </>
  );
}

export function FacilityPreview({ type }) {
  return (
    <div className="facility-preview" aria-hidden="true">
      <Canvas camera={{ position: [2.15, 1.15, 2.25], fov: 36 }} gl={{ antialias: true }} dpr={[1, 1.5]}>
        <color attach="background" args={['#070b14']} />
        <Suspense fallback={null}>
          <StationScene type={type} />
        </Suspense>
      </Canvas>
    </div>
  );
}
