import { useMemo, useState } from 'react';

function unit(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

const CHOICES = [
  ['Protect civilians', 'Lower casualties; some infrastructure will be abandoned.'],
  ['Protect infrastructure', 'Preserve production; population risk rises.'],
  ['Balanced response', 'Moderate protection across every exposed asset.'],
];

export function ActivityWorkspace({ activity, event, onCommit }) {
  const seed = useMemo(() => unit(`${event.id}:${activity.id}`), [event.id, activity.id]);
  const [primary, setPrimary] = useState(50);
  const [secondary, setSecondary] = useState(50);
  const [tertiary, setTertiary] = useState(0);
  const [selected, setSelected] = useState([]);

  const toggle = (value, maximum = 3) => setSelected((current) => (
    current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current.slice(-(maximum - 1)), value]
  ));

  let content;
  let score = 0.5;
  let metadata = {};

  if (activity.kind === 'alignment') {
    const target = 24 + seed * 58;
    const phaseDelta = Math.round(Math.abs(primary - target));
    score = clamp(1 - phaseDelta / 70) * 0.72 + clamp(1 - Math.abs(secondary - (100 - target)) / 90) * 0.28;
    content = (
      <div className="activity-workspace">
        <div className={`telemetry-feedback ${phaseDelta < 8 ? 'good' : phaseDelta < 22 ? 'warn' : 'bad'}`}>
          Field coherence: {phaseDelta < 8 ? 'locked' : phaseDelta < 22 ? 'unstable' : 'divergent'}
        </div>
        <label className="command-slider"><span>Coil phase <strong>{primary}%</strong></span><input type="range" min="0" max="100" value={primary} onChange={(e) => setPrimary(Number(e.target.value))} /></label>
        <label className="command-slider"><span>Counter-field gain <strong>{secondary}%</strong></span><input type="range" min="0" max="100" value={secondary} onChange={(e) => setSecondary(Number(e.target.value))} /></label>
      </div>
    );
  } else if (activity.kind === 'routing') {
    const routes = [
      { id: 'alpha', label: 'Alpha corridor', danger: Math.round(25 + seed * 55), capacity: 82 },
      { id: 'beta', label: 'Beta relay', danger: Math.round(12 + (1 - seed) * 42), capacity: 58 },
      { id: 'gamma', label: 'Gamma bypass', danger: Math.round(38 + seed * 36), capacity: 96 },
      { id: 'delta', label: 'Civilian lane', danger: Math.round(16 + seed * 25), capacity: 66 },
    ];
    const selectedRoutes = routes.filter((route) => selected.includes(route.id));
    score = selectedRoutes.length
      ? clamp(selectedRoutes.reduce((sum, route) => sum + (100 - route.danger) * route.capacity / 100, 0) / 125)
      : 0;
    metadata = { selectedRoutes: selectedRoutes.map((route) => route.id) };
    content = (
      <div className="activity-card-grid">
        {routes.map((route) => (
          <button type="button" key={route.id} className={selected.includes(route.id) ? 'selected' : ''} onClick={() => toggle(route.id, 2)}>
            <strong>{route.label}</strong><span>Danger {route.danger}%</span><span>Capacity {route.capacity}%</span>
          </button>
        ))}
      </div>
    );
  } else if (activity.kind === 'allocation') {
    const total = primary + secondary + tertiary;
    const budgetPenalty = total > 100 ? (total - 100) / 100 : 0;
    score = clamp((primary * 0.45 + secondary * 0.35 + tertiary * 0.2) / 72 - budgetPenalty);
    metadata = {
      resourceCost: {
        energy: Math.round(primary * 0.32),
        alloys: Math.round(secondary * 0.18),
      },
    };
    content = (
      <div className="activity-workspace">
        <div className={`telemetry-feedback ${total <= 100 ? 'good' : 'bad'}`}>Allocation budget: {total}/100</div>
        <label className="command-slider"><span>Energy <strong>{primary}</strong></span><input type="range" min="0" max="100" value={primary} onChange={(e) => setPrimary(Number(e.target.value))} /></label>
        <label className="command-slider"><span>Defense assets <strong>{secondary}</strong></span><input type="range" min="0" max="100" value={secondary} onChange={(e) => setSecondary(Number(e.target.value))} /></label>
        <label className="command-slider"><span>Reserve fleet <strong>{tertiary}</strong></span><input type="range" min="0" max="100" value={tertiary} onChange={(e) => setTertiary(Number(e.target.value))} /></label>
      </div>
    );
  } else if (activity.kind === 'investigation' || activity.kind === 'signal') {
    const evidence = [
      ['manifest', 'Manifest timestamp precedes gate clearance.'],
      ['sensor', 'Sensor signature matches the declared vessel class.'],
      ['price', 'Cargo price is within the local market band.'],
      ['access', 'Access log lists an authorized logistics officer.'],
    ];
    const answer = evidence[Math.floor(seed * evidence.length)][0];
    score = selected.includes(answer) ? 0.92 : selected.length ? 0.22 : 0;
    content = (
      <div className="activity-card-grid activity-card-grid--evidence">
        {evidence.map(([id, text]) => (
          <button type="button" key={id} className={selected.includes(id) ? 'selected' : ''} onClick={() => setSelected([id])}>
            <strong>{id}</strong><span>{text}</span>
          </button>
        ))}
      </div>
    );
  } else if (activity.kind === 'containment') {
    const districts = [
      ['habitat', 'Habitat ring', Math.round(45 + seed * 45)],
      ['reactor', 'Reactor district', Math.round(30 + (1 - seed) * 46)],
      ['transit', 'Transit spine', Math.round(36 + seed * 34)],
      ['medical', 'Medical quarter', Math.round(20 + (1 - seed) * 30)],
    ];
    const selectedDistricts = districts.filter(([id]) => selected.includes(id));
    const optimalRisk = districts.map(([, , risk]) => risk).sort((a, b) => b - a).slice(0, 2)
      .reduce((sum, risk) => sum + risk, 0);
    score = selectedDistricts.length === 2
      ? clamp(selectedDistricts.reduce((sum, [, , risk]) => sum + risk, 0) / optimalRisk)
      : selectedDistricts.length * 0.24;
    metadata = { sealedDistricts: selectedDistricts.map(([id]) => id) };
    content = (
      <div className="activity-card-grid">
        {districts.map(([id, label, breachRisk]) => (
          <button type="button" key={id} className={selected.includes(id) ? 'selected' : ''} onClick={() => toggle(id, 2)}>
            <strong>{label}</strong><span>Breach probability {breachRisk}%</span>
          </button>
        ))}
      </div>
    );
  } else if (activity.kind === 'balance') {
    const total = primary + secondary + tertiary;
    const balance = 1 - (Math.abs(primary - 36) + Math.abs(secondary - 34) + Math.abs(tertiary - 30)) / 200;
    score = clamp(balance - Math.abs(total - 100) / 100);
    content = (
      <div className="activity-workspace">
        <div className={`telemetry-feedback ${Math.abs(total - 100) <= 4 ? 'good' : 'warn'}`}>Terraforming load: {total}/100</div>
        <label className="command-slider"><span>Water cycling <strong>{primary}</strong></span><input type="range" min="0" max="100" value={primary} onChange={(e) => setPrimary(Number(e.target.value))} /></label>
        <label className="command-slider"><span>Atmosphere processing <strong>{secondary}</strong></span><input type="range" min="0" max="100" value={secondary} onChange={(e) => setSecondary(Number(e.target.value))} /></label>
        <label className="command-slider"><span>Biodiversity reserve <strong>{tertiary}</strong></span><input type="range" min="0" max="100" value={tertiary} onChange={(e) => setTertiary(Number(e.target.value))} /></label>
      </div>
    );
  } else {
    score = selected[0] === 'balanced' ? 0.78 : selected.length ? 0.62 : 0;
    metadata = { priority: selected[0] || null };
    content = (
      <div className="activity-card-grid">
        {CHOICES.map(([label, description], index) => {
          const id = index === 2 ? 'balanced' : `choice-${index}`;
          return <button type="button" key={id} className={selected.includes(id) ? 'selected' : ''} onClick={() => setSelected([id])}><strong>{label}</strong><span>{description}</span></button>;
        })}
      </div>
    );
  }

  return (
    <>
      {content}
      <div className="activity-score">Projected containment <strong>{Math.round(score * 100)}%</strong></div>
      <button className="command-button activity-commit" disabled={score <= 0} onClick={() => onCommit(score, metadata)}>
        Commit response
      </button>
    </>
  );
}
