import { useState } from 'react';

import { alertPlanet, planSystemOrder, republicRecord, SYSTEM_ORDERS } from '../../game/systemOrders.js';
import { useSimStore } from '../../store/useSimStore.js';
import { useStrategicStore, selectSelectedSystem } from '../../store/useStrategicStore.js';

const GROUPS = ['Formation', 'Celestial', 'Republic'];

export function SystemOrdersMenu() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const system = useStrategicStore(selectSelectedSystem);
  const selectedPlanetId = useStrategicStore((state) => state.selectedPlanetId);
  const createCrisis = useStrategicStore((state) => state.createCrisis);
  const admitWorld = useStrategicStore((state) => state.admitWorld);
  const reviseWorld = useStrategicStore((state) => state.reviseWorld);
  const selectedBodyId = useSimStore((state) => state.selectedBodyId);
  const systemLabel = useSimStore((state) => state.customSystemLabel);

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
    // One write, so a physics tick never sees the moon without its moved planet.
    useSimStore.setState((state) => {
      const patches = new Map((plan.patches || []).map((patch) => [patch.id, patch]));
      const kicks = new Map(plan.kicks.map((kick) => [kick.id, kick.delta]));
      const next = state.bodies.map((body) => {
        const patch = patches.get(body.id);
        const delta = kicks.get(body.id);
        if (!patch && !delta) return body;
        const velocity = delta
          ? body.velocity.map((value, axis) => value + delta[axis])
          : (patch.velocity || body.velocity);
        return {
          ...(patch ? { ...body, ...patch, id: body.id } : body),
          velocity,
          ...(delta ? { kick: { band: 'graze', permanent: false, excess: delta } } : {}),
        };
      });
      const last = plan.simBodies[plan.simBodies.length - 1];
      return {
        bodies: next.concat(plan.simBodies),
        selectedBodyId: last ? last.id : state.selectedBodyId,
      };
    });
    if (plan.galaxyBody && system) {
      admitWorld(system.id, republicRecord(system.id, plan.galaxyBody, system.planets.length));
    }
    if (plan.revisions?.length && system) {
      plan.revisions.forEach((revision) => {
        const { id, ...fields } = revision;
        reviseWorld(system.id, id, fields);
      });
    }
    if (plan.eventType && system) {
      const planet = alertPlanet(system, selectedPlanetId);
      if (planet) {
        createCrisis(planet, {
          generated: { event_type: plan.eventType, cause: 'issued from the system viewer' },
          source: 'system-viewer',
        });
      }
    }
    setNotice(plan.notice);
  }

  return (
    <div className="system-orders">
      <button
        className="system-orders__toggle"
        type="button"
        aria-expanded={open}
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
