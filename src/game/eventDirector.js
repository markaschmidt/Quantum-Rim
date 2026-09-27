import { riskForPlanet } from '../store/useStrategicStore.js';

function hashUnit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function shouldTriggerIntermittentEvent({
  turn,
  activeEventCount,
  lastCreatedTurn = 0,
  minimumCooldown = 4,
  forcedAfter = 8,
}) {
  if (turn < minimumCooldown || activeEventCount >= 3) return false;
  const elapsed = turn - lastCreatedTurn;
  if (elapsed < minimumCooldown) return false;
  if (elapsed >= forcedAfter) return true;
  const pressure = 0.34 + activeEventCount * -0.08 + (elapsed - minimumCooldown) * 0.12;
  return hashUnit(`event-director:${turn}:${lastCreatedTurn}`) < pressure;
}

export function chooseAutomaticEventTarget(galaxy, turn) {
  const candidates = Object.values(galaxy.systems).flatMap((system) => (
    system.planets.map((planet) => {
      const risk = riskForPlanet(galaxy, planet);
      const pressure = Math.max(...Object.values(risk))
        + system.routeDanger * 0.35
        + hashUnit(`${planet.id}:${turn}:director`) * 0.18;
      return { planet, system, risk, pressure };
    })
  ));
  return candidates.sort((left, right) => right.pressure - left.pressure)[0] || null;
}

export function automaticRiskProfile(galaxy, target, turn) {
  const base = riskForPlanet(galaxy, target.planet);
  const debrisPulse = 0.62 + hashUnit(`${target.system.id}:${turn}:debris`) * 0.34;
  return {
    ...base,
    asteroid_exposure: Math.max(base.route_exposure, target.system.routeDanger),
    debris_congestion: debrisPulse,
  };
}
