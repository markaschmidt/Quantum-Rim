import { useStrategicStore } from '../../store/useStrategicStore';
import { formatCredits, RESOURCE_LABELS } from '../../game/resources';

export function ImperialStatusBar() {
  const treasury = useStrategicStore((state) => state.treasury);
  const activeCrises = useStrategicStore(
    (state) => state.events.filter((event) => event.status !== 'resolved').length,
  );

  return (
    <div className="imperial-status">
      <div className="imperial-status__seal">QR</div>
      <div>
        <span>Imperial Treasury</span>
        <strong>{formatCredits(treasury.credits)}</strong>
      </div>
      {Object.entries(treasury.commodities).map(([name, amount]) => (
        <div className="imperial-status__resource" key={name} title={`Imperial ${name} reserve`}>
          <span>{RESOURCE_LABELS[name] || name}</span>
          <strong className={amount < 80 ? 'resource-low' : ''}>{amount}</strong>
        </div>
      ))}
      <div className="imperial-status__crises">
        <span>Active warnings</span>
        <strong>{activeCrises}</strong>
      </div>
    </div>
  );
}
