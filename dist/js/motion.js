import { RM } from './register.js';

// Damped spring (semi-implicit Euler, fixed 1/120s step).
export function spring({ from = 0, to = 1, k = 170, c = 22, m = 1, onUpdate, onDone }) {
  if (RM()) { onUpdate(to); if (onDone) onDone(); return; }
  let x = from, v = 0, last = performance.now(), acc = 0;
  const dt = 1 / 120;
  const tick = (now) => {
    acc += Math.min(0.05, (now - last) / 1000); last = now;
    while (acc >= dt) { v += ((-k * (x - to) - c * v) / m) * dt; x += v * dt; acc -= dt; }
    if (Math.abs(x - to) < 0.0005 && Math.abs(v) < 0.001) { onUpdate(to); if (onDone) onDone(); return; }
    onUpdate(x); requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Scroll-reveal with per-group stagger.
export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (RM() || !('IntersectionObserver' in window)) {
    els.forEach((el) => { el.style.opacity = '1'; el.classList.add('is-revealed'); });
    return;
  }
  const groupIndex = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const group = el.parentElement;
      const i = groupIndex.get(group) || 0; groupIndex.set(group, i + 1);
      setTimeout(() => {
        spring({
          from: 0, to: 1, k: 150, c: 19,
          onUpdate: (p) => {
            el.style.opacity = String(Math.min(1, Math.max(0, p * 1.15)));
            el.style.transform = `translate3d(0, ${(1 - p) * 34}px, 0) scale(${0.97 + 0.03 * p})`;
          },
          onDone: () => { el.style.transform = ''; el.style.opacity = '1'; el.classList.add('is-revealed'); },
        });
      }, i * 80);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
  setInterval(() => groupIndex.clear(), 1200);
}

// Parallax: pointer + scroll drive depth layers in the hero stage.
export function initParallax() {
  const stage = document.getElementById('stage');
  if (!stage || RM()) return;
  const layers = [...stage.querySelectorAll('[data-depth]')];
  let px = 0, py = 0, tx = 0, ty = 0, sy = 0, tsy = 0, running = false;
  const frame = () => {
    px += (tx - px) * 0.08; py += (ty - py) * 0.08; sy += (tsy - sy) * 0.1;
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = `translate3d(${(px * -16 * d).toFixed(2)}px, ${(py * -10 * d + sy * 24 * d).toFixed(2)}px, 0)`;
    }
    if (Math.abs(tx - px) + Math.abs(ty - py) + Math.abs(tsy - sy) > 0.001) requestAnimationFrame(frame); else running = false;
  };
  const kick = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
  window.addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; kick(); }, { passive: true });
  const onScroll = () => { const r = stage.getBoundingClientRect(); tsy = Math.max(-1, Math.min(1, -r.top / innerHeight)); kick(); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

export function initProgress() {
  const bar = document.getElementById('progress');
  const set = () => { const h = document.documentElement; const max = h.scrollHeight - innerHeight; bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`; };
  window.addEventListener('scroll', set, { passive: true }); window.addEventListener('resize', set); set();
}

// Spotlight: cursor-follow glow on any .spot / .row.
export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.spot, .row');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

// Count-up with flash on value change.
export function countTo(el, to, fmt, { flash = true } = {}) {
  const from = el._v;
  el._v = to;
  if (!Number.isFinite(to)) { el.textContent = fmt(to); return; }
  if (from === to) return;
  const start = Number.isFinite(from) ? from : 0;
  if (flash && Number.isFinite(from)) {
    const cls = to > from ? 'flash-up' : 'flash-down';
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(cls);
  }
  if (RM()) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 800;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(start + (to - start) * e);
    if (p < 1 && el._v === to) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}
