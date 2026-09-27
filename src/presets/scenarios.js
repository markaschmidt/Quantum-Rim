/**
 * Preset scenarios for the N-body simulation.
 *
 * Each scenario specifies:
 *  - bodies: initial conditions (position, velocity, mass, color, type)
 *  - timeScale: default simulation speed
 *  - camera: initial camera {position, target}
 *  - collisionMode: 'elastic' | 'merge'
 *  - description: short human-readable explanatory text
 *
 * Unit system: G=1, mass in arbitrary units, positions in sim units.
 * For the Figure-8, exact Chenciner–Montgomery (2000) initial conditions.
 */

let _id = 0;
const uid = (prefix = 'b') => `${prefix}${++_id}`;

// ─────────────────────────────────────────────────────────────
// Helper: compute orbital velocity for a circular orbit
// v = sqrt(G * M_central / r)  with G=1
// ─────────────────────────────────────────────────────────────
function circOrbV(centerMass, r) {
  return Math.sqrt(centerMass / r);
}

/**
 * Helper: place a body in a 3D circular orbit around the origin.
 *
 * @param {number} centerMass - mass of the central body
 * @param {number} r - orbital radius
 * @param {number} theta - angle in the orbital plane (0–2π)
 * @param {number} inc - inclination from the XZ reference plane (radians)
 * @param {number} ascNode - longitude of ascending node (radians)
 * @returns {{ position: number[], velocity: number[] }}
 *
 * The orbit lies in a plane defined by (inc, ascNode).
 * theta=0 puts the body along the ascending node direction.
 */
export function circOrb3D(centerMass, r, theta, inc = 0, ascNode = 0) {
  const v = Math.sqrt(centerMass / r);

  // Position in the orbital plane (orbital frame: x,y)
  const px = r * Math.cos(theta);
  const py = r * Math.sin(theta);

  // Velocity perpendicular to position in orbital plane (prograde)
  const vx = -v * Math.sin(theta);
  const vy =  v * Math.cos(theta);

  // Rotation matrices:
  // 1) Rotate about X-axis by inclination (tilt the orbital plane)
  // 2) Rotate about Y-axis by ascending node (spin the plane orientation)
  const ci = Math.cos(inc), si = Math.sin(inc);
  const cn = Math.cos(ascNode), sn = Math.sin(ascNode);

  // After inclination rotation (around X): (px, py*ci, py*si)
  // After ascending node rotation (around Y):
  const pos = [
    cn * px - sn * py * si,
    py * ci,
    sn * px + cn * py * si,
  ];
  const vel = [
    cn * vx - sn * vy * si,
    vy * ci,
    sn * vx + cn * vy * si,
  ];
  return { position: pos, velocity: vel };
}

// ─────────────────────────────────────────────────────────────
// 1. FIGURE-8  (Chenciner & Montgomery 2000)
//    Three equal-mass bodies in a stable choreographic orbit
// ─────────────────────────────────────────────────────────────
const figure8 = {
  id: 'figure8',
  name: 'Figure-8 Choreography',
  description:
    'The famous Chenciner–Montgomery 3-body solution (2000). Three equal-mass bodies chase each other through a figure-8 path. Stable indefinitely under ideal conditions.',
  bodies: [
    {
      id: uid('f8'),
      name: 'Proxima',
      type: 'star',
      mass: 1,
      radius: 0.28,
      color: '#ff6b35',
      position: [-0.97000436, 0.24308753, 0],
      velocity: [0.93240737 / 2, 0.86473146 / 2, 0],
    },
    {
      id: uid('f8'),
      name: 'Centauri',
      type: 'star',
      mass: 1,
      radius: 0.28,
      color: '#4ecdc4',
      position: [0, 0, 0],
      velocity: [-0.93240737, -0.86473146, 0],
    },
    {
      id: uid('f8'),
      name: 'Solaris',
      type: 'star',
      mass: 1,
      radius: 0.28,
      color: '#ffe66d',
      position: [0.97000436, -0.24308753, 0],
      velocity: [0.93240737 / 2, 0.86473146 / 2, 0],
    },
  ],
  timeScale: 0.1,
  collisionMode: 'merge',
  camera: { position: [0, 0, 6], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 2. BINARY STAR SYSTEM
//    Two stars orbit their COM; rocky planets orbit one or both
// ─────────────────────────────────────────────────────────────
const binaryStar = {
  id: 'binaryStar',
  name: 'Binary Star + Planets',
  description:
    'A binary stellar pair with planets in inclined orbits. Inner planets orbit the secondary star with tilted orbital planes, creating a rich 3D system.',
  bodies: (() => {
    // Binary stars orbit COM in the XZ plane
    const mA = 2.0, mB = 1.0;
    const sep = 3.6;
    const rA = (mB / (mA + mB)) * sep;
    const rB = (mA / (mA + mB)) * sep;
    const vA = circOrbV(mB, rA) * Math.sqrt(rA / sep);
    const vB = circOrbV(mA, rB) * Math.sqrt(rB / sep);

    return [
      {
        id: uid('bs'), name: 'Helios-A', type: 'star', mass: mA, radius: 0.38,
        color: '#ffe88a', position: [-rA, 0, 0], velocity: [0, 0, -vA],
      },
      {
        id: uid('bs'), name: 'Helios-B', type: 'star', mass: mB, radius: 0.26,
        color: '#ff9966', position: [rB, 0, 0], velocity: [0, 0, vB],
      },
      {
        id: uid('bs'), name: 'Vulcan', type: 'rocky', mass: 0.004, radius: 0.08,
        color: '#a8d8ea',
        ...(() => {
          const o = circOrb3D(mB, 0.8, 0, 0.25, 0.5);
          return { position: [rB + o.position[0], o.position[1], o.position[2] + vB * 0], velocity: [o.velocity[0], o.velocity[1], vB + o.velocity[2]] };
        })(),
      },
      {
        id: uid('bs'), name: 'Ignis', type: 'rocky', mass: 0.003, radius: 0.07,
        color: '#e8997a',
        ...(() => {
          const o = circOrb3D(mB, 1.2, Math.PI * 0.7, 0.4, 1.2);
          return { position: [rB + o.position[0], o.position[1], o.position[2]], velocity: [o.velocity[0], o.velocity[1], vB + o.velocity[2]] };
        })(),
      },
    ];
  })(),
  timeScale: 0.3,
  collisionMode: 'merge',
  camera: { position: [4, 5, 8], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 3. CHAOS THEORY — divergent 5-body
//    Illustrates sensitivity to initial conditions
// ─────────────────────────────────────────────────────────────
const chaos = {
  id: 'chaos',
  name: 'Chaos Theory',
  description:
    'Five bodies with 3D initial conditions scattered in space. Their chaotic gravitational dance pulls them out of plane — ejections, slingshots, and collisions abound.',
  bodies: [
    { id: uid('ch'), name: 'Sigma',   type: 'star',      mass: 1.5,  radius: 0.30, color: '#ff4757', position: [-1.5,  0.8,  0.6], velocity: [ 0.4, -0.3, 0.15] },
    { id: uid('ch'), name: 'Omega',   type: 'star',      mass: 1.2,  radius: 0.26, color: '#ffa502', position: [ 1.8, -0.5, -0.8], velocity: [-0.5,  0.2, 0.3 ] },
    { id: uid('ch'), name: 'Delta',   type: 'gas_giant', mass: 0.4,  radius: 0.20, color: '#7bed9f', position: [ 0.2,  2.0,  1.2], velocity: [-0.6, -0.5, -0.25] },
    { id: uid('ch'), name: 'Epsilon', type: 'gas_giant', mass: 0.3,  radius: 0.18, color: '#70a1ff', position: [-2.2, -1.5, -0.4], velocity: [ 0.7,  0.1, 0.35] },
    { id: uid('ch'), name: 'Zeta',    type: 'rocky',     mass: 0.08, radius: 0.10, color: '#eccc68', position: [ 0.6, -1.8,  1.5], velocity: [ 0.2,  0.8, -0.4] },
  ],
  timeScale: 0.5,
  collisionMode: 'merge',
  camera: { position: [3, 5, 10], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 4. MINI SOLAR SYSTEM
//    Sun + 9 planets in circular orbits at different radii and inclinations
// ─────────────────────────────────────────────────────────────
const solarSystem = {
  id: 'solarSystem',
  name: 'Mini Solar System',
  description:
    'A full solar system analogue: a central star with 9 planets across four families — scorched inner rockies, a rusty mid-belt world, two gas giants, two ice giants, and distant frozen outposts — each in a unique 3D orbital plane.',
  bodies: (() => {
    const starMass = 10.0;
    const star = {
      id: uid('sol'), name: 'Sol', type: 'star', mass: starMass, radius: 0.46,
      color: '#fff176', position: [0, 0, 0], velocity: [0, 0, 0],
    };

    // Planets: [name, type, mass, color, orbRadius, theta, inclination, ascNode]
    // Modelled after the real solar system families:
    //   0.8 Cinder   — Mercury-like:  tiny, hot, high inclination
    //   1.4 Vela     — Venus-like:    slow retrograde feel, thick cloud color
    //   2.2 Terra    — Earth-like:    blue, low inclination
    //   3.2 Rust     — Mars-like:     red, slightly inclined
    //   5.5 Jove     — Jupiter-like:  massive gas giant
    //   8.5 Ringed   — Saturn-like:   pale gold gas giant
    //  12.0 Glacius  — Uranus-like:   icy blue gas giant, high inclination
    //  16.5 Nereus   — Neptune-like:  deep navy blue, very inclined
    //  22.0 Fringe   — Pluto/KBO:     tiny icy rocky, eccentric inclination
    const planets = [
      //  name       type         mass    color      r     theta  inc    asc
      ['Cinder',  'rocky',     0.001, '#e8956d',  0.8,  0.00, 0.30, 0.00],
      ['Vela',    'rocky',     0.003, '#e8c56a',  1.4,  0.80, 0.06, 0.50],
      ['Terra',   'rocky',     0.004, '#5eb8ff',  2.2,  1.80, 0.05, 1.10],
      ['Rust',    'rocky',     0.002, '#c1440e',  3.2,  3.00, 0.09, 1.90],
      ['Jove',    'gas_giant', 0.12,  '#c8a24b',  5.5,  0.50, 0.07, 2.60],
      ['Ringed',  'gas_giant', 0.07,  '#e8d5a3',  8.5,  2.10, 0.12, 0.80],
      ['Glacius', 'gas_giant', 0.04,  '#8ec5fc', 12.0,  4.20, 0.22, 3.50],
      ['Nereus',  'gas_giant', 0.04,  '#3b7dd8', 16.5,  5.50, 0.28, 2.10],
      ['Fringe',  'rocky',     0.001, '#c5c8d4', 22.0,  1.20, 0.42, 4.80],
    ];

    return [star, ...planets.map(([name, type, mass, color, r, theta, inc, asc]) => {
      const o = circOrb3D(starMass, r, theta, inc, asc);
      const radius =
        type === 'gas_giant'
          ? Math.max(0.10, Math.cbrt(mass) * 0.55)
          : Math.max(0.04, Math.cbrt(mass) * 0.60);
      return {
        id: uid('sol'), name, type, mass, radius, color,
        position: o.position, velocity: o.velocity,
      };
    })];
  })(),
  timeScale: 1.2,
  collisionMode: 'merge',
  camera: { position: [5, 14, 18], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 5. DOUBLE BINARY  (hierarchical 4-body)
// ─────────────────────────────────────────────────────────────
const doubleBinary = {
  id: 'doubleBinary',
  name: 'Double Binary',
  description:
    'Two binary pairs orbit each other at a large separation — a hierarchical quadruple system. Each inner pair orbits in a different plane, creating stunning 3D motion.',
  bodies: [
    { id: uid('db'), name: 'Aa', type: 'star', mass: 1.0, radius: 0.24, color: '#ff6b6b', position: [-3.0,  0.3,  0.2], velocity: [ 0.05,  circOrbV(1.0, 0.4) * 0.7, circOrbV(1.0, 0.4) * 0.5] },
    { id: uid('db'), name: 'Ab', type: 'star', mass: 1.0, radius: 0.24, color: '#ff9ff3', position: [-3.0, -0.3, -0.2], velocity: [-0.05, -circOrbV(1.0, 0.4) * 0.7, -circOrbV(1.0, 0.4) * 0.5] },
    { id: uid('db'), name: 'Ba', type: 'star', mass: 0.9, radius: 0.22, color: '#48dbfb', position: [ 3.0,  0.0,  0.35], velocity: [ 0.0,  circOrbV(0.9, 0.4) * 0.85, -circOrbV(0.9, 0.4) * 0.35] },
    { id: uid('db'), name: 'Bb', type: 'star', mass: 0.9, radius: 0.22, color: '#1dd1a1', position: [ 3.0,  0.0, -0.35], velocity: [ 0.0, -circOrbV(0.9, 0.4) * 0.85,  circOrbV(0.9, 0.4) * 0.35] },
  ],
  timeScale: 0.2,
  collisionMode: 'merge',
  camera: { position: [4, 6, 10], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 6. FIGURE-8 VARIANT: 3-D Choreography (bodies start at z offset)
// ─────────────────────────────────────────────────────────────
const figure8_3d = {
  id: 'figure8_3d',
  name: 'Inclined Figure-8',
  description:
    'The Figure-8 solution rotated 30° out of the ecliptic plane, creating a spectacular 3D choreography when viewed from an angle.',
  bodies: (() => {
    const angle = Math.PI / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = ([x, y, z]) => [x, y * cos - z * sin, y * sin + z * cos];
    const rotV = ([vx, vy, vz]) => [vx, vy * cos - vz * sin, vy * sin + vz * cos];

    return [
      {
        id: uid('f3'),
        name: 'Alpha',
        type: 'star',
        mass: 1,
        radius: 0.26,
        color: '#fd79a8',
        position: rot([-0.97000436, 0.24308753, 0]),
        velocity: rotV([0.93240737 / 2, 0.86473146 / 2, 0]),
      },
      {
        id: uid('f3'),
        name: 'Beta',
        type: 'star',
        mass: 1,
        radius: 0.26,
        color: '#74b9ff',
        position: rot([0, 0, 0]),
        velocity: rotV([-0.93240737, -0.86473146, 0]),
      },
      {
        id: uid('f3'),
        name: 'Gamma',
        type: 'star',
        mass: 1,
        radius: 0.26,
        color: '#55efc4',
        position: rot([0.97000436, -0.24308753, 0]),
        velocity: rotV([0.93240737 / 2, 0.86473146 / 2, 0]),
      },
    ];
  })(),
  timeScale: 0.1,
  collisionMode: 'merge',
  camera: { position: [3, 4, 6], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 7. SLINGSHOT MANEUVER
//    A small probe flies past a massive body and is flung away
// ─────────────────────────────────────────────────────────────
const slingshot = {
  id: 'slingshot',
  name: 'Gravity Assist',
  description:
    'A lightweight "probe" fires past a gas giant at an angle, receiving a 3D gravity assist. Watch the probe bend out of the original orbital plane and gain speed.',
  bodies: [
    {
      id: uid('sg'), name: 'Jupiter', type: 'gas_giant', mass: 3.0, radius: 0.35,
      color: '#e0a86e', position: [0, 0, 0], velocity: [0.02, 0.01, 0.01],
    },
    {
      id: uid('sg'), name: 'Probe', type: 'rocky', mass: 0.0001, radius: 0.04,
      color: '#dfe6e9', position: [-6, -0.8, 1.2], velocity: [1.8, 0.05, -0.3],
    },
  ],
  timeScale: 0.5,
  collisionMode: 'elastic',
  camera: { position: [2, 4, 10], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// 8. BLACK HOLE + ACCRETION
//    Supermassive black hole with orbiting stars and planets
// ─────────────────────────────────────────────────────────────
const blackHole = {
  id: 'blackHole',
  name: 'Black Hole System',
  description:
    'A supermassive black hole with stars and planets in inclined 3D orbits. Tidal heating visibly glows on nearby bodies as they swing through periapsis.',
  bodies: (() => {
    const bhMass = 20.0;
    const bh = {
      id: uid('bh'), name: 'Sagittarius-A', type: 'black_hole', mass: bhMass,
      radius: 0.3, color: '#222222', position: [0, 0, 0], velocity: [0, 0, 0], spinRate: 3.0,
    };

    const o1 = circOrb3D(bhMass, 3.5, 0, 0.15, 0);
    const o2 = circOrb3D(bhMass, 5.0, 2.0, 0.5, 1.5);
    const o3 = circOrb3D(bhMass, 1.8, 1.0, 0.3, 2.5);
    const o4 = circOrb3D(bhMass, 7.0, 3.5, 0.25, 0.7);

    return [
      bh,
      { id: uid('bh'), name: 'Star-S2',     type: 'star',      mass: 1.0,   radius: 0.2,  color: '#6bb5ff',  ...o1, spinRate: 0.8 },
      { id: uid('bh'), name: 'Star-S14',    type: 'star',      mass: 0.6,   radius: 0.16, color: '#ff8866',  ...o2, spinRate: 0.5 },
      { id: uid('bh'), name: 'Doomed',      type: 'rocky',     mass: 0.003, radius: 0.06, color: '#ddaa55',  ...o3, spinRate: 1.2 },
      { id: uid('bh'), name: 'Outer-Drift', type: 'gas_giant', mass: 0.05,  radius: 0.14, color: '#88ccaa',  ...o4, spinRate: 0.7 },
    ];
  })(),
  timeScale: 0.5,
  collisionMode: 'merge',
  camera: { position: [4, 8, 10], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 9. ROCHE LIMIT DEMO
//    A moon spiraling into a gas giant — will be torn apart
// ─────────────────────────────────────────────────────────────
const rocheDemo = {
  id: 'rocheDemo',
  name: 'Roche Limit Demo',
  description:
    'Moons orbit a massive gas giant in inclined 3D orbits. One is on a decaying trajectory toward the Roche limit. Watch tidal heating increase as it spirals in.',
  bodies: (() => {
    const joveMass = 10.0;
    const jove = {
      id: uid('rd'), name: 'Mega-Jove', type: 'gas_giant', mass: joveMass,
      radius: 0.5, color: '#e0a86e', position: [0, 0, 0], velocity: [0, 0, 0], spinRate: 0.6,
    };

    const o1 = circOrb3D(joveMass, 2.5, 0.5, 0.2, 0.3);
    // Slightly sub-orbital for inward spiral
    o1.velocity = o1.velocity.map(v => v * 0.85);
    o1.velocity[0] += 0.08;

    const o2 = circOrb3D(joveMass, 4.0, 2.0, 0.35, 1.8);
    const o3 = circOrb3D(joveMass, 6.0, 4.5, 0.15, 3.5);

    return [
      jove,
      { id: uid('rd'), name: 'Doomed Moon',    type: 'rocky', mass: 0.005, radius: 0.06, color: '#c8c8c8', ...o1, spinRate: 2.0 },
      { id: uid('rd'), name: 'Shepherd Moon',   type: 'rocky', mass: 0.002, radius: 0.04, color: '#aabbcc', ...o2, spinRate: 1.5 },
      { id: uid('rd'), name: 'Outer Moon',      type: 'rocky', mass: 0.003, radius: 0.05, color: '#bbddee', ...o3, spinRate: 0.8 },
    ];
  })(),
  timeScale: 0.8,
  collisionMode: 'merge',
  camera: { position: [3, 5, 8], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 10. TROJAN ASTEROIDS — L4/L5 population
// ─────────────────────────────────────────────────────────────
const trojanAsteroids = {
  id: 'trojanAsteroids',
  name: 'Trojan Asteroids',
  description:
    'A star-planet system with asteroid clusters at the L4 and L5 Lagrange points. The planet and trojans orbit at a slight inclination, with individual asteroids scattered in 3D around each Lagrange point.',
  bodies: (() => {
    const starMass = 8.0;
    const planetR = 4.0;
    const planetInc = 0.08; // slight inclination
    const planetAsc = 0;

    const planetOrb = circOrb3D(starMass, planetR, 0, planetInc, planetAsc);
    
    const bodies = [
      {
        id: uid('tr'), name: 'Sol', type: 'star', mass: starMass, radius: 0.4,
        color: '#fff176', position: [0, 0, 0], velocity: [0, 0, 0], spinRate: 0.1,
      },
      {
        id: uid('tr'), name: 'Jupiter', type: 'gas_giant', mass: 0.1, radius: 0.22,
        color: '#d4a05a', ...planetOrb, spinRate: 1.5,
      },
    ];

    // L4 trojans (60° ahead of planet in its orbit)
    for (let i = 0; i < 5; i++) {
      const jitter = (Math.random() - 0.5) * 0.25;
      const rJitter = planetR + (Math.random() - 0.5) * 0.6;
      const incJitter = planetInc + (Math.random() - 0.5) * 0.15;
      const o = circOrb3D(starMass, rJitter, Math.PI / 3 + jitter, incJitter, planetAsc + (Math.random() - 0.5) * 0.1);
      bodies.push({
        id: uid('tr'), name: `Trojan-L4-${i + 1}`, type: 'rocky',
        mass: 0.0005 + Math.random() * 0.001, radius: 0.03 + Math.random() * 0.02,
        color: '#aabb88', ...o, spinRate: 0.5 + Math.random() * 2,
      });
    }

    // L5 trojans (60° behind planet in its orbit)
    for (let i = 0; i < 5; i++) {
      const jitter = (Math.random() - 0.5) * 0.25;
      const rJitter = planetR + (Math.random() - 0.5) * 0.6;
      const incJitter = planetInc + (Math.random() - 0.5) * 0.15;
      const o = circOrb3D(starMass, rJitter, -Math.PI / 3 + jitter, incJitter, planetAsc + (Math.random() - 0.5) * 0.1);
      bodies.push({
        id: uid('tr'), name: `Trojan-L5-${i + 1}`, type: 'rocky',
        mass: 0.0005 + Math.random() * 0.001, radius: 0.03 + Math.random() * 0.02,
        color: '#88aabb', ...o, spinRate: 0.5 + Math.random() * 2,
      });
    }

    return bodies;
  })(),
  timeScale: 0.8,
  collisionMode: 'merge',
  camera: { position: [2, 10, 6], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 11. PYTHAGOREAN PROBLEM
//    Three bodies at vertices of a 3-4-5 right triangle, from rest
// ─────────────────────────────────────────────────────────────
const pythagorean = {
  id: 'pythagorean',
  name: 'Pythagorean 3-Body',
  description:
    'The classic Pythagorean problem: three bodies with masses 3, 4, 5 placed at vertices of a 3D right triangle, released from rest. Extremely chaotic — the tiny Z offsets quickly amplify into dramatic 3D trajectories.',
  bodies: [
    {
      id: uid('py'), name: 'Alpha (m=3)', type: 'star', mass: 3.0, radius: 0.30,
      color: '#ff4444', position: [1, 3, 0.3], velocity: [0, 0, 0], spinRate: 0.3,
    },
    {
      id: uid('py'), name: 'Beta (m=4)', type: 'star', mass: 4.0, radius: 0.34,
      color: '#44ff44', position: [-2, -1, -0.5], velocity: [0, 0, 0], spinRate: 0.2,
    },
    {
      id: uid('py'), name: 'Gamma (m=5)', type: 'star', mass: 5.0, radius: 0.38,
      color: '#4488ff', position: [1, -1, 0.2], velocity: [0, 0, 0], spinRate: 0.15,
    },
  ],
  timeScale: 0.3,
  collisionMode: 'elastic',
  camera: { position: [3, 5, 10], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 12. KOZAI-LIDOV EFFECT
//    An outer perturber causes inner orbit inclination oscillation
// ─────────────────────────────────────────────────────────────
const kozaiLidov = {
  id: 'kozaiLidov',
  name: 'Kozai-Lidov Effect',
  description:
    'A distant massive perturber on a highly inclined orbit exchanges inclination and eccentricity with an inner planet. The inner orbit tilts and stretches dramatically over time — a beautiful 3D resonance.',
  bodies: (() => {
    const starMass = 5.0;
    const innerOrb = circOrb3D(starMass, 2.0, 0, 0.1, 0);
    // Perturber on a very inclined orbit (70°)
    const outerOrb = circOrb3D(starMass + 2.0, 8.0, 1.0, 1.22, 0.5);

    return [
      {
        id: uid('kl'), name: 'Central Star', type: 'star', mass: starMass, radius: 0.35,
        color: '#ffe88a', position: [0, 0, 0], velocity: [0, 0, 0], spinRate: 0.2,
      },
      {
        id: uid('kl'), name: 'Inner Planet', type: 'gas_giant', mass: 0.05, radius: 0.15,
        color: '#6bb5ff', ...innerOrb, spinRate: 1.0,
      },
      {
        id: uid('kl'), name: 'Outer Perturber', type: 'star', mass: 2.0, radius: 0.25,
        color: '#ff7777', ...outerOrb, spinRate: 0.4,
      },
    ];
  })(),
  timeScale: 0.5,
  collisionMode: 'merge',
  camera: { position: [5, 8, 10], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 13. PROTOPLANETARY DISK — planetary formation
// ─────────────────────────────────────────────────────────────
const protoDisk = {
  id: 'protoDisk',
  name: 'Protoplanetary Disk',
  description:
    'A young star surrounded by a 3D disk of planetesimals at various inclinations. Inner bodies orbit more tightly while outer bodies have wilder inclinations. Mergers build planets over time.',
  bodies: (() => {
    const starMass = 6.0;
    const bodies = [
      {
        id: uid('pd'), name: 'Proto-Star', type: 'star', mass: starMass, radius: 0.38,
        color: '#ffcc44', position: [0, 0, 0], velocity: [0, 0, 0], spinRate: 0.2,
      },
    ];

    const colors = ['#c8856a', '#a8d8ea', '#b8b8d1', '#e8997a', '#88cc88', '#ddaa55', '#cc88aa'];

    for (let i = 0; i < 15; i++) {
      const r = 1.5 + Math.random() * 7.0;
      const theta = Math.random() * Math.PI * 2;
      // Inclination: inner bodies are more coplanar, outer ones more scattered
      const inc = (Math.random() * 0.12) + (r / 8.5) * Math.random() * 0.25;
      const ascNode = Math.random() * Math.PI * 2;
      const mass = 0.001 + Math.random() * 0.02;
      const type = mass > 0.01 ? 'gas_giant' : 'rocky';

      const o = circOrb3D(starMass, r, theta, inc, ascNode);
      // Add slight velocity perturbation for realism
      o.velocity[0] *= (0.9 + Math.random() * 0.2);
      o.velocity[1] *= (0.9 + Math.random() * 0.2);
      o.velocity[2] *= (0.9 + Math.random() * 0.2);

      bodies.push({
        id: uid('pd'), name: `Proto-${i + 1}`, type, mass,
        radius: undefined, color: colors[i % colors.length],
        ...o, spinRate: 0.5 + Math.random() * 3,
      });
    }
    return bodies;
  })(),
  timeScale: 1.0,
  collisionMode: 'merge',
  camera: { position: [4, 12, 8], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 14. NEUTRON STAR BINARY
//    Two ultra-dense stars in a tight inspiral
// ─────────────────────────────────────────────────────────────
const neutronBinary = {
  id: 'neutronBinary',
  name: 'Neutron Star Inspiral',
  description:
    'Two hyper-dense neutron stars in an inclined ultra-tight orbit. Their rapid spinning creates oblate bulges. The orbital plane precesses slowly in 3D.',
  bodies: (() => {
    // Place in inclined orbits around each other
    const m1 = 3.0, m2 = 2.8;
    const sep = 0.8;
    const r1 = (m2 / (m1 + m2)) * sep;
    const r2 = (m1 / (m1 + m2)) * sep;
    const inc = 0.4; // significant inclination

    const o1 = circOrb3D(m2, r1, 0, inc, 0);
    const o2 = circOrb3D(m1, r2, Math.PI, inc, 0);

    return [
      {
        id: uid('ns'), name: 'Pulsar-A', type: 'star', mass: m1, radius: 0.12,
        color: '#88bbff', position: o1.position, velocity: o1.velocity, spinRate: 8.0,
      },
      {
        id: uid('ns'), name: 'Pulsar-B', type: 'star', mass: m2, radius: 0.11,
        color: '#aaccff', position: o2.position, velocity: o2.velocity, spinRate: 10.0,
      },
    ];
  })(),
  timeScale: 0.05,
  collisionMode: 'merge',
  camera: { position: [1, 2, 3], target: [0, 0, 0] },
};

// ─────────────────────────────────────────────────────────────
// 15. HIERARCHICAL TRIPLE — star + close binary
// ─────────────────────────────────────────────────────────────
const hierarchicalTriple = {
  id: 'hierarchicalTriple',
  name: 'Hierarchical Triple',
  description:
    'A tight binary pair in one orbital plane, orbited by a distant third star at a different inclination, plus a circumbinary planet. All orbits are 3D — the outer orbit precesses over time.',
  bodies: (() => {
    const mA = 1.5, mB = 1.2;
    const innerSep = 0.6;
    const rA = (mB / (mA + mB)) * innerSep;
    const rB = (mA / (mA + mB)) * innerSep;
    const innerInc = 0.15;

    const oA = circOrb3D(mB, rA, 0, innerInc, 0);
    const oB = circOrb3D(mA, rB, Math.PI, innerInc, 0);

    // Outer star on a different inclination
    const totalInner = mA + mB;
    const outerOrb = circOrb3D(totalInner + 2.0, 6.0, 0.5, 0.6, 1.0);
    // Circumbinary planet
    const circBinOrb = circOrb3D(totalInner, 2.5, 2.0, 0.25, 0.5);

    return [
      {
        id: uid('ht'), name: 'Inner-A', type: 'star', mass: mA, radius: 0.24,
        color: '#ffaa66', ...oA, spinRate: 0.5,
      },
      {
        id: uid('ht'), name: 'Inner-B', type: 'star', mass: mB, radius: 0.22,
        color: '#66aaff', ...oB, spinRate: 0.6,
      },
      {
        id: uid('ht'), name: 'Outer Star', type: 'star', mass: 2.0, radius: 0.28,
        color: '#ff6688', ...outerOrb, spinRate: 0.3,
      },
      {
        id: uid('ht'), name: 'Circumbinary', type: 'rocky', mass: 0.005, radius: 0.07,
        color: '#88ddaa', ...circBinOrb, spinRate: 1.5,
      },
    ];
  })(),
  timeScale: 0.2,
  collisionMode: 'merge',
  camera: { position: [4, 6, 12], target: [0, 0, 0] },
};

export const SCENARIOS = {
  figure8,
  binaryStar,
  chaos,
  solarSystem,
  doubleBinary,
  figure8_3d,
  slingshot,
  blackHole,
  rocheDemo,
  trojanAsteroids,
  pythagorean,
  kozaiLidov,
  protoDisk,
  neutronBinary,
  hierarchicalTriple,
};

export const SCENARIO_LIST = Object.values(SCENARIOS);

/** Return a fresh deep-copy of a scenario (prevents mutation of originals) */
export function getScenario(id) {
  const s = SCENARIOS[id];
  if (!s) return null;
  return {
    ...s,
    bodies: s.bodies.map((b) => ({
      ...b,
      position: [...b.position],
      velocity: [...b.velocity],
      trail: [],
      isAlive: true,
      mergedInto: null,
    })),
  };
}
