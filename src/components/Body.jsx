/**
 * Body — renders a single celestial body with a procedural shader material.
 *
 * Receives only stable props (id, type, color, radius) — position/velocity are
 * read imperatively from the Zustand store inside useFrame so this component
 * never re-renders on physics ticks.
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ARCHETYPE_INDEX } from '../game/worldCatalog.js';
import * as THREE from 'three';
import { useSimStore } from '../store/useSimStore';

// ─── Shared noise utilities (GLSL) ─────────────────────────────────────────────
const NOISE_GLSL = /* glsl */`
  // Classic 3D Perlin / Value noise helpers
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289v(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289v(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v -   i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j   = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_  = floor(j * ns.z);
    vec4 y_  = floor(j - 7.0 * x_);
    vec4 x   = x_  *ns.x + ns.yyyy;
    vec4 y   = y_  *ns.x + ns.yyyy;
    vec4 h   = 1.0 - abs(x) - abs(y);
    vec4 b0  = vec4( x.xy, y.xy );
    vec4 b1  = vec4( x.zw, y.zw );
    vec4 s0  = floor(b0)*2.0 + 1.0;
    vec4 s1  = floor(b1)*2.0 + 1.0;
    vec4 sh  = -step(h, vec4(0.0));
    vec4 a0  = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1  = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0  = vec3(a0.xy,h.x);
    vec3 p1  = vec3(a0.zw,h.y);
    vec3 p2  = vec3(a1.xy,h.z);
    vec3 p3  = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  float fbm(vec3 p, int octaves) {
    float val = 0.0, amp = 0.5, freq = 1.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      val  += amp * snoise(p * freq);
      freq *= 2.0;
      amp  *= 0.5;
    }
    return val;
  }
`;

// ─── STAR shader ───────────────────────────────────────────────────────────────
const starVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starFrag = /* glsl */`
  ${NOISE_GLSL}
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uTidalHeat;
  uniform float uDissolve;
  varying vec3  vNormal;
  varying vec3  vPosition;

  void main() {
    vec3 p = vPosition * 2.5 + vec3(uTime * 0.08, uTime * 0.05, uTime * 0.06);
    float n = fbm(p, 6);
    float n2 = fbm(p * 0.5 + vec3(0.5, uTime * 0.04, 0.0), 4);

    // Surface color: hot core vs cooler convection bands
    vec3 hotColor  = uColor * 1.4 + vec3(0.2, 0.1, 0.0);
    vec3 coolColor = uColor * 0.6 + vec3(0.0, 0.0, 0.1);
    vec3 col = mix(coolColor, hotColor, clamp(n * 0.5 + 0.5 + n2 * 0.3, 0.0, 1.0));

    // Limb darkening
    float limb = pow(max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 0.4);
    col *= 0.4 + 0.6 * limb;

    // Corona flares
    float flare = pow(clamp(1.0 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0);
    col += uColor * flare * 0.8 * (0.5 + 0.5 * sin(uTime * 2.1 + n * 6.28));

    // Tidal heating emissive
    col += vec3(1.0, 0.4, 0.1) * uTidalHeat * 0.3;

    // Roche dissolve — noise-based disintegration
    if (uDissolve > 0.01) {
      float dn = snoise(vPosition * 10.0) * 0.5 + 0.5;
      float threshold = uDissolve * 1.15;
      if (dn < threshold - 0.05) discard;
      if (dn < threshold + 0.05) {
        col += vec3(1.0, 0.5, 0.1) * (1.0 - (dn - threshold + 0.05) / 0.1) * 3.0;
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

const SURFACE_FINISH = /* glsl */`
  uniform float uArchetype;
  uniform float uScar;
  uniform float uHasMap;
  uniform sampler2D uMap;
  vec3 finishSurface(vec3 col, vec3 p, vec2 uv, vec3 surfaceNormal) {
    if (uHasMap > 0.5) {
      vec3 mapCol = texture2D(uMap, uv).rgb;
      col = mix(col, col * mapCol * 1.35, 0.72);
    }
    if (uArchetype > 0.5 && uArchetype < 1.5) {
      float vein = smoothstep(0.55, 0.82, fbm(p * 5.0, 3));
      col = mix(col, vec3(1.0, 0.22, 0.02), vein * 0.9);
    } else if (uArchetype > 1.5 && uArchetype < 2.5) {
      float shine = pow(max(dot(normalize(surfaceNormal), normalize(vec3(1.0, 0.4, 1.2))), 0.0), 24.0);
      col += vec3(0.45, 0.62, 0.85) * shine * 0.55;
    } else if (uArchetype > 4.5 && uArchetype < 5.5) {
      float spark = step(0.86, fbm(p * 9.0, 2));
      col += vec3(0.7, 0.85, 1.0) * spark;
    } else if (uArchetype > 6.5 && uArchetype < 7.5) {
      float storm = sin(uv.y * 28.0 + fbm(p, 2) * 2.0);
      col = mix(col, col * vec3(0.72, 0.86, 1.05), smoothstep(0.2, 0.8, storm) * 0.35);
    }
    float burn = uScar * smoothstep(0.42, 0.8, fbm(p * 7.0 + 3.0, 3));
    col = mix(col, vec3(0.16, 0.07, 0.04), clamp(burn, 0.0, 0.85));
    return col;
  }
`;

// ─── GAS GIANT shader ──────────────────────────────────────────────────────────
const gasVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gasFrag = /* glsl */`
  ${NOISE_GLSL}
  ${SURFACE_FINISH}
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uTidalHeat;
  uniform float uDissolve;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPos;

  void main() {
    float lat = vUv.y;

    // Scrolling latitude-dependent turbulence
    vec3 p = vec3(vUv.x * 4.0 + uTime * (0.04 + 0.06 * sin(lat * 9.0)), lat * 3.0, uTime * 0.02);
    float n  = fbm(p, 5);
    float n2 = fbm(p * 2.0 + vec3(7.3, 2.1, 0.0), 3);

    // Band colouring
    float band = sin(lat * 18.0 + n * 2.0) * 0.5 + 0.5;
    vec3 bandA = uColor * 1.2;
    vec3 bandB = uColor * 0.55 + vec3(0.05, 0.03, 0.0);
    vec3 col = mix(bandB, bandA, clamp(band + n2 * 0.4, 0.0, 1.0));

    // Polar vortex
    float polar = smoothstep(0.0, 0.15, abs(lat - 0.5));
    col = mix(col * 0.8, col, polar);

    // Specular highlight from "sun" direction
    vec3 lightDir = normalize(vec3(1.0, 0.5, 2.0));
    float diff = max(dot(normalize(vNormal), lightDir), 0.0);
    col *= 0.3 + 0.7 * diff;

    // Tidal heating — glows red/orange under gravitational stress
    vec3 heatColor = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.7, 0.2), uTidalHeat);
    col = mix(col, heatColor, uTidalHeat * 0.6);

    // Roche dissolve — noise-based disintegration
    if (uDissolve > 0.01) {
      float dn = snoise(vPos * 10.0) * 0.5 + 0.5;
      float threshold = uDissolve * 1.15;
      if (dn < threshold - 0.05) discard;
      if (dn < threshold + 0.05) {
        col += vec3(1.0, 0.5, 0.1) * (1.0 - (dn - threshold + 0.05) / 0.1) * 3.0;
      }
    }

    col = finishSurface(col, p, vUv, vNormal);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── ROCKY PLANET shader ───────────────────────────────────────────────────────
const rockyVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rockyFrag = /* glsl */`
  ${NOISE_GLSL}
  ${SURFACE_FINISH}
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uTidalHeat;
  uniform float uDissolve;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPos;

  void main() {
    vec3 p = vPos * 4.0;
    float n  = fbm(p,            5);
    float n2 = fbm(p * 3.0 + 4.0, 3);

    // Elevation determines land vs ocean
    float elev = n * 0.5 + 0.5 + n2 * 0.15;
    vec3 deepOcean   = vec3(0.05, 0.12, 0.35) * uColor * 0.5;
    vec3 shallowOcean= vec3(0.08, 0.28, 0.60) * uColor * 0.7;
    vec3 land        = uColor * (0.6 + elev * 0.4);
    vec3 mountain    = vec3(0.55, 0.5, 0.45) * (0.8 + elev * 0.2);
    vec3 ice         = vec3(0.92, 0.94, 1.0);

    vec3 col;
    if      (elev < 0.38) col = mix(deepOcean,   shallowOcean, elev / 0.38);
    else if (elev < 0.50) col = mix(shallowOcean, land,        (elev - 0.38) / 0.12);
    else if (elev < 0.72) col = land;
    else if (elev < 0.84) col = mix(land,         mountain,    (elev - 0.72) / 0.12);
    else                  col = mix(mountain,      ice,         (elev - 0.84) / 0.16);

    // Diffuse lighting
    vec3 lightDir = normalize(vec3(1.0, 0.5, 2.0));
    float diff = max(dot(normalize(vNormal), lightDir), 0.05);

    // Specular on ocean
    float oceanMask = step(elev, 0.50);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normalize(vNormal), halfVec), 0.0), 32.0) * oceanMask * 0.6;

    col = col * (0.1 + 0.9 * diff) + vec3(spec);

    // Clouds
    float cloud = fbm(p * 1.5 + vec3(uTime * 0.012, 0.0, uTime * 0.008), 4);
    cloud = smoothstep(0.55, 0.75, cloud * 0.5 + 0.5);
    col = mix(col, vec3(0.9, 0.92, 1.0) * diff * 0.9, cloud * 0.6);

    // Polar caps
    float lat = abs(vUv.y - 0.5) * 2.0;
    float iceCap = smoothstep(0.75, 0.90, lat);
    col = mix(col, ice * diff * 0.95, iceCap);

    // Tidal heating — rocky body glows volcanic red/orange
    vec3 lava = vec3(1.0, 0.25, 0.02);
    vec3 magma = vec3(1.0, 0.6, 0.15);
    float heatNoise = fbm(p * 2.0 + vec3(uTime * 0.05), 3) * 0.5 + 0.5;
    vec3 heatCol = mix(lava, magma, heatNoise);
    float heatMask = uTidalHeat * (0.5 + 0.5 * heatNoise);
    col = mix(col, heatCol, clamp(heatMask * 0.8, 0.0, 1.0));

    // Roche dissolve — noise-based disintegration
    if (uDissolve > 0.01) {
      float dn = snoise(vPos * 10.0) * 0.5 + 0.5;
      float threshold = uDissolve * 1.15;
      if (dn < threshold - 0.05) discard;
      if (dn < threshold + 0.05) {
        col += vec3(1.0, 0.5, 0.1) * (1.0 - (dn - threshold + 0.05) / 0.1) * 3.0;
      }
    }

    col = finishSurface(col, p, vUv, vNormal);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Component ─────────────────────────────────────────────────────────────────
function blankMap() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  return texture;
}

function surfaceUniforms() {
  return {
    uArchetype: { value: 0 },
    uScar: { value: 0 },
    uHasMap: { value: 0 },
    uMap: { value: blankMap() },
  };
}

export const Body = memo(function Body({ bodyId, type, color, radius, isSelected, onClick }) {
  const meshRef  = useRef();
  const lightRef = useRef();
  const timeRef  = useRef(0);
  const textureUrlRef = useRef(null);

  const material = useMemo(() => {
    const baseColor = new THREE.Color(color);
    if (type === 'star') {
      return new THREE.ShaderMaterial({
        vertexShader: starVert, fragmentShader: starFrag,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: baseColor },
          uTidalHeat: { value: 0.0 },
          uDissolve: { value: 0.0 },
        },
      });
    }
    if (type === 'gas_giant') {
      return new THREE.ShaderMaterial({
        vertexShader: gasVert, fragmentShader: gasFrag,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: baseColor },
          uTidalHeat: { value: 0.0 },
          uDissolve: { value: 0.0 },
          ...surfaceUniforms(),
        },
      });
    }
    return new THREE.ShaderMaterial({
      vertexShader: rockyVert, fragmentShader: rockyFrag,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: baseColor },
        uTidalHeat: { value: 0.0 },
        uDissolve: { value: 0.0 },
        ...surfaceUniforms(),
      },
    });
  }, [type, color]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;
    if (material.uniforms?.uTime) material.uniforms.uTime.value = timeRef.current;

    // Read latest body data imperatively (no re-render triggered)
    const body = useSimStore.getState().bodies.find((b) => b.id === bodyId);
    if (!body || !body.isAlive) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    meshRef.current.position.set(...body.position);
    if (material.uniforms?.uArchetype) {
      material.uniforms.uArchetype.value = ARCHETYPE_INDEX[body.archetype] || 0;
    }
    if (material.uniforms?.uScar) {
      material.uniforms.uScar.value = body.scar || 0;
    }
    if (material.uniforms?.uMap && body.textureUrl && body.textureUrl !== textureUrlRef.current) {
      textureUrlRef.current = body.textureUrl;
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(body.textureUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.uniforms.uMap.value = texture;
        material.uniforms.uHasMap.value = 1;
      });
    }

    // ── Roche dissolve animation ───────────────────────────────────────
    let dissolveScale = 1;
    if (body.isDissolving) {
      const simTime = useSimStore.getState().simTime;
      const elapsed = simTime - (body.dissolveStart ?? simTime);
      const progress = Math.min(elapsed / 2.0, 1.0);
      dissolveScale = Math.max(1 - progress * 0.6, 0.01);
      // Shake as tidal forces tear it apart
      const shake = progress * 0.2 * radius;
      meshRef.current.position.x += (Math.random() - 0.5) * shake;
      meshRef.current.position.y += (Math.random() - 0.5) * shake;
      meshRef.current.position.z += (Math.random() - 0.5) * shake;
      // Drive shader dissolve effect
      if (material.uniforms?.uDissolve) {
        material.uniforms.uDissolve.value = progress;
      }
      // Crank tidal heating during dissolve
      if (material.uniforms?.uTidalHeat) {
        material.uniforms.uTidalHeat.value = Math.min(progress * 3, 1.0);
      }
    } else if (material.uniforms?.uDissolve) {
      material.uniforms.uDissolve.value = 0;
    }

    // Per-body spin (angular velocity)
    const spin = body.spinRate ?? (type === 'star' ? 0.15 : type === 'gas_giant' ? 0.5 : 0.3);
    meshRef.current.rotation.y += delta * spin;
    meshRef.current.rotation.x += delta * spin * 0.1;

    // Oblate spheroid: faster spin → more equatorial bulge
    const oblateFactor = Math.min(Math.abs(spin) * 0.08, 0.25);
    meshRef.current.scale.set(
      (1 + oblateFactor) * dissolveScale,
      (1 - oblateFactor * 0.7) * dissolveScale,
      (1 + oblateFactor) * dissolveScale,
    );

    // Tidal heating: check distance to nearest massive body
    if (material.uniforms?.uTidalHeat) {
      const bodies = useSimStore.getState().bodies;
      let maxTidal = 0;
      for (const other of bodies) {
        if (other.id === bodyId || !other.isAlive || other.mass <= body.mass * 0.5) continue;
        const dx = other.position[0] - body.position[0];
        const dy = other.position[1] - body.position[1];
        const dz = other.position[2] - body.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Tidal force ∝ M / r^3 (differential gravity)
        const tidal = other.mass / (dist * dist * dist + 0.001);
        if (tidal > maxTidal) maxTidal = tidal;
      }
      // Smooth interpolation
      const current = material.uniforms.uTidalHeat.value;
      material.uniforms.uTidalHeat.value += (Math.min(maxTidal * 2.0, 1.0) - current) * 0.05;
    }

    // Doppler shift: if body moves toward/away from camera, shift hue
    if (material.uniforms?.uColor) {
      const baseCol = new THREE.Color(color);
      const cam = state.camera.position;
      const toCamera = [
        cam.x - body.position[0],
        cam.y - body.position[1],
        cam.z - body.position[2],
      ];
      const camDist = Math.sqrt(toCamera[0] ** 2 + toCamera[1] ** 2 + toCamera[2] ** 2);
      if (camDist > 0.01) {
        const radialV = (
          body.velocity[0] * toCamera[0] +
          body.velocity[1] * toCamera[1] +
          body.velocity[2] * toCamera[2]
        ) / camDist;
        // Positive = moving toward camera (blueshift), negative = away (redshift)
        const dopplerStrength = Math.tanh(radialV * 0.5) * 0.25;
        if (dopplerStrength > 0) {
          baseCol.lerp(new THREE.Color(0.4, 0.5, 1.0), dopplerStrength);
        } else {
          baseCol.lerp(new THREE.Color(1.0, 0.3, 0.1), -dopplerStrength);
        }
      }
      material.uniforms.uColor.value.copy(baseCol);
    }

    if (lightRef.current) lightRef.current.position.set(...body.position);
  });

  const starIntensity = type === 'star' ? Math.min(radius * 2.5, 8) : 0;

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(bodyId); }}
        onPointerOver={(event) => {
          event.stopPropagation();
          const live = useSimStore.getState().bodies.find((item) => item.id === bodyId);
          if (live?.freshUntil > Date.now()) useSimStore.getState().dismissFresh(bodyId);
        }}
      >
        <sphereGeometry args={[radius, 64, 32]} />
        <primitive object={material} attach="material" />

        {isSelected && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 1.12, radius * 1.18, 64]} />
            <meshBasicMaterial color="#00d4ff" transparent opacity={0.7} side={THREE.DoubleSide} />
          </mesh>
        )}
      </mesh>

      {type === 'star' && (
        <pointLight
          ref={lightRef}
          intensity={starIntensity}
          distance={radius * 80}
          decay={2}
          color={color}
        />
      )}
    </group>
  );
});
