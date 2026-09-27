import { useEffect, useRef } from 'react';

import { useSimStore } from '../../store/useSimStore.js';
import { useStrategicStore } from '../../store/useStrategicStore.js';

export function ImpactChronicle() {
  const seen = useRef(new Set());
  const noteImpact = useStrategicStore((state) => state.noteImpact);

  useEffect(() => useSimStore.subscribe(
    (state) => state.mergerEvents,
    (events) => {
      for (const event of events) {
        if (!event?.id || seen.current.has(event.id)) continue;
        seen.current.add(event.id);
        noteImpact(event);
      }
    },
  ), [noteImpact]);

  return null;
}
