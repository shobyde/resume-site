/* ============================================================
   StreamText — sentences reveal char-by-char ("streaming-in")
   as they scroll into view, like an LLM emitting deltas.
   Position-checked every animation frame (works with Lenis).
   ============================================================ */

function splitChars(el) {
  const text = el.textContent;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'stream-ch';
    s.textContent = ch === ' ' ? '\u00A0' : ch;
    s.style.opacity = '0';
    frag.appendChild(s);
  }
  el.appendChild(frag);
  return [...el.querySelectorAll('.stream-ch')];
}

export function initStreamText() {
  const targets = [...document.querySelectorAll(
    '.about__text p, .section-sub, .tl-item__bullets li'
  )].map((el) => ({ el, chars: splitChars(el), done: false }));

  let pending = targets.filter((t) => t.el);
  function tick() {
    requestAnimationFrame(tick);
    if (!pending.length) return;
    const vh = innerHeight;
    pending = pending.filter((t) => {
      const r = t.el.getBoundingClientRect();
      // reveal when element is comfortably inside the viewport
      if (r.top < vh * 0.85 && r.bottom > 0) {
        t.chars.forEach((c, i) => {
          const d = Math.min(i * 3, 320);
          c.style.transition = `opacity 0.15s ease`;
          setTimeout(() => { c.style.opacity = '1'; }, d);
        });
        return false; // remove from pending
      }
      return true; // keep watching
    });
  }
  tick();
}

/* ---------- parallax drift for hero text during scroll ---------- */
export function initScrollStream() {
  const els = document.querySelectorAll('.hero__role');
  const onScroll = () => {
    const sc = window.scrollY / (document.body.scrollHeight - innerHeight);
    els.forEach((el, i) => {
      el.style.transform = `translateY(${sc * 40 * (i + 1)}px)`;
      el.style.opacity = String(Math.max(0, Math.min(1, 1 - sc * 2.5)));
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  return onScroll;
}
