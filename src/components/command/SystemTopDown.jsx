import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { localPlanetTexture } from '../../game/planetTextures.js';
import { planetVisualClass, planetVisualProperties } from '../../game/planetVisual.js';
import { strategicSystemToSimBodies } from '../../game/systemForge.js';

function FrameCamera({ distance }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0, distance, distance * 0.015);
    camera.near = Math.max(0.01, distance / 200);
    camera.far = distance * 8;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, distance]);
  return null;
}

function surfaceUrl(body) {
  return body.textureUrl || localPlanetTexture(body.textureSource) || '';
}

function paintPlanetCanvas(planet) {
  const props = planetVisualProperties(planet);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const kind = planetVisualClass(planet);
  context.fillStyle = props['--planet-color'];
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (kind === 'gas') {
    for (let band = 0; band < 8; band += 1) {
      context.fillStyle = band % 2 ? props['--planet-dark'] : props['--planet-light'];
      context.fillRect(0, band * 32, canvas.width, 16);
    }
  } else {
    const blobs = [
      [120, 90, 90, 48, props['--planet-ocean']],
      [280, 140, 110, 54, props['--planet-land']],
      [360, 70, 70, 36, props['--planet-ocean']],
      [70, 170, 80, 30, props['--planet-dark']],
      [220, 50, 60, 28, props['--planet-light']],
    ];
    for (const [x, y, rx, ry, color] of blobs) {
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
      context.fill();
    }
    if (kind === 'ice') {
      context.fillStyle = 'rgba(231, 250, 255, 0.55)';
      context.fillRect(0, 0, canvas.width, 28);
      context.fillRect(0, canvas.height - 28, canvas.width, 28);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function rotateOffset(offset, seconds) {
  const radius = Math.hypot(offset[0], offset[2]);
  if (radius < 0.02) return offset;
  const omega = ((Math.PI * 2) / 12) / Math.sqrt(Math.max(radius, 0.4));
  const angle = omega * seconds;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    offset[0] * cos - offset[2] * sin,
    offset[1],
    offset[0] * sin + offset[2] * cos,
  ];
}

function surveyFrame(bodies) {
  const orbits = bodies
    .filter((body) => body.type !== 'star' && body.type !== 'moon')
    .map((body) => Math.hypot(body.position[0], body.position[2]))
    .filter((radius) => radius > 0.02)
    .sort((left, right) => left - right);
  const reach = Math.max(0.8, ...bodies.map((body) => Math.hypot(body.position[0], body.position[2])));
  let gap = reach;
  for (let index = 1; index < orbits.length; index += 1) {
    gap = Math.min(gap, orbits[index] - orbits[index - 1]);
  }
  if (orbits[0]) gap = Math.min(gap, orbits[0] * 0.9);
  const planet = Math.min(reach * 0.09, Math.max(reach * 0.035, gap * 0.3));
  return {
    reach,
    distance: reach * 3.42,
    star: Math.min(planet * 1.15, (orbits[0] || reach) * 0.4),
    planet,
    moon: planet * 0.55,
  };
}

function OrbitingSystem({ bodies, planets, frame }) {
  const motion = useRef(null);
  const meshes = useRef(new Map());
  if (!motion.current) {
    const star = bodies.find((body) => body.type === 'star');
    motion.current = bodies.map((body) => {
      const parent = body.parentId ? bodies.find((item) => item.id === body.parentId) : star;
      const origin = parent?.position || [0, 0, 0];
      return {
        id: body.id,
        type: body.type,
        parentId: body.parentId || (body.type === 'star' ? null : star?.id),
        offset: body.position.map((value, axis) => value - (origin[axis] || 0)),
        spin: body.type === 'star' ? 0.15 : 0.35,
      };
    });
  }

  useFrame((_, delta) => {
    const step = Math.min(0.05, delta);
    const placed = new Map();
    const star = motion.current.find((body) => body.type === 'star');
    if (star) placed.set(star.id, [0, 0, 0]);
    for (const body of motion.current) {
      if (body.type === 'star' || body.type === 'moon') continue;
      body.offset = rotateOffset(body.offset, step);
      placed.set(body.id, [...body.offset]);
    }
    for (const body of motion.current) {
      if (body.type !== 'moon') continue;
      const parent = placed.get(body.parentId) || [0, 0, 0];
      body.offset = rotateOffset(body.offset, step * 8);
      placed.set(body.id, [
        parent[0] + body.offset[0],
        parent[1] + body.offset[1],
        parent[2] + body.offset[2],
      ]);
    }
    for (const body of motion.current) {
      const mesh = meshes.current.get(body.id);
      const position = placed.get(body.id);
      if (!mesh || !position) continue;
      mesh.position.set(position[0], position[1], position[2]);
      mesh.rotation.y += step * body.spin;
    }
  });

  return (
    <>
      <color attach="background" args={['#050814']} />
      <ambientLight intensity={0.55} />
      <pointLight position={[0, frame.reach * 0.2, 0]} intensity={28} distance={frame.reach * 8} />
      <FrameCamera distance={frame.distance} />
      <gridHelper args={[frame.reach * 2.15, 8, '#163049', '#102033']} position={[0, -frame.reach * 0.04, 0]} />
      {bodies.map((body) => {
        const orbit = Math.hypot(body.position[0], body.position[2]);
        const visual = body.type === 'star'
          ? frame.star
          : body.type === 'moon'
            ? frame.moon
            : frame.planet;
        const band = Math.max(orbit * 0.018, frame.planet * 0.12);
        return (
          <group key={body.id}>
            {body.type !== 'star' && body.type !== 'moon' && orbit > 0.05 && (
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[Math.max(orbit - band, orbit * 0.86), orbit, 128]} />
                <meshBasicMaterial color="#3d5874" side={THREE.DoubleSide} transparent opacity={0.7} />
              </mesh>
            )}
            <SurveySphere
              body={body}
              planet={planets.get(body.id)}
              radius={visual}
              register={(mesh) => {
                if (mesh) meshes.current.set(body.id, mesh);
                else meshes.current.delete(body.id);
              }}
            />
          </group>
        );
      })}
    </>
  );
}

function SurveySphere({ body, planet, radius, register }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: body.type === 'star' ? (body.color || '#fff4ea') : '#ffffff',
    emissive: body.type === 'star' ? (body.color || '#fff4ea') : '#000000',
    emissiveIntensity: body.type === 'star' ? 1.4 : 0,
    roughness: body.type === 'star' ? 0.45 : 0.78,
    metalness: 0.04,
  }), [body.color, body.type]);

  useEffect(() => () => {
    material.map?.dispose();
    material.dispose();
  }, [material]);

  useEffect(() => {
    if (body.type === 'star') return undefined;
    const painted = planet ? paintPlanetCanvas(planet) : null;
    if (painted) {
      material.map = painted;
      material.needsUpdate = true;
    }
    const url = surfaceUrl(body);
    if (!url) return () => painted?.dispose();
    let active = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, (texture) => {
      if (!active) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      painted?.dispose();
      material.map = texture;
      material.color.set('#ffffff');
      material.needsUpdate = true;
    });
    return () => {
      active = false;
    };
  }, [body, material, planet]);

  return (
    <mesh
      ref={register}
      position={body.position}
    >
      <sphereGeometry args={[radius, 48, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export function SystemTopDown({ system }) {
  const bodies = useMemo(() => strategicSystemToSimBodies(system), [system]);
  const planets = useMemo(() => new Map((system.planets || []).map((planet) => [planet.id, planet])), [system]);
  const frame = useMemo(() => surveyFrame(bodies), [bodies]);
  return (
    <div className="system-overview" aria-label={`${system.name} from above`}>
      <Canvas
        camera={{ position: [0, frame.distance, frame.distance * 0.015], fov: 36 }}
        gl={{ antialias: true, alpha: false }}
      >
        <OrbitingSystem key={system.id} bodies={bodies} planets={planets} frame={frame} />
      </Canvas>
    </div>
  );
}
