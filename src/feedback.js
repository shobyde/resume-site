/* ============================================================
   Feedback - happy micro-interactions
   1. Soft journal press on buttons/links: a gentle settle-down
      scale on pointer press (CSS :active via injected rules).
      Transitions are input-synced AND nulled by the global
      reduced-motion CSS kill switch.
   2. Occasional hand-drawn margin sketches: as a section boundary
      crosses the viewport while the reader is scrolling DOWN,
      a small ink doodle (smiley, sprig, star) fades in/out in
      the section's outer margin. Max 2 per page visit.
   Both features live-gate on motionPrefs: toggling the OS
   setting removes sketches instantly and stops new ones.
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';

/* ---------- hand-drawn ink doodles (stroke SVG, letterpress pen) ---------- */
const SKETCHES = [
  // smiley
  `<svg viewBox='0 0 34 30' width='34' height='30' aria-hidden='true'><g fill='none' stroke='%23505144' stroke-width='1.4' stroke-linecap='round'><circle cx='17' cy='15' r='11'/><circle cx='13' cy='11.5' r='1.1' fill='%23505144' stroke='none'/><circle cx='21' cy='11.5' r='1.1' fill='%23505144' stroke='none'/><path d='M11 18 Q17 23.5 23 18'/></g></svg>`,
  // sprig of leaves
  `<svg viewBox='0 0 24 34' width='24' height='34' aria-hidden='true'><g fill='none' stroke='%23505144' stroke-width='1.4' stroke-linecap='round'><path d='M12 32 Q11 18 12 3'/><path d='M12 10 Q6 8 4.5 3.5 Q10 4.5 12 10Z'/><path d='M12 17 Q18 15 19.5 10.5 Q14 11.5 12 17Z'/><path d='M12 24 Q6 22 4.5 17.5 Q10 18.5 12 24Z'/></g></svg>`,
  // four-point star
  `<svg viewBox='0 0 24 24' width='24' height='24' aria-hidden='true'><g fill='none' stroke='%23505144' stroke-width='1.4' stroke-linecap='round'><path d='M12 3 Q13 10 21 12 Q13 14 12 21 Q11 14 3 12 Q11 10 12 3Z'/></g></svg>`,
];

const style = document.createElement('style');
style.textContent = `
  .margin-sketch {
    position: absolute;
    right: max(1rem, calc((100vw - var(--container-w, 1080px)) / 2 - 4.5rem));
    top: 2.4rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.7s ease, transform 0.9s var(--ease-out);
    transform: rotate(6deg) translateY(-6px);
  }
  .margin-sketch.is-live {
    opacity: 0.55;
    transform: rotate(-2deg) translateY(0);
  }
  .section.contact .margin-sketch { right: auto; left: max(1rem, 8vw); }
  @media (max-width: 900px) { .margin-sketch { display: none; } }
`;
document.head.appendChild(style);

export function initFeedback() {
  // press feel: soft settle-down, applied to every pressable control
  const press = document.createElement('style');
  press.textContent = `
    .btn:active, .nav__link:active, .tag:active, .modal-close:active {
      transform: translateY(2px) scale(0.985);
    }
  `;
  document.head.appendChild(press);

  // margin sketches: intersecting section boundaries, downward-only, <=2 total
  if (motionPrefs.reduced) return;
  let shown = 0;
  let lastY = window.scrollY;
  let raf = 0;
  let prevY = -1;

  const clearAll = () => {
    document.querySelectorAll('.margin-sketch').forEach((s) => s.remove());
  };
  window.addEventListener('motionprefchange', () => {
    if (motionPrefs.reduced) clearAll(); // instant removal, no fade
  });

  const reveal = (section) => {
    if (shown >= 2) return;
    const span = document.createElement('span');
    span.className = 'margin-sketch';
    span.innerHTML = SKETCHES[shown % SKETCHES.length];
    section.appendChild(span);
    shown++;
    requestAnimationFrame(() => span.classList.add('is-live'));
    setTimeout(() => {
      span.classList.remove('is-live'); // fades back out
      setTimeout(() => span.remove(), 800);
    }, 2600);
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || motionPrefs.reduced || shown >= 2) {
        if (!e.isIntersecting) io.unobserve(e.target);
        continue;
      }
      // only while progressing down through the page
      if (window.scrollY <= lastY + 24) continue;
      io.unobserve(e.target);
      reveal(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });

  document.querySelectorAll('.section').forEach((s) => io.observe(s));

  // track reading direction, throttled to rAF
  addEventListener('scroll', () => {
    if (motionPrefs.reduced || raf) return;
    raf = requestAnimationFrame(() => {
      lastY = prevY >= 0 ? prevY : window.scrollY;
      prevY = window.scrollY;
      raf = 0;
    });
  }, { passive: true });
}
