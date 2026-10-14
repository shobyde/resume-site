/* ============================================================
   StreamText - sentences reveal char-by-char ("streaming-in")
   Deferred splitting: only split elements when they approach
   the viewport, so initial page load / scroll stay light.
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';

function splitChars(el) {
  const text = el.textContent;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  const spans = [];
  const words = text.split(/(\s+)/);
  for (const token of words) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { frag.appendChild(document.createTextNode(' ')); continue; }
    const w = document.createElement('span');
    w.className = 'stream-word';
    w.style.display = 'inline-block';
    w.style.whiteSpace = 'pre';
    for (const ch of token) {
      const s = document.createElement('span');
      s.className = 'stream-ch';
      s.textContent = ch;
      s.style.opacity = '0';
      s.style.willChange = 'opacity';
      w.appendChild(s);
      spans.push(s);
    }
    frag.appendChild(w);
  }
  el.appendChild(frag);
  return spans;
}

export function initStreamText() {
  if (motionPrefs.reduced) return; // text stays fully visible, no per-char fade
  const els = [...document.querySelectorAll('.about__text p, .section-sub, .tl-item__bullets li')];
  // split up front so characters start hidden (no flash of full text)
  const map = new Map(els.map((el) => [el, { el, chars: splitChars(el), done: false }]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = map.get(e.target);
      if (!t || t.done) continue;
      t.done = true;
      const chars = t.chars;
      requestAnimationFrame(() => {
        for (let i = 0; i < chars.length; i++) {
          chars[i].style.transition = `opacity 0.15s ease ${Math.min(i * 3, 320)}ms`;
          chars[i].style.opacity = '1';
        }
        for (const c of chars) c.style.willChange = 'auto';
      });
      io.unobserve(e.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
  for (const el of els) io.observe(el);
}

export function initScrollStream() {
  if (motionPrefs.reduced) return;
  const els = document.querySelectorAll('.hero__role');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sc = window.scrollY / Math.max(1, (document.body.scrollHeight - innerHeight));
      els.forEach((el, i) => {
        el.style.transform = `translateY(${sc * 40 * (i + 1)}px)`;
        el.style.opacity = String(Math.max(0, Math.min(1, 1 - sc * 2.5)));
      });
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  return onScroll;
}
