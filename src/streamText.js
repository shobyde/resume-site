/* ============================================================
   StreamText - sentences reveal char-by-char ("streaming-in")
   as they scroll into view, like an LLM emitting deltas.
   Reveals via IntersectionObserver (no per-frame layout reads).

   prefers-reduced-motion: the split/stagger never happens -
   copy stays as plain text, fully visible. Toggling the OS
   setting live completes any in-flight reveal instantly and
   stops the hero scroll parallax.
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';

// Split into word spans containing char spans. Spaces stay as
// real, breakable text nodes BETWEEN word spans - wrapping an
// element's chars individually with &nbsp; makes <p> render as
// one unbreakable line (no word wrap).
function splitChars(el) {
  const text = el.textContent;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  const spans = [];

  const words = text.split(/(\s+)/); // keep whitespace tokens
  for (const token of words) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      frag.appendChild(document.createTextNode(' '));
      continue;
    }
    const w = document.createElement('span');
    w.className = 'stream-word';
    w.style.display = 'inline-block'; // wrap word as a unit
    w.style.whiteSpace = 'pre';
    for (const ch of token) {
      const s = document.createElement('span');
      s.className = 'stream-ch';
      s.textContent = ch;
      s.style.opacity = '0';
      w.appendChild(s);
      spans.push(s);
    }
    frag.appendChild(w);
  }
  el.appendChild(frag);
  return spans;
}

// Pending reveal state, so the live reduced-motion listener can
// short-circuit: timers are tracked and cleared per element.
const pending = [];

export function initStreamText() {
  if (motionPrefs.reduced) return; // copy stays plain + fully visible

  const targets = [...document.querySelectorAll(
    '.about__text p, .section-sub, .tl-item__bullets li'
  )].map((el) => ({ el, chars: splitChars(el) }));

  // Reveal via IntersectionObserver instead of a per-frame position
  // check: the old watcher called getBoundingClientRect() on every
  // pending element every animation frame, forcing a full layout read
  // 60x/second even when the page was idle at the top. IO only fires
  // at actual scroll intersections (and matches Lenis, which moves
  // real scrollY - no need for per-frame polling).
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      if (motionPrefs.reduced) { showAllInstant(e.target); continue; }
      const t = targets.find((t) => t.el === e.target);
      if (!t) continue;
      const timers = [];
      t.chars.forEach((c, i) => {
        const d = Math.min(i * 3, 320);
        c.style.transition = `opacity 0.15s ease`;
        timers.push(setTimeout(() => { c.style.opacity = '1'; }, d));
      });
      pending.push({ el: t.el, timers });
    }
  }, { rootMargin: '0px 0px -15% 0px', threshold: 0 });
  targets.forEach((t) => io.observe(t.el));
}

function showAllInstant(el) {
  el.querySelectorAll('.stream-ch').forEach((c) => { c.style.opacity = '1'; });
}

/* ---------- parallax drift for hero text during scroll ---------- */
export function initScrollStream() {
  if (motionPrefs.reduced) return; // no scroll-driven translation
  const els = [...document.querySelectorAll('.hero__role')];
  if (!els.length) return;

  let sc = 0;
  let rafPending = false;
  // Cache once - recompute only on resize, not on every scroll event.
  let scrollRange = document.body.scrollHeight - innerHeight;

  function apply() {
    rafPending = false;
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
  // already applied and make the text fully visible.
  window.addEventListener('motionprefchange', () => {
    if (motionPrefs.reduced) {
      els.forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
      for (const { el, timers } of pending.splice(0)) {
        timers.forEach(clearTimeout);
        showAllInstant(el);
      }
    }
  });
}
