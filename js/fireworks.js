// Silvester-Feuerwerk: kurze Show beim Start und kleine Funken als Belohnung.
// Ein gemeinsames Canvas hinter dem Inhalt, blockiert nie Tipps, räumt sich selbst auf.
const COLORS = ['#f2c86b', '#ffe2a0', '#ff4fa3', '#4fd8ff', '#ffb347', '#ffffff'];
const MAX_PARTICLES = 300;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let canvas = null, ctx = null, raf = 0, last = 0, endAt = 0, w = 0, h = 0, dpr = 1;
let rockets = [], parts = [], launches = [];

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fw';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
}
function resize() {
  if (!canvas) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  w = window.innerWidth; h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function onVisibility() {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (canvas && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}
function teardown() {
  cancelAnimationFrame(raf); raf = 0;
  window.removeEventListener('resize', resize);
  document.removeEventListener('visibilitychange', onVisibility);
  canvas?.remove();
  canvas = null; ctx = null; rockets = []; parts = []; launches = [];
}

function explode(x, y, count, color) {
  const room = Math.max(0, MAX_PARTICLES - parts.length);
  const n = Math.min(count, room);
  const ring = Math.random() < 0.35;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
    const sp = ring ? 2.6 + Math.random() * 0.4 : 0.6 + Math.random() * 3;
    parts.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.012 + Math.random() * 0.012,
      color: Math.random() < 0.75 ? color : COLORS[(Math.random() * COLORS.length) | 0] });
  }
}

function frame(t) {
  if (!ctx) return;
  const dt = Math.min(2, (t - last) / 16.7 || 1);
  last = t;
  while (launches.length && launches[0].at <= t) {
    const l = launches.shift();
    rockets.push({ x: l.x, y: h + 10, vy: -(h * 0.012 + 6 + Math.random() * 2), ty: l.ty, color: l.color });
  }
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  for (const r of rockets) {
    r.py = r.y; r.y += r.vy * dt; r.vy *= 0.985;
    ctx.strokeStyle = 'rgba(255,226,160,.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x, r.py + 8); ctx.lineTo(r.x, r.y); ctx.stroke();
    if (r.y <= r.ty || r.vy > -1.5) { r.done = true; explode(r.x, r.y, 70, r.color); }
  }
  rockets = rockets.filter((r) => !r.done);
  for (const p of parts) {
    p.px = p.x; p.py = p.y;
    p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.045 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= p.decay * dt;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.strokeStyle = p.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  parts = parts.filter((p) => p.life > 0);
  const idle = !rockets.length && !parts.length && !launches.length;
  if ((idle && t >= endAt) || t > endAt + 2500) { teardown(); return; }
  raf = requestAnimationFrame(frame);
}

function start(duration) {
  ensureCanvas();
  const now = performance.now();
  endAt = Math.max(endAt, now + duration);
  if (!raf && !document.hidden) { last = now; raf = requestAnimationFrame(frame); }
}

// Kurze Show (~3,5 s): ein paar Raketen, die zerplatzen
export function fireworksShow({ duration = 3500, rockets: count = 6 } = {}) {
  if (reduced()) { document.body.classList.add('sparkle-static'); return false; }
  start(duration);
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    launches.push({ at: now + 150 + i * ((duration - 1500) / count) + Math.random() * 200,
      x: w * (0.15 + Math.random() * 0.7), ty: h * (0.12 + Math.random() * 0.28), color: COLORS[i % 5] });
  }
  launches.sort((a, b) => a.at - b.at);
  return true;
}

// Kleiner Funkenregen an einer Stelle (Easter Egg, gespeicherter Zugang)
export function burst(x, y, { count = 45 } = {}) {
  if (reduced()) return false;
  start(1200);
  explode(x, y, count, COLORS[(Math.random() * 3) | 0]);
  return true;
}
export function burstAt(node, opts) {
  const r = node.getBoundingClientRect();
  return burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}
