import { create } from 'zustand';

import { ACTIVITIES_BY_ID, activitiesForCrisis } from '../game/activities';
import {
  DEFAULT_COMMODITIES,
  applyResourceDelta,
  calculateCrisisLoss,
} from '../game/resources';

const CRISIS_TITLES = {
  'magnetic-pole-shift': 'Magnetic Pole Destabilization',
  'asteroid-collision': 'Near-system Asteroid Emergency',
  'small-body-collision': 'Small-body Collision & Debris Alert',
  'star-implosion': 'Stellar Collapse Warning',
  'black-hole-collision': 'Black-hole Merger Alert',
  'black-hole-entry': 'Rogue Singularity Incursion',
  'trade-disruption': 'Imperial Supply Disruption',
};

function chooseCrisis(body, stochastic) {
  if (body.type === 'black_hole') return 'black-hole-entry';
  const profile = body.profile || {};
  const candidates = profile.composition?.metal > 0.28
    ? ['asteroid-collision', 'trade-disruption', 'magnetic-pole-shift']
    : profile.composition?.gas > 0.35
      ? ['magnetic-pole-shift', 'star-implosion', 'trade-disruption']
      : ['magnetic-pole-shift', 'asteroid-collision', 'trade-disruption'];
  const value = stochastic
    ? Math.random()
    : ((profile.seed || body.id.length * 7919) % 1000) / 1000;
  return candidates[Math.min(candidates.length - 1, Math.floor(value * candidates.length))];
}

export const useImperialStore = create((set, get) => ({
  treasury: {
    credits: 125000,
    commodities: { ...DEFAULT_COMMODITIES },
  },
  events: [],
  activeActivityEventId: null,
  advisorOpen: false,
  advisorCharacterId: 'director-vale',

  createCrisis(body, { stochastic = true, generated = null } = {}) {
    if (!body) return null;
    const eventType = generated?.event_type || chooseCrisis(body, stochastic);
    const activities = activitiesForCrisis(eventType);
    const activity = generated?.activity
      || activities[Math.floor(Math.random() * activities.length)]
      || activities[0];
    const severity = generated?.severity ?? Number((0.3 + Math.random() * 0.62).toFixed(2));
    const id = `crisis-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const event = {
      id,
      eventType,
      title: CRISIS_TITLES[eventType],
      bodyId: body.id,
      bodyName: body.name,
      severity,
      status: 'warning',
      activityId: activity.id,
      progress: 0,
      createdAt: Date.now(),
      quantum: generated?.provenance || [
        {
          engine: 'coin-toss',
          operation: 'Crisis class and severity branch',
          mode: 'classical-fallback',
          detail: 'Local fallback is active until an Atlas execution is attached.',
        },
        {
          engine: 'labyrinth',
          operation: 'Affected route and district graph',
          mode: 'planned',
          detail: 'Queued for event-spread generation.',
        },
      ],
    };
    set((state) => ({ events: [event, ...state.events] }));
    return event;
  },

  beginActivity(eventId) {
    set((state) => ({
      activeActivityEventId: eventId,
      events: state.events.map((event) => (
        event.id === eventId ? { ...event, status: 'active' } : event
      )),
    }));
  },

  resolveActivity(eventId, performance) {
    const event = get().events.find((candidate) => candidate.id === eventId);
    if (!event) return;
    const loss = calculateCrisisLoss(event, performance);
    const outcome = performance >= 0.75
      ? 'Imperial response contained the emergency.'
      : performance >= 0.45
        ? 'The crisis was contained with material losses.'
        : 'The response failed to prevent severe cascading damage.';
    set((state) => ({
      treasury: applyResourceDelta(state.treasury, loss),
      activeActivityEventId: null,
      events: state.events.map((candidate) => (
        candidate.id === eventId
          ? {
              ...candidate,
              status: 'resolved',
              progress: 1,
              performance,
              resourceDelta: loss,
              outcome,
            }
          : candidate
      )),
    }));
  },

  dismissActivity() {
    set({ activeActivityEventId: null });
  },

  openAdvisor(characterId = 'director-vale') {
    set({ advisorOpen: true, advisorCharacterId: characterId });
  },

  closeAdvisor() {
    set({ advisorOpen: false });
  },

  activityFor(event) {
    return event ? ACTIVITIES_BY_ID[event.activityId] : null;
  },
}));
