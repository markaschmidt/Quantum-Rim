/**
 * MiniMap — top-down 2D radar view of the simulation.
 *
 * Renders an HTML <canvas> showing all bodies as colored dots
 * relative to the system's center of mass, with the camera frustum indicated.
 * Auto-scales to fit all bodies.
 */

import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/useSimStore';

const SIZE = 140;
const PADDING = 12;

export function MiniMap() {
  const canvasRef = useRef();

  useEffect(() => {
    let raf;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const { bodies } = useSimStore.getState();
      const alive = bodies.filter((b) => b.isAlive);

      // Clear
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'rgba(0,4,12,0.85)';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Border
      ctx.strokeStyle = 'rgba(0,200,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);

      if (alive.length === 0) { raf = requestAnimationFrame(draw); return; }

      // Compute bounding box
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const b of alive) {
        minX = Math.min(minX, b.position[0]);
        maxX = Math.max(maxX, b.position[0]);
        minY = Math.min(minY, b.position[1]);
        maxY = Math.max(maxY, b.position[1]);
      }

      const rangeX = maxX - minX || 4;
      const rangeY = maxY - minY || 4;
      const range = Math.max(rangeX, rangeY) * 1.4;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const toScreen = (wx, wy) => [
        PADDING + ((wx - cx) / range + 0.5) * (SIZE - PADDING * 2),
        PADDING + (0.5 - (wy - cy) / range) * (SIZE - PADDING * 2),
      ];

      // Grid
      ctx.strokeStyle = 'rgba(0,200,255,0.08)';
      ctx.lineWidth = 0.5;
      const half = SIZE / 2;
      ctx.beginPath();
      ctx.moveTo(half, PADDING); ctx.lineTo(half, SIZE - PADDING);
      ctx.moveTo(PADDING, half); ctx.lineTo(SIZE - PADDING, half);
      ctx.stroke();

      // Bodies
      for (const b of alive) {
        const [sx, sy] = toScreen(b.position[0], b.position[1]);
        const r = Math.max(2, Math.min(b.radius * 8, 8));

        // Glow
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = b.color + '30';
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
      }

      // COM marker
      let totalMass = 0, comX = 0, comY = 0;
      for (const b of alive) {
        comX += b.mass * b.position[0];
        comY += b.mass * b.position[1];
        totalMass += b.mass;
      }
      if (totalMass > 0) {
        const [cx2, cy2] = toScreen(comX / totalMass, comY / totalMass);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx2 - 4, cy2); ctx.lineTo(cx2 + 4, cy2);
        ctx.moveTo(cx2, cy2 - 4); ctx.lineTo(cx2, cy2 + 4);
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = 'rgba(142,232,255,0.5)';
      ctx.font = '8px "Share Tech Mono", monospace';
      ctx.fillText('RADAR', 4, 10);

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{
        display: 'block',
        borderRadius: 6,
        border: '1px solid rgba(0,200,255,0.2)',
        pointerEvents: 'none',
      }}
    />
  );
}
