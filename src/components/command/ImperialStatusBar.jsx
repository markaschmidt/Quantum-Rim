import { useEffect, useRef, useState } from 'react';

import { formatCredits, RESOURCE_LABELS } from '../../game/resources';
import { useStrategicStore } from '../../store/useStrategicStore';
import { ImperialWorksShop } from './ImperialWorksShop';

const STORES = [
  { id: 'provisions', label: 'Provisions', keys: ['food', 'water'] },
  { id: 'energy', label: 'Energy', keys: ['plasmaCells', 'tibanna', 'coaxium'] },
  { id: 'alloys', label: 'Alloys', keys: ['durasteel', 'doonium', 'beskar'] },
  { id: 'exotic', label: 'Exotic matter', keys: ['hypermatter', 'kyber', 'cortosis'] },
];

export function ImperialStatusBar() {
  const [storesOpen, setStoresOpen] = useState(false);
  const panelRef = useRef(null);
  const treasury = useStrategicStore((state) => state.treasury);
  const activeCrises = useStrategicStore(
    (state) => state.events.filter((event) => event.status !== 'resolved').length,
  );
  const short = Object.values(treasury.commodities).filter((amount) => amount <= 0).length;

  useEffect(() => {
    if (!storesOpen) return undefined;
    function onPointerDown(event) {
      if (!panelRef.current?.contains(event.target)) setStoresOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setStoresOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [storesOpen]);

  return (
    <div className="imperial-status" ref={panelRef}>
      <div className="imperial-status__seal">QR</div>
      <div>
        <span>Imperial Treasury</span>
        <strong>{formatCredits(treasury.credits)}</strong>
      </div>
      <div className="imperial-stores">
        <button
          type="button"
          className={`imperial-stores__toggle ${storesOpen ? 'is-open' : ''}`}
          aria-expanded={storesOpen}
          data-sound={storesOpen ? 'close' : 'open'}
          onClick={() => setStoresOpen((open) => !open)}
        >
          <span>Stores</span>
          <strong>{short > 0 ? `${short} empty` : 'Stocked'}</strong>
        </button>
        {storesOpen && (
          <div className="imperial-stores__panel" role="region" aria-label="Imperial stores">
            {STORES.map((group) => (
              <section key={group.id}>
                <h3>{group.label}</h3>
                <ul>
                  {group.keys.map((key) => {
                    const amount = treasury.commodities[key] || 0;
                    return (
                      <li key={key}>
                        <span>{RESOURCE_LABELS[key] || key}</span>
                        <strong className={amount <= 0 ? 'resource-low' : ''}>{amount}</strong>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <div className="imperial-status__crises">
        <span>Active warnings</span>
        <strong>{activeCrises}</strong>
      </div>
      <ImperialWorksShop />
    </div>
  );
}
