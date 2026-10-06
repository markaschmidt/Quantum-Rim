import { useEffect, useRef } from 'react';

import { chartBelts, chartDust, heatBlob, pointAlong } from '../../game/galaxyChart.js';
import { enemyPosition } from '../../game/incursions.js';

function AsteroidField({ belts }) {
  const nodes = useRef(new Map());
  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const step = (now) => {
      const elapsed = (now - started) / 1000;
      for (const belt of belts) {
        for (const rock of belt.rocks) {
          const node = nodes.current.get(rock.id);
          if (!node) continue;
          const angle = rock.angle + elapsed * belt.spin;
          node.style.left = `${belt.cx + Math.cos(angle) * rock.rx}%`;
          node.style.top = `${belt.cy + Math.sin(angle) * rock.ry}%`;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [belts]);
  return belts.flatMap((belt) => belt.rocks.map((rock) => (
    <i
      key={rock.id}
      ref={(node) => {
        if (node) nodes.current.set(rock.id, node);
        else nodes.current.delete(rock.id);
      }}
      className={`asteroid asteroid--${rock.tone}`}
      style={{ width: rock.size, height: rock.size * rock.squash }}
    />
  )));
}

function Traveler({ body }) {
  const node = useRef(null);
  const tail = useRef(null);
  useEffect(() => {
    const anchor = { progress: body.progress || 0, at: performance.now() };
    const rate = (body.speed || 0.035) / 5;
    let frame = 0;
    const step = (now) => {
      const progress = Math.min(0.999, anchor.progress + ((now - anchor.at) / 1000) * rate);
      const point = pointAlong(body.path, progress);
      const ahead = pointAlong(body.path, Math.min(0.999, progress + 0.015));
      const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x);
      const edge = Math.min(point.x, point.y, 100 - point.x, 100 - point.y);
      const visible = edge < 5 ? Math.max(0, edge / 5) : 1;
      if (node.current) {
        const opacity = Math.max(0, (1 - (body.fade || 0)) * visible);
        node.current.style.left = `${point.x}%`;
        node.current.style.top = `${point.y}%`;
        node.current.style.opacity = String(opacity);
        node.current.style.pointerEvents = opacity > 0.05 ? 'auto' : 'none';
      }
      if (tail.current) tail.current.style.transform = `rotate(${angle}rad)`;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [body]);
  const kind = body.kind === 'meteor' ? 'meteor' : 'comet';
  const start = pointAlong(body.path, body.progress || 0);
  return (
    <button
      ref={node}
      style={{ left: `${start.x}%`, top: `${start.y}%` }}
      type="button"
      className={`traveler traveler--${kind}`}
      aria-label={`${body.name || 'Traveler'}, ${kind}`}
      onClick={(event) => event.stopPropagation()}
    >
      <i ref={tail} className="traveler__tail" />
      <i className="traveler__head" />
      <span className="traveler__label">
        <strong>{body.name || (kind === 'meteor' ? 'Meteor' : 'Comet')}</strong>
        <small>{kind === 'meteor' ? 'Meteor' : 'Comet'} · {body.heading || 'outer'}</small>
      </span>
    </button>
  );
}

export function GalaxySky({
  galaxy,
  heatGrade,
  heatMax,
  showBelts,
  showDust,
  showComets,
  comets,
  enemies,
  sites,
}) {
  const belts = showBelts ? chartBelts(galaxy) : [];
  const dust = showDust ? chartDust(galaxy) : [];
  const sortieFleets = (sites || []).filter((site) => site.type === 'fleet' && site.sortie);
  return (
    <>
      <svg className="galaxy-sky" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {heatGrade && Object.values(galaxy.systems).map((system) => {
          const amount = system.deposits?.[heatGrade] || 0;
          if (!amount) return null;
          const strength = amount / heatMax;
          return (
            <path
              key={`${system.id}:${heatGrade}`}
              className="galaxy-heat-blob"
              d={heatBlob(system, heatGrade, strength)}
              style={{ opacity: 0.16 + strength * 0.22 }}
            />
          );
        })}
        {dust.map((sector) => (
          <path key={sector.id} className="galaxy-dust" d={sector.d} />
        ))}
        {sortieFleets.map((site) => {
          const enemy = (enemies || []).find((item) => item.id === site.sortie.enemyId);
          if (!enemy || enemy.status !== 'engaging') return null;
          const from = site.sortie;
          const to = enemyPosition(enemy, galaxy);
          return (
            <line
              key={`${site.id}:clash`}
              className="galaxy-engagement"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
      </svg>
      {showBelts && <AsteroidField belts={belts} />}
      {showComets && (comets || []).map((comet) => (
        <Traveler key={comet.id} body={comet} />
      ))}
      {(enemies || []).map((enemy) => {
        const pos = enemyPosition(enemy, galaxy);
        const parked = enemy.status === 'pressing';
        return (
          <button
            key={enemy.id}
            type="button"
            data-enemy-id={enemy.id}
            className={`enemy-fleet enemy-fleet--${enemy.status}`}
            style={{ left: `${parked ? pos.x + 3.2 : pos.x}%`, top: `${parked ? pos.y - 3.4 : pos.y}%` }}
            aria-label={`${enemy.name}, ${enemy.doctrine}, ${enemy.status}`}
            onClick={(event) => event.stopPropagation()}
          >
            <i />
            <span>{enemy.status === 'engaging' ? 'ENGAGED' : enemy.status === 'pressing' ? enemy.pressRemaining : enemy.cyclesRemaining}</span>
          </button>
        );
      })}
      {sortieFleets.map((site) => {
        const enemy = (enemies || []).find((item) => item.id === site.sortie.enemyId);
        const engaged = enemy?.status === 'engaging';
        return (
          <div
            key={site.id}
            className={`sortie-fleet ${engaged ? 'is-engaging' : ''}`}
            style={{ left: `${site.sortie.x}%`, top: `${site.sortie.y}%` }}
            aria-label={`Defense fleet intercepting ${enemy?.name || 'a raider'}`}
          >
            <i />
          </div>
        );
      })}
    </>
  );
}
