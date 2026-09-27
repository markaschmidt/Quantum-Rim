/* Quantum Rim landing — nav state, reveals, counters, orbital hero animation. */

const nav = document.getElementById('nav');
const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 40);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 60, 300)}ms`;
  io.observe(el);
});

const countIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target;
    const target = Number(el.dataset.count || '0');
    const start = performance.now();
    const dur = 1400;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    countIO.unobserve(el);
  }
}, { threshold: 0.5 });
document.querySelectorAll('[data-count]').forEach((c) => countIO.observe(c));

// ── Hero: an orbital system with drifting stars ─────────────────────
const canvas = document.getElementById('hero-canvas');
if (canvas && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0;
  let stars = [];

  const bodies = [
    { r: 150, size: 3.5, speed: 0.22, color: '#8ee8ff', phase: 0 },
    { r: 240, size: 5, speed: 0.15, color: '#ffcf6b', phase: 1.7 },
    { r: 330, size: 4, speed: 0.10, color: '#ff7a9c', phase: 3.1 },
    { r: 430, size: 6, speed: 0.07, color: '#a855f7', phase: 4.6 },
  ];

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W * 0.72; cy = H * 0.42;
    stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.3 + 0.2, tw: Math.random() * Math.PI * 2,
    }));
  };
  resize();
  window.addEventListener('resize', resize);

  const start = performance.now();
  const frame = (now) => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);

    // twinkling stars
    for (const s of stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.2 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // orbit rings
    for (const b of bodies) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,212,255,0.12)';
      ctx.lineWidth = 1;
      ctx.ellipse(cx, cy, b.r, b.r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // central star
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.4, '#ffe9a8');
    grd.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    // orbiting bodies (elliptical projection)
    for (const b of bodies) {
      const ang = t * b.speed * Math.PI * 2 + b.phase;
      const x = cx + Math.cos(ang) * b.r;
      const y = cy + Math.sin(ang) * b.r * 0.42;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(x, y, b.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
