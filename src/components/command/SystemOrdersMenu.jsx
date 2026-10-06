import { useState } from 'react';

import { planSystemOrder, SYSTEM_ORDERS } from '../../game/systemOrders.js';
import { useSimStore } from '../../store/useSimStore.js';
import { selectSelectedSystem, useStrategicStore } from '../../store/useStrategicStore.js';

const GROUPS = ['Formation', 'Celestial', 'Republic'];

export function SystemOrdersMenu() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const system = useStrategicStore(selectSelectedSystem);
  const selectedPlanetId = useStrategicStore((state) => state.selectedPlanetId);
  const selectedBodyId = useSimStore((state) => state.selectedBodyId);
  const systemLabel = useSimStore((state) => state.customSystemLabel);
  const applyViewerOrder = useSimStore((state) => state.applyViewerOrder);

  function issue(orderId) {
    const { bodies } = useSimStore.getState();
    const plan = planSystemOrder(orderId, {
      system,
      bodies,
      selectedBodyId: selectedBodyId || selectedPlanetId,
      systemLabel,
      stamp: `${Date.now().toString(36)}-${bodies.length}`,
    });
    if (plan.error) {
      setNotice(plan.error);
      return;
    }
    applyViewerOrder(plan);
    setNotice(plan.notice);
  }

  return (
    <div className="system-orders">
      <button
        className="system-orders__toggle"
        type="button"
        aria-expanded={open}
        data-sound={open ? 'close' : 'open'}
        onClick={() => setOpen((value) => !value)}
      >
        Celestial orders
      </button>
      {open && (
        <div className="system-orders__panel" role="menu">
          {GROUPS.map((group) => (
            <section key={group}>
              <h2 className="system-orders__group">{group}</h2>
              {SYSTEM_ORDERS.filter((order) => order.group === group).map((order) => (
                <button
                  key={order.id}
                  className="system-orders__item"
                  type="button"
                  role="menuitem"
                  onClick={() => issue(order.id)}
                >
                  <strong>{order.label}</strong>
                  <small>{order.detail}</small>
                </button>
              ))}
            </section>
          ))}
          <p className="system-orders__notice" aria-live="polite">{notice}</p>
        </div>
      )}
    </div>
  );
}
