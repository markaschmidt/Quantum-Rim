/**
 * Gravitational force calculations.
 *
 * Unit system:
 *  mass   : arbitrary (1 = "solar mass equivalent")
 *  distance: simulation units
 *  G = 1.0  (tuned for visual stability — scale scenarios accordingly)
 *
 * A softening factor ε prevents singularities when bodies get very close.
 */

export const G = 1.0;
export const SOFTENING = 0.08; // ε — prevents explosive forces on close approach

/**
 * Compute the gravitational acceleration vectors for all alive bodies.
 * Returns an array of [ax, ay, az] for each body (0 for dead bodies).
 */
export function computeAccelerations(bodies) {
  const n = bodies.length;
  const accs = bodies.map(() => [0, 0, 0]);

  for (let i = 0; i < n; i++) {
    if (!bodies[i].isAlive) continue;

    for (let j = i + 1; j < n; j++) {
      if (!bodies[j].isAlive) continue;

      const dx = bodies[j].position[0] - bodies[i].position[0];
      const dy = bodies[j].position[1] - bodies[i].position[1];
      const dz = bodies[j].position[2] - bodies[i].position[2];

      const distSq = dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING;
      const dist = Math.sqrt(distSq);
      const forceMag = G / distSq; // F / (mA * mB) — acceleration per unit mass

      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      accs[i][0] += bodies[j].mass * forceMag * nx;
      accs[i][1] += bodies[j].mass * forceMag * ny;
      accs[i][2] += bodies[j].mass * forceMag * nz;

      accs[j][0] -= bodies[i].mass * forceMag * nx;
      accs[j][1] -= bodies[i].mass * forceMag * ny;
      accs[j][2] -= bodies[i].mass * forceMag * nz;
    }
  }

  return accs;
}

/**
 * Compute kinetic + potential energy of the system.
 * Returns { KE, PE, total, momentum: [px,py,pz] }
 */
export function computeEnergies(bodies) {
  let KE = 0;
  let PE = 0;
  let px = 0,
    py = 0,
    pz = 0;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.isAlive) continue;

    const [vx, vy, vz] = b.velocity;
    const v2 = vx * vx + vy * vy + vz * vz;
    KE += 0.5 * b.mass * v2;
    px += b.mass * vx;
    py += b.mass * vy;
    pz += b.mass * vz;

    for (let j = i + 1; j < bodies.length; j++) {
      const b2 = bodies[j];
      if (!b2.isAlive) continue;

      const dx = b2.position[0] - b.position[0];
      const dy = b2.position[1] - b.position[1];
      const dz = b2.position[2] - b.position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING);
      PE -= (G * b.mass * b2.mass) / dist;
    }
  }

  return { KE, PE, total: KE + PE, momentum: [px, py, pz] };
}

/**
 * Approximate Lagrange points L1–L5 for a two-body subsystem.
 * Works in full 3D — computes the orbital plane from the two body positions
 * and computes all 5 points in that plane.
 * Returns array of 5 positions [x,y,z] in world-space.
 */
export function computeLagrangePoints(bodyA, bodyB) {
  const [x1, y1, z1] = bodyA.position;
  const [x2, y2, z2] = bodyB.position;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-10) return [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]];

  // Mass ratio
  const M = bodyA.mass + bodyB.mass;
  const mu = bodyB.mass / M;

  // Hill radius approximation for L1/L2
  const rHill = dist * Math.cbrt(mu / 3);

  // Unit vector A→B
  const ux = dx / dist;
  const uy = dy / dist;
  const uz = dz / dist;

  // Build an orthonormal basis in the plane containing A, B.
  // Pick a perpendicular vector. Use cross product with a non-parallel axis.
  let px, py, pz;
  if (Math.abs(uz) < 0.9) {
    // cross(u, Z-axis) = (uy, -ux, 0) normalized
    const cx = uy, cy = -ux, cz = 0;
    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
    px = cx / cl; py = cy / cl; pz = cz / cl;
  } else {
    // cross(u, X-axis) = (0, uz, -uy) normalized
    const cx = 0, cy = uz, cz = -uy;
    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
    px = cx / cl; py = cy / cl; pz = cz / cl;
  }

  // L1: between the two bodies (closer to smaller body)
  const L1 = [x2 - rHill * ux, y2 - rHill * uy, z2 - rHill * uz];

  // L2: beyond smaller body
  const L2 = [x2 + rHill * ux, y2 + rHill * uy, z2 + rHill * uz];

  // L3: opposite side of larger body
  const l3d = dist - rHill * 0.5;
  const L3 = [x1 - l3d * ux, y1 - l3d * uy, z1 - l3d * uz];

  // L4 & L5: equilateral triangle points
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const midZ = (z1 + z2) / 2;
  const h = (Math.sqrt(3) / 2) * dist;

  const L4 = [midX + h * px, midY + h * py, midZ + h * pz];
  const L5 = [midX - h * px, midY - h * py, midZ - h * pz];

  return [L1, L2, L3, L4, L5];
}
