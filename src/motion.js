/* ============================================================
   Motion helpers: custom cursor, Lenis smooth scroll, reveals
   ============================================================ */
import Lenis from 'lenis';

export function initCursor() {
  if (matchMedia('(hover: none)').matches) return;
  const dot = document.getElementById('cursor');
  const ring = document.getElementById('cursorRing');
  let x = -100, y = -100, rx = -100, ry = -100;

  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('a, button, .skill-group, .post-card, .stat')) ring.classList.add('is-active');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest('a, button, .skill-group, .post-card, .stat')) ring.classList.remove('is-active');
  });

  (function loop() {
    requestAnimationFrame(loop);
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
  })();
  dot.style.opacity = ring.style.opacity = 1;
}

export function initSmoothScroll() {
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
  if (matchMedia('(hover: none)').matches) return;
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
