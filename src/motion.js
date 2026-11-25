/* ============================================================
   Motion - the page should feel alive, not perform.
   Reveals on entry and one reading-progress hairline.
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';

export function initReveals() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;

  if (motionPrefs.reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-inview'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-inview');
      io.unobserve(entry.target);
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });

  items.forEach((el) => io.observe(el));
}

export function initProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;

  let queued = false;
  const paint = () => {
    queued = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = `scaleY(${value.toFixed(4)})`;
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();
}
