import { useEffect, useState } from 'react';

import {
  buildOffer,
  buildTable,
  FACILITY_TYPES,
  facilityCap,
  governmentLevel,
  siteAt,
  sitesOfType,
} from '../../game/facilities';
import { formatCredits, RESOURCE_LABELS } from '../../game/resources';
import {
  FACILITIES,
  facilityOffer,
  SKILL_TREE,
  skillOffer,
} from '../../game/imperialWorks';
import { useStrategicStore, selectSelectedSystem } from '../../store/useStrategicStore';
import {
  DEV_BUILD_MAX_MS,
  DEV_BUILD_MIN_MS,
  devBuildClockEnabled,
  limitBuildMs,
  setDevBuildClockEnabled,
  subscribeDevBuildClock,
} from '../../game/devBuildClock.js';
import { FacilityPreview } from './FacilityPreview';
import { ModalShell } from './ModalShell';

function bundleText(cost) {
  if (!cost) return '—';
  const materials = Object.entries(cost.commodities || {})
    .map(([resource, amount]) => `${amount} ${RESOURCE_LABELS[resource] || resource}`);
  return `${formatCredits(cost.credits)}${materials.length ? ` · ${materials.join(', ')}` : ''}`;
}

function secondsLabel(cycles) {
  return `${Math.round(limitBuildMs(cycles) / 1000)}s`;
}

function shortLabel(reason) {
  if (reason === 'credits') return 'credits';
  if (reason === 'cap') return 'a free slot';
  if (reason === 'level') return 'a higher government level';
  if (reason === 'building') return 'the site, which is still under construction';
  if (reason === 'transit') return 'the rig, which is still in transit';
  if (reason === 'sortie') return 'the fleet, which is still in the field';
  if (reason === 'offline') return 'the site, which is offline';
  if (reason === 'maxed') return 'a higher rank';
  return RESOURCE_LABELS[reason] || reason;
}

export function ImperialWorksShop() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('works');
  const [notice, setNotice] = useState('');
  const [devClock, setDevClock] = useState(devBuildClockEnabled);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const credits = useStrategicStore((state) => state.treasury.credits);
  const works = useStrategicStore((state) => state.imperialWorks);
  const sites = useStrategicStore((state) => state.sites);
  const selectedSystem = useStrategicStore(selectSelectedSystem);
  const purchaseSkill = useStrategicStore((state) => state.purchaseSkill);
  const purchaseFacility = useStrategicStore((state) => state.purchaseFacility);
  const startConstruction = useStrategicStore((state) => state.startConstruction);
  const level = governmentLevel(sites);

  useEffect(() => subscribeDevBuildClock(() => setDevClock(devBuildClockEnabled())), []);

  useEffect(() => {
    if (!open || !devClock) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [open, devClock]);

  function buySkill(skill) {
    const result = purchaseSkill(skill.id);
    setNotice(result.ok ? `${skill.name} upgraded.` : result.reason === 'credits' ? 'The treasury cannot cover that rank.' : 'That rank is not available.');
  }

  function buyFacility(facility) {
    if (!selectedSystem) return;
    const result = purchaseFacility(selectedSystem.id, facility.id);
    setNotice(result.ok ? `${facility.name} raised at ${selectedSystem.name}.` : result.reason === 'credits' ? 'The treasury cannot cover that facility.' : 'That facility cannot be raised.');
  }

  function commission(type) {
    if (!selectedSystem) return;
    const spec = FACILITY_TYPES.find((item) => item.id === type.id) || type;
    const result = startConstruction(selectedSystem.id, spec.id);
    if (result.ok) {
      const wait = result.durationMs
        ? `${Math.max(1, Math.round(result.durationMs / 1000))} seconds`
        : `${result.cycles} cycles`;
      setNotice(`${spec.name} commissioned at ${selectedSystem.name}. ${wait} until it comes online.`);
      return;
    }
    setNotice(`${spec.name} was not started. The republic is short on ${shortLabel(result.reason)}.`);
  }

  const branches = [...new Set(SKILL_TREE.map((skill) => skill.branch))];

  return (
    <>
      <button type="button" className="imperial-status__shop" onClick={() => { setNotice(''); setOpen(true); }}>
        Imperial works
      </button>
      {open && (
        <ModalShell title="Imperial works" eyebrow={`Government level ${level}`} onClose={() => setOpen(false)} className="works-modal">
          <p className="works-balance">Treasury available {formatCredits(credits)}</p>
          <label className="dev-build-toggle">
            <input
              type="checkbox"
              checked={devClock}
              onChange={(event) => setDevBuildClockEnabled(event.target.checked)}
            />
            Dev build clock · contracts finish between {DEV_BUILD_MIN_MS / 1000}s and {DEV_BUILD_MAX_MS / 1000}s
          </label>
          <div className="works-tabs" role="tablist">
            <button type="button" className={tab === 'works' ? 'active' : ''} onClick={() => setTab('works')}>Credits</button>
            <button type="button" className={tab === 'arsenal' ? 'active' : ''} onClick={() => setTab('arsenal')}>Arsenal</button>
          </div>
          {notice && <p className="works-notice">{notice}</p>}
          {tab === 'works' && (
            <div className="works-layout">
              <section>
                <h3>Skill tree</h3>
                {branches.map((branch) => (
                  <div key={branch} className="works-branch">
                    <span>{branch}</span>
                    {SKILL_TREE.filter((skill) => skill.branch === branch).map((skill) => {
                      const offer = skillOffer(works, skill);
                      return (
                        <article key={skill.id} className={`works-card ${offer.locked ? 'is-locked' : ''} ${offer.maxed ? 'is-maxed' : ''}`}>
                          <header>
                            <strong>{skill.name}</strong>
                          </header>
                          <p>{skill.detail}</p>
                          {skill.requires && <p className="works-requires">Requires {SKILL_TREE.find((item) => item.id === skill.requires.id)?.name} {skill.requires.rank}</p>}
                          <footer className="works-card__foot">
                            <button
                              type="button"
                              className="command-button"
                              disabled={offer.locked || offer.maxed || credits < (offer.cost || 0)}
                              onClick={() => buySkill(skill)}
                            >
                              {offer.maxed ? 'Maxed' : `Buy rank ${offer.rank + 1} · ${formatCredits(offer.cost)}`}
                            </button>
                            <em className="works-card__rank">Rank {offer.rank}/{skill.maxRank}</em>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                ))}
              </section>
              <section>
                <h3>Facilities{selectedSystem ? ` · ${selectedSystem.name}` : ''}</h3>
                {!selectedSystem && <p className="command-empty">Select a system on the map before raising a facility.</p>}
                {FACILITIES.map((facility) => {
                  const offer = selectedSystem ? facilityOffer(works, selectedSystem.id, facility) : { rank: 0, cost: facility.costs[0], maxed: false };
                  return (
                    <article key={facility.id} className={`works-card works-card--model ${offer.maxed ? 'is-maxed' : ''}`}>
                      <FacilityPreview type={facility.id} />
                      <div>
                        <header>
                          <strong>{facility.name}</strong>
                        </header>
                        <p>{facility.detail}</p>
                        <footer className="works-card__foot">
                          <button
                            type="button"
                            className="command-button"
                            disabled={!selectedSystem || offer.maxed || credits < (offer.cost || 0)}
                            onClick={() => buyFacility(facility)}
                          >
                            {offer.maxed ? 'Maxed' : `Raise · ${formatCredits(offer.cost)}`}
                          </button>
                          <em className="works-card__rank">Rank {offer.rank}/{facility.maxRank}</em>
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </section>
            </div>
          )}
          {tab === 'arsenal' && (
            <div className="works-layout works-layout--arsenal">
              <section>
                <h3>Commission{selectedSystem ? ` · ${selectedSystem.name}` : ''}</h3>
                <p className="works-requires">Government level {level}. A completed research rank is the only way that level rises. Caps grow with it.</p>
                {!selectedSystem && <p className="command-empty">Select a system on the map before commissioning a site.</p>}
                {FACILITY_TYPES.map((type) => {
                  const offer = selectedSystem ? buildOffer(sites, selectedSystem, type.id) : { ok: false, reason: 'level', current: 0 };
                  const site = selectedSystem ? siteAt(sites, selectedSystem.id, type.id) : null;
                  const held = sitesOfType(sites, type.id).length;
                  const cap = facilityCap(type.id, level);
                  const missing = offer.ok ? null : offer.reason;
                  return (
                    <article key={type.id} className={`works-card works-card--model ${offer.ok ? '' : 'is-locked'}`}>
                      <FacilityPreview type={type.id} />
                      <div>
                        <header>
                          <strong>{type.name}</strong>
                        </header>
                        <p>{type.detail}</p>
                        {site?.building?.readyAt && (
                          <p className="works-requires">{Math.max(0, Math.ceil((site.building.readyAt - clockNow) / 1000))}s remaining on rank {site.building.targetLevel}.</p>
                        )}
                        {site?.building && !site.building.readyAt && <p className="works-requires">{site.building.cyclesRemaining} cycles remaining on rank {site.building.targetLevel}.</p>}
                        {site?.transit && <p className="works-requires">In transit, {site.transit.cyclesRemaining} cycles.</p>}
                        {offer.ok && (
                          <p className="works-requires">
                            {bundleText(offer.cost)} · {devClock ? secondsLabel(offer.cycles) : `${offer.cycles} cycles`} (spread {devClock ? `${secondsLabel(offer.spread[0])}–${secondsLabel(offer.spread[1])}` : `${offer.spread[0]}–${offer.spread[1]}`})
                          </p>
                        )}
                        {!offer.ok && missing && missing !== 'maxed' && (
                          <p className="works-requires">Held: needs {shortLabel(missing)}.</p>
                        )}
                        <footer className="works-card__foot">
                          {offer.ok && (
                            <button type="button" className="command-button" onClick={() => commission(type)}>
                              Start rank {offer.nextLevel}
                            </button>
                          )}
                          <em className="works-card__rank">Rank {site?.level || 0}/5 · {held}/{cap}</em>
                        </footer>
                      </div>
                    </article>
                  );
                })}
              </section>
              <section>
                <h3>Construction table</h3>
                <p className="works-requires">
                  {devClock
                    ? 'The Monte Carlo median is kept, then squeezed into a 3–15 second contract.'
                    : 'Median cycles are the contract. The spread is the 10th to 90th of 64 seeded samples.'}
                </p>
                <div className="arsenal-table-wrap">
                  <table className="arsenal-table">
                    <thead>
                      <tr>
                        <th>Facility</th>
                        <th>Level</th>
                        <th>Credits and materials</th>
                        <th>{devClock ? 'Time' : 'Cycles'}</th>
                        <th>Spread</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FACILITY_TYPES.flatMap((type) => buildTable(type.id).map((row) => (
                        <tr key={`${type.id}-${row.level}`}>
                          <td>{type.name}</td>
                          <td>{row.level}</td>
                          <td>{bundleText(row.cost)}</td>
                          <td>{devClock ? secondsLabel(row.median) : Math.round(row.median)}</td>
                          <td>{devClock ? `${secondsLabel(row.low)}–${secondsLabel(row.high)}` : `${Math.round(row.low)}–${Math.round(row.high)}`}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </ModalShell>
      )}
    </>
  );
}
