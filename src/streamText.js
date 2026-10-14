/* ============================================================
   StreamText - body copy is WRITTEN by the handwrite pen engine
   as it scrolls into view. The old per-char opacity cascade read
   as typing; reveals now enqueue into the ONE page-wide writing
   FIFO in handwrite.js, so two paragraphs never write at once
   and each one arrives as a continuous pen sweep with hand
   pauses.

   prefers-reduced-motion: no split/mask is ever mounted - copy
   stays plain text, fully visible. Toggling the OS setting live
   settles every in-flight write instantly (handled inside
   handwrite.js's motionprefchange listener).
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';
import { hwEnqueue, hwSettle } from './handwrite.js';

export function initStreamText() {
  if (motionPrefs.reduced) return; // copy stays plain + fully visible

  const targets = [...document.querySelectorAll(
    '.about__text p, .section-sub, .tl-item__bullets li'
  )];

  // Reveal via IntersectionObserver instead of a per-frame position
  // check: IO only fires at actual scroll intersections (and matches
  // Lenis, which moves real scrollY - no need for per-frame polling).
  // On intersect the element ENQUEUES into the shared writing FIFO;
  // it starts only when everything queued ahead of it has finished.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      if (motionPrefs.reduced) { showAllInstant(e.target); continue; }
      hwEnqueue(e.target); // scroll-past-at-head is settled instantly by the engine
    }
  }, { rootMargin: '0px 0px -15% 0px', threshold: 0 });
  targets.forEach((el) => io.observe(el));
}

// Live short-circuit for anything already split when motionPrefs
// flips to reduced mid-session: settle instantly (hwSettle also
// resolves/cancels its queue job, and clears masks + timers).
function showAllInstant(el) {
  hwSettle(el);
}

/* ---------- parallax drift for hero text during scroll ---------- */
export function initScrollStream() {
  if (motionPrefs.reduced) return; // no scroll-driven translation
  const els = [...document.querySelectorAll('.hero__role')];
  if (!els.length) return;

  let sc = 0;
  let rafPending = false;
  let fullyFaded = false; // hero text is out of view (opacity 0) -> skip writes
  // Cache once - recompute only on resize, not on every scroll event.
  let scrollRange = document.body.scrollHeight - innerHeight;

  function apply() {
    rafPending = false;
    // Beyond sc>=0.4 this element's opacity is pinned at 0 and the hero is
    // far above the viewport - its transform/opacity no longer affect any
    // visible pixels, so stop writing styles until we scroll back up.
    if (sc >= 0.4) {
      if (!fullyFaded) {
        fullyFaded = true;
        for (let i = 0; i < els.length; i++) {
          els[i].style.transform = 'translateY(16px)';
          els[i].style.opacity = '0';
        }
      }
      return;
    }
    fullyFaded = false;
    for (let i = 0; i < els.length; i++) {
      els[i].style.transform = `translateY(${sc * 40 * (i + 1)}px)`;
      els[i].style.opacity = String(Math.max(0, Math.min(1, 1 - sc * 2.5)));
    }
  }

  // Batch: scroll events can fire more often than frames - coalesce
  // writes into one rAF callback instead of per-event style writes.
  const onScroll = () => {
    if (motionPrefs.reduced) return; // live gate: ignore scroll while reduced
    sc = window.scrollY / (scrollRange || 1);
    if (!rafPending) { rafPending = true; requestAnimationFrame(apply); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => {
    scrollRange = document.body.scrollHeight - innerHeight;
  }, { passive: true });

  // If reduced motion is turned on mid-session, undo any parallax
  // already applied and make the text fully visible (the handwrite
  // engine settles its own in-flight writes on the same event).
  window.addEventListener('motionprefchange', () => {
    if (motionPrefs.reduced) {
      els.forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
    }
  });
}
