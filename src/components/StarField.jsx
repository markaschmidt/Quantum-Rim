/**
 * Procedural deep-space starfield.
 *
 * Renders three layers:
 *   1. Far layer  — 8000 tiny white stars  (static)
 *   2. Mid layer  — 2000 slightly larger   (very slow parallax)
 *   3. Near layer —  800 bright foreground (moderate parallax)
 *
 * Parallax: each layer's position is offset by a fraction of the
 * camera world position so it drifts slower than the scene geometry.
 *
 * Color variation: 90% white/blue-white, 8% warm yellow, 2% red.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
    // Softly clamp alpha near screen edges
    float dist = length(position.xy) / 400.0;
    vAlpha = clamp(1.0 - dist * 0.3, 0.2, 1.0);
  }
`;

const FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Circular point with soft edge
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, r) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function buildLayer(count, radius, sizeMin, sizeMax, parallaxFactor) {
  const positions = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const colors    = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Uniform distribution on sphere surface
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    sizes[i] = sizeMin + Math.random() * (sizeMax - sizeMin);

    // Color: mostly white/blue-white
    const roll = Math.random();
    if (roll < 0.10) {
      // Warm yellow-orange
      colors[i * 3]     = 1.0;
      colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
      colors[i * 3 + 2] = 0.6 + Math.random() * 0.15;
    } else if (roll < 0.13) {
      // Red / M-dwarf
      colors[i * 3]     = 1.0;
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0.2 + Math.random() * 0.1;
    } else if (roll < 0.22) {
      // Blue-white / O/B star
      colors[i * 3]     = 0.7 + Math.random() * 0.2;
      colors[i * 3 + 1] = 0.8 + Math.random() * 0.1;
      colors[i * 3 + 2] = 1.0;
    } else {
      // White / slightly blue-white
      const b = 0.88 + Math.random() * 0.12;
      colors[i * 3]     = b * (0.9 + Math.random() * 0.1);
      colors[i * 3 + 1] = b * (0.9 + Math.random() * 0.1);
      colors[i * 3 + 2] = b;
    }
  }

  return { positions, sizes, colors, parallaxFactor };
}

function StarLayer({ layerData }) {
  const { positions, sizes, colors, parallaxFactor } = layerData;
  const meshRef = useRef();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes.slice(),     1));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors.slice(),    3));
    return geo;
  }, [colors, positions, sizes]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  // Parallax: shift the whole layer to follow the camera partially
  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    meshRef.current.position.set(
      camera.position.x * parallaxFactor,
      camera.position.y * parallaxFactor,
      camera.position.z * parallaxFactor,
    );
  });

  return <points ref={meshRef} geometry={geometry} material={material} />;
}

export function StarField() {
  const layers = useMemo(
    () => [
      buildLayer(8000, 600, 0.5, 1.2, 0.0),   // far
      buildLayer(2000, 300, 0.8, 2.0, 0.02),  // mid
      buildLayer( 600, 150, 1.2, 3.0, 0.06),  // near
    ],
    [],
  );

  return (
    <>
      {layers.map((layer, i) => (
        <StarLayer key={i} layerData={layer} />
      ))}
    </>
  );
}
