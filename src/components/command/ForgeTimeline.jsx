import { evolutionAppearance } from '../../game/systemForge.js';

const STAGE_LABELS = {
  proto: 'Proto disk',
  accretion: 'Accretion',
  mature: 'Mature system',
};

export function ForgeTimeline({ draft, phase, onPhase }) {
  const stage = evolutionAppearance(phase);
  const maxOrbit = Math.max(1, ...draft.bodies.map((body) => body.orbitRadius || 1));
  const growth = 0.35 + phase * 0.65;

  return (
    <div className="forge-timeline">
      <div className="forge-timeline__label">
        <span>{STAGE_LABELS[stage]}</span>
        <span>{Math.round(phase * 100)}%</span>
      </div>
      <div className="forge-timeline__stage">
        <svg viewBox="0 0 100 100" role="img" aria-label={`${draft.name} at the ${STAGE_LABELS[stage]} stage`}>
          <ellipse
            cx="50"
            cy="50"
            rx="44"
            ry={16 + (1 - phase) * 14}
            fill="none"
            stroke="rgba(186, 214, 255, 0.28)"
            strokeWidth={1 + (1 - phase) * 4}
          />
          <circle cx="50" cy="50" r={3.5 + (1 - phase) * 5} fill={draft.star.color} />
          {draft.bodies.map((body) => {
            const orbit = ((body.orbitRadius || 1) / maxOrbit) * 40 * growth;
            const angle = body.theta || 0;
            const x = 50 + Math.cos(angle) * orbit;
            const y = 50 + Math.sin(angle) * orbit * 0.58;
            const radius = (body.kind === 'moon' ? 0.9 : body.type === 'gas_giant' ? 2.2 : 1.5) * (0.35 + phase * 0.75);
            return (
              <g key={body.id}>
                <ellipse cx="50" cy="50" rx={orbit} ry={orbit * 0.58} fill="none" stroke="rgba(126,178,240,0.2)" />
                <circle cx={x} cy={y} r={radius} fill={body.color} opacity={0.3 + phase * 0.7} />
              </g>
            );
          })}
        </svg>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={phase}
        aria-label="Evolution from proto disk to mature system"
        onChange={(event) => onPhase(Number(event.target.value))}
      />
    </div>
  );
}
