import { useEffect, useMemo, useState } from 'react';

import { connectedNodeIds, EXPEDITION_APPROACHES } from '../../game/expeditions';
import { selectActiveExpedition, useStrategicStore } from '../../store/useStrategicStore';
import { ModalShell } from './ModalShell';
import { QuantumProvenance } from './QuantumProvenance';

function nodePosition(index, count) {
  const columns = 3;
  const row = Math.floor(index / columns);
  const rows = Math.ceil(count / columns);
  return {
    x: 14 + (index % columns) * 36,
    y: 13 + row * (72 / Math.max(1, rows - 1)),
  };
}

function costLabel(cost) {
  const parts = [];
  if (cost.credits) parts.push(`${Math.abs(cost.credits)} IC`);
  for (const [resource, amount] of Object.entries(cost.commodities || {})) {
    if (amount) parts.push(`${Math.abs(amount)} ${resource}`);
  }
  return parts.length ? parts.join(' · ') : 'No supplies';
}

export function ExpeditionModal() {
  const expedition = useStrategicStore(selectActiveExpedition);
  const close = useStrategicStore((state) => state.closeExpedition);
  const chooseNode = useStrategicStore((state) => state.chooseExpeditionNode);
  const retreat = useStrategicStore((state) => state.retreatExpedition);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [approachId, setApproachId] = useState('scan');
  const [feedback, setFeedback] = useState('');

  const available = useMemo(() => expedition
    ? connectedNodeIds(expedition, expedition.currentNodeId)
      .filter((id) => !expedition.visitedNodeIds.includes(id))
    : [], [expedition]);

  useEffect(() => {
    setSelectedNodeId(available[0] ?? null);
    setFeedback('');
  }, [available, expedition?.id]);

  if (!expedition) return null;
  const currentNode = expedition.nodes.find((node) => node.id === expedition.currentNodeId);
  const completed = expedition.status === 'completed';
  const positions = Object.fromEntries(expedition.nodes.map((node, index) => [
    node.id, nodePosition(index, expedition.nodes.length),
  ]));

  function commitChoice() {
    if (selectedNodeId === null) return;
    const result = chooseNode(expedition.id, selectedNodeId, approachId);
    if (!result) {
      setFeedback('Insufficient resources or the selected route is no longer available.');
      return;
    }
    setFeedback(result.success
      ? result.completed ? 'Expedition complete. Findings entered into planetary history.' : 'Route secured. New chambers are now visible.'
      : 'The attempt failed. Choose another approach before trying this node again.');
  }

  return (
    <ModalShell eyebrow="Labyrinth expedition command" title={expedition.title} onClose={close} className="expedition-modal">
      <div className="expedition-summary">
        <div><span>Current site</span><strong>{currentNode?.label}</strong></div>
        <div><span>Status</span><strong>{expedition.status}</strong></div>
        <div><span>Mapped</span><strong>{expedition.visitedNodeIds.length}/{expedition.nodes.length}</strong></div>
      </div>

      <div className="expedition-graph" aria-label="Expedition site graph">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {expedition.edges.map(([left, right]) => (
            <line key={`${left}-${right}`} x1={positions[left].x} y1={positions[left].y} x2={positions[right].x} y2={positions[right].y} />
          ))}
        </svg>
        {expedition.nodes.map((node) => {
          const discovered = expedition.discoveredNodeIds.includes(node.id);
          const visited = expedition.visitedNodeIds.includes(node.id);
          const selectable = available.includes(node.id) && !completed;
          return (
            <button
              type="button"
              key={node.id}
              style={{ left: `${positions[node.id].x}%`, top: `${positions[node.id].y}%` }}
              className={`${visited ? 'visited' : ''} ${node.id === expedition.currentNodeId ? 'current' : ''} ${selectedNodeId === node.id ? 'selected' : ''}`}
              disabled={!discovered || (!selectable && !visited)}
              onClick={() => selectable && setSelectedNodeId(node.id)}
              aria-label={`${node.label}, ${node.kind}, risk ${Math.round(node.risk * 100)} percent`}
            >
              <i>{discovered ? node.id + 1 : '?'}</i>
              <span>{discovered ? node.label : 'Unknown node'}</span>
            </button>
          );
        })}
      </div>

      {!completed && selectedNodeId !== null && (
        <section className="expedition-approaches">
          <span className="command-eyebrow">Select crew approach</span>
          <div className="activity-card-grid">
            {Object.entries(EXPEDITION_APPROACHES).map(([id, approach]) => (
              <button type="button" key={id} className={approachId === id ? 'selected' : ''} onClick={() => setApproachId(id)}>
                <strong>{approach.label}</strong><span>{approach.detail}</span><small>{costLabel(approach.cost)}</small>
              </button>
            ))}
          </div>
          <button className="command-button activity-commit" onClick={commitChoice}>Commit expedition order</button>
        </section>
      )}

      <div className="expedition-crew">
        {expedition.crewRoles.map((role) => <span key={role}>{role}</span>)}
      </div>
      {feedback && <div className="telemetry-feedback">{feedback}</div>}
      <div className="expedition-log">
        {expedition.log.slice(-4).reverse().map((entry, index) => <p key={`${entry.turn}-${entry.nodeId}-${index}`}>{entry.message}</p>)}
      </div>
      <QuantumProvenance provenance={expedition.quantum} />
      <footer className="command-modal__actions">
        {!completed && <button className="command-button command-button--quiet" onClick={() => retreat(expedition.id)}>Order retreat</button>}
        <button className="command-button" onClick={close}>{completed ? 'Return findings to command' : 'Close expedition console'}</button>
      </footer>
    </ModalShell>
  );
}
