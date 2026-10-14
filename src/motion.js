/* ============================================================
   Motion helpers: master rAF driver, custom cursor, Lenis
   smooth scroll, reveals, magnetic buttons
   Magnetic buttons, smooth scroll, cursor easing and per-frame
   cursor writes are all gated off under prefers-reduced-motion.
   ============================================================ */
import Lenis from 'lenis';
import { motionPrefs } from './motionPrefs.js';

/* ---------- single master rAF loop ----------
   One requestAnimationFrame drives Lenis, the cursor, and any
   other subscriber. Subscribers receive the frame timestamp and
   can return false to be removed. When every subscriber is gone
   (idle cursor, exhausted stream text, lenis under reduced
   motion) the loop stops entirely instead of re-requesting. */
const listeners = new Set();
let masterRunning = false;

function masterFrame(time) {
  for (const fn of [...listeners]) {
    if (fn(time) === false) listeners.delete(fn);
  }
  if (listeners.size === 0) {
    masterRunning = false; // fully idle - no rAF outstanding
  } else {
    requestAnimationFrame(masterFrame);
  }
}

export function onFrame(fn) {
  listeners.add(fn);
  if (!masterRunning) {
    masterRunning = true;
    requestAnimationFrame(masterFrame);
  }
}

export function initCursor() {
  if (matchMedia('(hover: none)').matches) return;
  if (motionPrefs.reduced) return; // per-frame cursor chasing = motion
  const dot = document.getElementById('cursor');
  const ring = document.getElementById('cursorRing');
  if (!dot || !ring) return;
  let x = -100, y = -100, rx = -100, ry = -100;
  let lastMove = 0;
  let idleFrames = 0;
  const IDLE_MS = 500; // no pointermove for 500ms -> stop updating styles

  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    lastMove = performance.now();
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('a, button, .skill-group, .post-row, .stat')) ring.classList.add('is-active');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest('a, button, .skill-group, .post-row, .stat')) ring.classList.remove('is-active');
  });

  // Idle-throttled: once no pointermove has landed for ~500ms and
  // the lerped ring has settled, stop touching styles and drop
  // out of the master loop. The next pointermove re-subscribes.
  dot.style.opacity = ring.style.opacity = 1;
  onFrame(function cursorTick() {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    const settled = Math.abs(x - rx) + Math.abs(y - ry) < 0.5;
    if (!settled) idleFrames = 0;
    if (performance.now() - lastMove > IDLE_MS && settled) {
      idleFrames++;
      if (idleFrames > 2) {
        addEventListener('pointermove', function wake() {
          removeEventListener('pointermove', wake);
          idleFrames = 0;
          onFrame(cursorTick);
        }, { passive: true });
        return false; // unsubscribe from the master loop
      }
    }
  });
}

export function initSmoothScroll() {
  if (motionPrefs.reduced) return null; // keep native instant scrolling
  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1.05 });
  // Lenis rides the shared master loop instead of owning its own.
  onFrame((time) => { lenis.raf(time); });
  return lenis;
}

export function initReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-inview');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.tl-item, .reveal').forEach((el) => io.observe(el));
  return io;
}

export function initMagnetic() {
  if (matchMedia('(hover: none)').matches) return;
  if (motionPrefs.reduced) return; // no pointer-driven button translation
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${dx * 0.25}px, ${dy * 0.25}px)`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
}
