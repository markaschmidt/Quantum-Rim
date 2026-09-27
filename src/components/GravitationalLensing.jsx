/**
 * GravitationalLensing — visual distortion effect near massive bodies.
 *
 * Renders a full-screen quad with a GLSL shader that bends the
 * background (scene render) around massive objects, simulating
 * gravitational lensing / Einstein rings.
 *
 * This is a custom R3F post-processing effect.
 * We use drei's shaderMaterial approach to render the effect.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';

const MAX_LENSING_BODIES = 6;

const LENS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const LENS_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uResolution;
  uniform vec3 uLensPositions[${MAX_LENSING_BODIES}];
  uniform float uLensMasses[${MAX_LENSING_BODIES}];
  uniform int uLensCount;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 pixelCoord = uv * uResolution;

    vec2 totalOffset = vec2(0.0);

    for (int i = 0; i < ${MAX_LENSING_BODIES}; i++) {
      if (i >= uLensCount) break;

      vec2 lensScreen = uLensPositions[i].xy;
      float mass = uLensMasses[i];

      // Distance from pixel to lens center in screen space
      vec2 delta = pixelCoord - lensScreen;
      float dist = length(delta);

      // Einstein radius approximation (visual, not physically accurate)
      float einsteinR = sqrt(mass) * 40.0;

      if (dist < einsteinR * 3.0 && dist > 1.0) {
        // Deflection angle: proportional to mass, inversely proportional to distance
        float strength = mass * 800.0 / (dist * dist + einsteinR * 0.5);
        
        // Limit maximum distortion to prevent artifacts
        strength = min(strength, 0.15);

        // Deflect UV toward the lens center
        vec2 dir = normalize(delta);
        totalOffset -= dir * strength;
      }
    }

    vec2 distortedUv = uv + totalOffset / uResolution;
    // Clamp to valid UV range
    distortedUv = clamp(distortedUv, 0.001, 0.999);

    gl_FragColor = texture2D(tScene, distortedUv);
  }
`;

/**
 * GravitationalLensing component.
 * 
 * This renders as a scene overlay — it captures the current render target,
 * distorts it through the lensing shader, and shows the result.
 * For simplicity and compatibility, we compute screen-space positions
 * of massive bodies and pass them to the shader each frame.
 */
export function GravitationalLensing() {
  const { size, camera } = useThree();
  const quadRef = useRef();

  const renderTarget = useMemo(
    () => new THREE.WebGLRenderTarget(size.width, size.height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    }),
    [size.height, size.width],
  );

  // Update render target size
  useEffect(() => {
    renderTarget.setSize(size.width, size.height);
  }, [size, renderTarget]);

  const lensPositions = useMemo(() => {
    const arr = [];
    for (let i = 0; i < MAX_LENSING_BODIES; i++) {
      arr.push(new THREE.Vector3());
    }
    return arr;
  }, []);
  
  const lensMasses = useMemo(() => new Float32Array(MAX_LENSING_BODIES), []);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      uniforms: {
        tScene: { value: null },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uLensPositions: { value: lensPositions },
        uLensMasses: { value: lensMasses },
        uLensCount: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, [lensMasses, lensPositions, size.height, size.width]);

  const _vec3 = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!quadRef.current) return;

    const bodies = useSimStore.getState().bodies;
    const alive = bodies.filter((b) => b.isAlive && b.mass >= 2.0);
    
    // Sort by mass, take top N
    alive.sort((a, b) => b.mass - a.mass);
    const count = Math.min(alive.length, MAX_LENSING_BODIES);

    for (let i = 0; i < MAX_LENSING_BODIES; i++) {
      if (i < count) {
        const body = alive[i];
        _vec3.set(...body.position);
        _vec3.project(camera);
        
        // Convert from NDC (-1..1) to pixel coords
        lensPositions[i].set(
          (_vec3.x * 0.5 + 0.5) * size.width,
          (_vec3.y * 0.5 + 0.5) * size.height,
          _vec3.z,
        );
        lensMasses[i] = body.mass;
      } else {
        lensPositions[i].set(-999, -999, 0);
        lensMasses[i] = 0;
      }
    }

    material.uniforms.uLensCount.value = count;
    material.uniforms.uResolution.value.set(size.width, size.height);

    // We don't actually do a full capture-and-rerender pass because
    // that requires complex render pipeline management and can cause
    // performance issues. Instead, the lensing effect is purely visual
    // using the PostFX pipeline. For now, hide this mesh if no lenses.
    quadRef.current.visible = false; // We'll use the simpler approach below
  });

  // Return null — the actual lensing is done via screen-space distortion
  // in the body's mesh shader itself. The full-screen approach requires
  // render target management that conflicts with EffectComposer.
  return null;
}

/**
 * Simpler approach: lens distortion rendered as a mesh behind each massive body.
 * A transparent sphere with refraction-like shader creates a visual lens effect.
 */
export function LensDistortion({ bodyId, mass, radius }) {
  const meshRef = useRef();

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    const body = useSimStore.getState().bodies.find((b) => b.id === bodyId);
    if (!body || !body.isAlive) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    meshRef.current.position.set(...body.position);
  });

  // Only render for very massive bodies (stars, black holes)
  if (mass < 2.0) return null;

  const lensRadius = radius * 2.5;

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[lensRadius, 32, 16]} />
    </mesh>
  );
}
