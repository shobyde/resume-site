/* ============================================================
   StreamText — sentences reveal char-by-char ("streaming-in")
   as they scroll into view, like an LLM emitting deltas.
   Position-checked every animation frame (works with Lenis).
   ============================================================ */

// Split into word spans containing char spans. Spaces stay as
// real, breakable text nodes BETWEEN word spans — wrapping an
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
