/* ============================================================
   Motion helpers: Lenis smooth scroll, scroll reveals,
   magnetic buttons, reading-progress bar.
   (The old custom-cursor overlay was removed: it hid the
   native cursor and is hostile to keyboard/pointer-finder users.)
   ============================================================ */
import Lenis from 'lenis';
import { motionPrefs } from './motionPrefs.js';

export function initSmoothScroll() {
  if (motionPrefs.reduced) return null;
  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1.05 });
  function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
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
  if (matchMedia('(hover: none)').matches || motionPrefs.reduced) return;
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${dx * 0.15}px, ${dy * 0.15}px)`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
}

export function initProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(scrollY / max, 1) : 0;
    bar.style.transform = `scaleX(${p})`;
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}
