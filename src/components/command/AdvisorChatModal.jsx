import { useEffect, useMemo, useRef, useState } from 'react';

import { useQuantumServices } from '../../services/useQuantumServices';
import { useStrategicStore } from '../../store/useStrategicStore';
import { findPlanet } from '../../game/galaxySeed';
import { ModalShell } from './ModalShell';
import { QuantumProvenance } from './QuantumProvenance';

const CHARACTERS = [
  { id: 'director-vale', name: 'Director Vale', title: 'Imperial Sciences', color: '#8ee8ff' },
  { id: 'marshal-sorn', name: 'Marshal Sorn', title: 'Crisis Command', color: '#ff8a66' },
  { id: 'prefect-lyra', name: 'Prefect Lyra', title: 'Colonial Logistics', color: '#c6ff6b' },
];

export function AdvisorChatModal() {
  const client = useQuantumServices();
  const open = useStrategicStore((state) => state.advisorOpen);
  const characterId = useStrategicStore((state) => state.advisorCharacterId);
  const advisorEventId = useStrategicStore((state) => state.advisorEventId);
  const setCharacter = useStrategicStore((state) => state.openAdvisor);
  const close = useStrategicStore((state) => state.closeAdvisor);
  const treasury = useStrategicStore((state) => state.treasury);
  const galaxy = useStrategicStore((state) => state.galaxy);
  const selectedPlanetId = useStrategicStore((state) => state.selectedPlanetId);
  const crisis = useStrategicStore((state) => (
    state.events.find((event) => event.id === state.advisorEventId)
    || state.events.find((event) => event.status !== 'resolved')
    || state.events[0]
  ));
  const body = findPlanet(galaxy, crisis?.planetId || selectedPlanetId);
  const [messagesByCharacter, setMessagesByCharacter] = useState({});
  const [input, setInput] = useState('');
  const [pendingCharacter, setPendingCharacter] = useState(null);
  const [error, setError] = useState('');
  const requestRef = useRef(null);
  const character = CHARACTERS.find((item) => item.id === characterId) || CHARACTERS[0];
  const messages = messagesByCharacter[character.id] || [];
  const pending = pendingCharacter === character.id;

  const context = useMemo(() => ({
    body: body ? {
      id: body.id,
      name: body.name,
      type: body.type,
      stability: body.stability,
      population: body.population,
      suitability: body.suitability,
      recent_history: body.history.slice(-5),
    } : {},
    crisis: crisis || {},
  }), [body, crisis]);

  useEffect(() => () => requestRef.current?.abort(), []);

  if (!open) return null;

  async function sendMessage(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) return;
    const userMessage = { role: 'user', content };
    const history = [...messages, userMessage];
    const requestCharacter = character;
    setMessagesByCharacter((current) => ({ ...current, [requestCharacter.id]: history }));
    setInput('');
    setPendingCharacter(requestCharacter.id);
    setError('');
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await client.chat({
        character_id: requestCharacter.id,
        messages: history.map(({ role, content: text }) => ({ role, content: text })),
        body_context: context.body,
        crisis_context: context.crisis,
        imperial_context: treasury,
        quantum_influence: crisis?.quantum?.[0]?.verified ? {
          engine: crisis.quantum[0].engine,
          operation: crisis.quantum[0].operation,
          execution_id: crisis.quantum[0].execution_id,
          signal: `${crisis.id}:${messages.length}`,
        } : null,
      }, { signal: controller.signal });
      setMessagesByCharacter((current) => ({
        ...current,
        [requestCharacter.id]: [...(current[requestCharacter.id] || []), {
          ...response.message,
          provenance: response.provenance,
          model: response.model,
        }],
      }));
    } catch (requestError) {
      if (requestError.name === 'AbortError') return;
      setError(requestError.status === 503
        ? 'OpenRouter is not configured. Add OPENROUTER_API_KEY to the service .env.'
        : requestError.message);
    } finally {
      setPendingCharacter((current) => current === requestCharacter.id ? null : current);
    }
  }

  return (
    <ModalShell eyebrow="Encrypted cabinet channel" title={character.name} onClose={close} className="advisor-modal">
      <div className="advisor-roster">
        {CHARACTERS.map((item) => (
          <button
            key={item.id}
            className={item.id === character.id ? 'active' : ''}
            style={{ '--advisor-color': item.color }}
            onClick={() => setCharacter(item.id, advisorEventId || crisis?.id || null)}
          >
            <span>{item.name}</span><small>{item.title}</small>
          </button>
        ))}
      </div>
      <div className="advisor-context">
        {crisis ? `${crisis.title} · ${crisis.bodyName}` : 'No active crisis · general cabinet consultation'}
      </div>
      <div className="chat-transcript">
        {messages.length === 0 && (
          <div className="advisor-opening">
            <strong>{character.name}</strong>
            <p>The channel is secure. Give me the decision you need to make.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div className={`chat-bubble chat-bubble--${message.role}`} key={`${message.role}-${index}`}>
            <p>{message.content}</p>
            {message.provenance && <QuantumProvenance provenance={message.provenance} compact />}
            {message.model && <small className="chat-model">via {message.model}</small>}
          </div>
        ))}
        {pending && <div className="chat-bubble chat-bubble--assistant"><p>Reviewing telemetry…</p></div>}
      </div>
      {error && <div className="command-error">{error}</div>}
      <form className="chat-composer" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask for an assessment, tradeoff, or recommendation…"
          maxLength={1000}
        />
        <button className="command-button" disabled={pending}>Transmit</button>
      </form>
    </ModalShell>
  );
}
