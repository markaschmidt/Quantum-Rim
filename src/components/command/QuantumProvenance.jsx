export function QuantumProvenance({ provenance, compact = false }) {
  if (!provenance) return null;
  const items = Array.isArray(provenance) ? provenance : [provenance];
  return (
    <div className={`quantum-provenance ${compact ? 'compact' : ''}`}>
      {items.map((item, index) => (
        <div className="quantum-provenance__item" key={`${item.engine}-${item.operation}-${index}`}>
          <span className={`quantum-provenance__mode mode-${item.mode || 'planned'}`}>
            {(item.mode || 'planned').replace('-', ' ')}
          </span>
          <span>
            <strong>{item.engine || 'Classical'}</strong> · {item.operation}
          </span>
          {!compact && item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </div>
  );
}
