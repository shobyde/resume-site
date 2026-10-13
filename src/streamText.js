/* ============================================================
   StreamText — sentences reveal char-by-char ("streaming-in")
   driven by scroll progress into the viewport, like an LLM
   emitting deltas.
   ============================================================ */

const STREAM_CLASS = 'stream-text';

function splitChars(el) {
  // wrap each char in a span (preserve spaces), remember original text
  const text = el.textContent;
  el.dataset.original = text;
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
  const targets = document.querySelectorAll(
    '.about__text p, .section-sub, .tl-item__bullets li, .modal__body p'
  );
  const state = new WeakMap();

  targets.forEach((el) => {
    const chars = splitChars(el);
    state.set(el, { chars, played: 0 });
  });

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const { chars, played } = state.get(e.target) || {};
      if (!chars || played) continue;
      state.get(e.target).played = 1;
      // stream the chars in fast, staggered like LLM deltas
      chars.forEach((c, i) => {
        c.style.transition = `opacity 0.18s ease ${Math.min(i * 4, 350)}ms`;
        setTimeout(() => { c.style.opacity = '1'; }, Math.min(i * 4, 350));
      });
      io.unobserve(e.target);
    }
  }, { threshold: 0.35 });

  targets.forEach((el) => io.observe(el));
  return io;
}

/* ---------- scroll-linked variant: opacity follows scroll position ---------- */
export function initScrollStream() {
  // For hero/large text: fade chars based on scroll progress (streaming as you read)
  const els = document.querySelectorAll('.hero__role');
  const onScroll = () => {
    const sc = window.scrollY / (document.body.scrollHeight - innerHeight);
    // parallax-shift hero text per scroll depth to feel "alive"
    els.forEach((el, i) => {
      el.style.transform = `translateY(${sc * 40 * (i + 1)}px)`;
      el.style.opacity = String(Math.max(0, Math.min(1, 1 - sc * 2.5)));
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  return onScroll;
}
