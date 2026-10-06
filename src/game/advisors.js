function placeOf(body, crisis) {
  return [crisis?.systemName, crisis?.bodyName || body?.name].filter(Boolean).join(' · ') || 'the republic';
}

function crisisLine(crisis) {
  if (!crisis?.title) return 'No operation is currently pinned to this channel.';
  const severity = Number.isFinite(crisis.severity) ? `${Math.round(crisis.severity * 100)}%` : 'an open';
  return `${crisis.title} is ${severity} and still on the board.`;
}

const VOICES = {
  'director-vale': (brief) => (
    `${brief.place}. ${brief.crisis} On “${brief.ask}”: read the survey before you spend a drill. Stability ${brief.stability}. If the cause is instability, a science response buys more than another warning.`
  ),
  'marshal-sorn': (brief) => (
    `${brief.place}. ${brief.crisis} On “${brief.ask}”: answer the highest severity in that system first. Do not open a second front while a deadline is inside a handful of cycles.`
  ),
  'prefect-lyra': (brief) => (
    `${brief.place}. ${brief.crisis} On “${brief.ask}”: protect population and the tax coffer. A logistics response is the one that keeps the settlement fed if this operation fails.`
  ),
};

export function localAdvisorReply({ characterId, message, body, crisis }) {
  const speak = VOICES[characterId] || VOICES['director-vale'];
  const ask = String(message || 'the standing situation').replace(/\s+/g, ' ').trim().slice(0, 180);
  const stability = Number.isFinite(body?.stability) ? `${Math.round(body.stability)}%` : 'unsurveyed';
  return speak({
    ask,
    place: placeOf(body, crisis),
    crisis: crisisLine(crisis),
    stability,
  });
}
