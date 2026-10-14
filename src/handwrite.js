/* ============================================================
   Handwrite - the pen-style reveal engine.

   Replaces per-char opacity flashing (the typewriter signature)
   with a continuous ink sweep:
   - words carry a CSS mask wipe (--hw 0% -> 105%) driven by ONE
     shared rAF loop; nothing else animates the reveal;
   - per-char ink bloom fires as the pen front passes each char's
     leading edge (a sub-effect of the sweep, never an opacity
     flash);
   - a nib dot rides the leading edge of the active word and hides
     whenever the pen lifts;
   - ONE page-wide FIFO: an element only starts writing when the
     previous one finished - nothing ever writes concurrently;
   - scroll-ahead: an element that left the viewport above the
     fold before its turn is settled instantly, not written;
   - prefers-reduced-motion: boot-reduced never mounts a split or
     overlay; a live flip settles everything within a frame.

   QA hook (no-op if absent): window.__handwriteProbe({kind,id,...})
   is called on enqueue/start/char/done/finish/skip;
   window.__handwriteDebug() reports live queue state.
   ============================================================ */
import { motionPrefs } from './motionPrefs.js';
import './styles/handwrite.css';

const BASE_GLYPH_MS = 1000 / 45;  // body sweep: ~45 glyphs/s

let pen = null;                   // the single nib dot element (fixed pos)
let uid = 0;
let rafId = null;
let active = null;                // job currently under the pen
const queue = [];                 // page-wide FIFO
const jobs = new Map();           // el -> job (at most one per element)

/* ---------- personality helpers ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const S = (ms) => Math.round(ms * (active ? active.opts.scale : 1));

/* A word ending in sentence punctuation, a short all-caps scrawl,
   or rare display glyphs gets a longer beat - a hand is not
   metronomic. */
function beatFor(text) {
  if (/[.!?]$/.test(text)) return S(rnd(260, 340));
  if (/[,:]$/.test(text)) return S(rnd(140, 200));
  if (text.length <= 4 && text === text.toUpperCase() && /[A-Z]/.test(text)) return S(rnd(180, 260));
  if (/[·–—]/.test(text)) return S(rnd(140, 220));
  return 0;
}

/* ---------- splitting (markup-preserving) ---------- */
/* Walk TEXT nodes only and rebuild each one in place: inline
   children (span.accent, strong) survive and their inner text
   participates normally. el.textContent rebuilding flattens them -
   never do that here. Returns word meta or null if no text. */
function splitNode(node) {
  const words = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue.trim()) textNodes.push(n);
  }
  for (const tn of textNodes) {
    const parent = tn.parentNode;
    const frag = document.createDocumentFragment();
    for (const token of tn.nodeValue.split(/(\s+)/)) { // keep whitespace
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        // spaces stay real, breakable text nodes BETWEEN word spans
        frag.appendChild(document.createTextNode(' '));
        continue;
      }
      const w = document.createElement('span');
      w.className = 'hw-word hw-wipe';
      w.style.setProperty('--hw', '0%');
      const chars = [];
      for (const ch of token) {
        const c = document.createElement('span');
        c.className = 'hw-char';
        c.textContent = ch;
        w.appendChild(c);
        chars.push(c);
      }
      frag.appendChild(w);
      words.push({ el: w, text: token, chars, fracs: null });
    }
    parent.replaceChild(frag, tn);
  }
  return words.length ? words : null;
}

export function hwSplit(el) {
  el.classList.add('hw-split');
  return splitNode(el);
}

/* QA-only: split a never-wired element and report layout metrics
   before vs after the split (2-frame diff check for drift), then
   restore the element byte-for-byte so live writing is unaffected. */
function debugMeasure(el) {
  const snapshot = el.cloneNode(true);
  const before = el.getBoundingClientRect();
  const words = splitNode(el);
  const after = el.getBoundingClientRect();
  while (el.firstChild) el.removeChild(el.firstChild);
  while (snapshot.firstChild) el.appendChild(snapshot.firstChild);
  return {
    words: words ? words.length : 0,
    before: { w: Math.round(before.width * 100) / 100, h: Math.round(before.height * 100) / 100 },
    after: { w: Math.round(after.width * 100) / 100, h: Math.round(after.height * 100) / 100 },
  };
}

/* ---------- geometry ---------- */
function wordMetrics(w) {
  if (w.fracs) return;
  const total = w.el.getBoundingClientRect().width || 1;
  let acc = 0;
  // leading edge of each char as a 0..1 fraction of word width
  w.fracs = w.chars.map((c) => {
    const start = acc / total;
    acc += c.getBoundingClientRect().width || 0;
    return start;
  });
}

/* ---------- pen dot ---------- */
function ensurePen(color) {
  if (motionPrefs.reduced) return null;
  if (!pen) {
    pen = document.createElement('span');
    pen.className = 'hw-pen';
    pen.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pen);
  }
  if (color) pen.style.color = color;
  return pen;
}
function movePen(wordEl, frac) {
  if (!pen || !wordEl) return;
  const r = wordEl.getBoundingClientRect();
  if (r.width <= 0) return;
  pen.style.transform =
    `translate(${(r.left + r.width * frac).toFixed(1)}px, ${(r.top + r.height * 0.62).toFixed(1)}px)`;
}
function penShow(on) {
  if (pen) pen.classList.toggle('hw-on', !!on);
}

/* ---------- bloom (per-char ink under the sweep) ---------- */
function bloomChar(c, job) {
  c.classList.add('hw-bloom');
  if (Math.random() < 0.10) { // ~10% double-tap: re-inked stroke feel
    job.timers.push(setTimeout(() => {
      if (motionPrefs.reduced || !jobs.has(job.el)) return;
      c.classList.remove('hw-bloom');
      void c.offsetWidth; // restart the bloom animation
      c.classList.add('hw-bloom');
      job.timers.push(setTimeout(() => c.classList.remove('hw-bloom'), 180));
    }, S(rnd(60, 90))));
  } else {
    job.timers.push(setTimeout(() => c.classList.remove('hw-bloom'), 180));
  }
}

/* ---------- queue plumbing ---------- */
function ramp() {
  // >2 elements queued behind the current write: clear the jam
  // so a fast scroller never watches one, up to ~1.8x.
  const depth = Math.max(0, queue.length - 1);
  return depth <= 1 ? 1 : Math.min(1.8, 1 + 0.4 * (depth - 1));
}
function ensureLoop() {
  if (rafId == null && active && !motionPrefs.reduced) rafId = requestAnimationFrame(step);
}

export function hwEnqueue(el, opts = {}) {
  if (!el || motionPrefs.reduced || jobs.has(el) || !el.isConnected) return Promise.resolve();
  const job = {
    el,
    id: opts.id || ((el.id || (typeof el.className === 'string' ? el.className.split(' ')[0] : 'el')) + '#' + uid++),
    words: null, // split happens when the pen lands on THIS element - queued jobs stay unmasked
    wi: 0, ci: 0,
    phase: 'idle',
    started: false,
    t0: 0, dur: 0, resume: null,
    hesDone: false,
    w: 0,
    done: false,
    finishAt: null,
    timers: [],
    opts: { glyphMs: BASE_GLYPH_MS, scale: 1, ...opts },
    promise: null,
    resolve: null,
  };
  job.promise = new Promise((r) => { job.resolve = r; });
  jobs.set(el, job);
  queue.push(job);
  probe({ kind: 'enqueue', id: job.id });
  if (!active) { // take the head immediately
    nextJob();
    ensureLoop();
  }
  return job.promise;
}

function nextJob() {
  const j = queue.shift() || null;
  active = j;
  if (!j) { penShow(false); return; }
  j.phase = 'pre';
  probe({ kind: 'start', id: j.id });
}

/* Scroll-ahead discipline: an element that has fully passed ABOVE
   the viewport before its turn gets settled, not written. */
function offscreenAbove(el) {
  const r = el.getBoundingClientRect();
  return r.bottom < 8; // above the fold line
}

/* ---------- the shared rAF loop ---------- */
const now = () => performance.now();

function startSweep(job, w) {
  wordMetrics(w);
  const n = Math.max(w.text.length, 1);
  job.phase = 'sweep';
  job.t0 = now();
  job.dur = (n * job.opts.glyphMs) / ramp();
  job.hesDone = false;
  job.hesExtra = Math.random() < 0.22 ? S(rnd(90, 160)) : 0; // ~15% mark
  const p = ensurePen(getComputedStyle(job.el).color);
  if (p) { movePen(w.el, 0); penShow(true); }
}

function endPause(job, ms, keepPen, resume) {
  job.phase = 'pause';
  job.t0 = now();
  job.dur = ms;
  job.resume = resume || null;
  if (!keepPen) penShow(false); // pen lifts during the gap
}

function advance(job) {
  job.wi += 1;
  job.ci = 0;
  job.started = true;
  job.phase = job.wi < job.words.length ? 'pre' : 'done';
}

let steps = 0; // QA: per-frame tick counter (prove loop liveness)

function step() {
  rafId = null;
  steps += 1;
  if (motionPrefs.reduced) {
    // Live flip landed mid-write: settle NOW (same frame). The
    // motionprefchange listener does this in real browsers; under
    // some embedders its event never fires, so the loop covers it.
    if (motionPrefs.mq.matches) hwSettleAll();
    return;
  }
  const job = active;
  if (!job) return; // idle: the loop cancels itself, zero residual cost
  if (jobs.get(job.el) !== job) { nextJob(); ensureLoop(); return; }
  if (!job.el.isConnected) { // SPA route swap detached the page mid-write:
    hwSettle(job.el);        // skip instead of animating invisible DOM
    probe({ kind: 'skip', id: job.id, why: 'detached' });
    nextJob();
    ensureLoop();
    return;
  }
  const t = now();

  if (job.phase === 'pre') {
    if (!job.started) {
      if (offscreenAbove(job.el)) { // scroll-ahead: no show, just ink it
        hwSettle(job.el);
        probe({ kind: 'skip', id: job.id });
        nextJob();
        if (active) rafId = requestAnimationFrame(step);
        return;
      }
      if (!job.words) { // the pen lands: split NOW (queued jobs stay unmasked)
        job.words = hwSplit(job.el);
        if (!job.words) { // no writable text: settle and move on
          hwSettle(job.el);
          probe({ kind: 'skip', id: job.id });
          nextJob();
          if (active) rafId = requestAnimationFrame(step);
          return;
        }
      }
      job.started = true;
      startSweep(job, job.words[0]); // first word: the pen lands, no gap before it
    } else {
      // pen lift at every whitespace gap, then land on THIS word
      endPause(job, S(rnd(40, 90)), false, () => startSweep(job, job.words[job.wi]));
    }
  } else if (job.phase === 'sweep') {
    const w = job.words[job.wi];
    const x = Math.min((t - job.t0) / job.dur, 1);
    const p = (1 - (1 - x) * (1 - x)) * 105; // out-quad: eases off at word end
    if (job.hesExtra && !job.hesDone && p >= 15) {
      // hesitation beat ~15% into the word: pen stops, ink keeps drying
      job.hesDone = true;
      job.w = p;
      w.el.style.setProperty('--hw', p.toFixed(1) + '%');
      movePen(w.el, p / 105);
      inkThrough(job, w, p);
      const frac = p / 105;
      endPause(job, job.hesExtra, true);
      job.resume = () => {
        job.phase = 'sweep';
        // resume the sweep exactly where it stopped
        const x0 = 1 - Math.sqrt(Math.max(0, 1 - frac));
        job.t0 = now() - x0 * job.dur;
      };
    } else {
      job.w = p;
      w.el.style.setProperty('--hw', p.toFixed(1) + '%');
      movePen(w.el, p / 105);
      inkThrough(job, w, p);
      if (x >= 1) finishWord(job, w);
    }
  } else if (job.phase === 'pause') {
    if (t - job.t0 >= job.dur) {
      const r = job.resume;
      job.resume = null;
      if (r) r();
      else if (job.phase !== 'done') advance(job); // default: next word
    }
  }

  if (job.phase === 'done') {
    finishJob(job);
  }
  ensureLoop();
}

/* fire blooms for every char whose leading edge the pen passed */
function inkThrough(job, w, p) {
  if (!w.fracs) return;
  while (job.ci < w.chars.length && w.fracs[job.ci] * 105 <= p) {
    bloomChar(w.chars[job.ci], job);
    job.ci += 1;
    probe({ kind: 'char', id: job.id, word: job.wi, char: job.ci - 1 });
  }
}

function finishWord(job, w) {
  w.el.style.setProperty('--hw', '105%');
  inkThrough(job, w, 105); // nothing left un-bloomed
  penShow(false);
  if (job.wi === job.words.length - 1) {
    job.done = true;
    job.finishAt = now();
    probe({ kind: 'done', id: job.id });
    endPause(job, S(rnd(180, 260)), false, () => { job.phase = 'done'; }); // settle
  } else {
    const beat = beatFor(w.text);
    if (beat) endPause(job, beat, false, () => advance(job));
    else advance(job); // the 'pre' phase adds the pen-lift gap itself
  }
}

function finishJob(job) {
  hwSettle(job.el);
  probe({ kind: 'finish', id: job.id });
  nextJob();
  ensureLoop();
}

/* ---------- settling ---------- */
/* Fully ink the element and tear down all per-frame state: masks
   removed entirely (mask:none), no wipes, no blooms, no timers. */
export function hwSettle(el) {
  const job = jobs.get(el);
  if (job) {
    jobs.delete(el);
    job.timers.forEach(clearTimeout);
    job.timers.length = 0;
    const idx = queue.indexOf(job);
    if (idx >= 0) queue.splice(idx, 1);
    if (active === job) active = null;
    if (job.resolve) { job.resolve(); job.resolve = null; }
  }
  el.querySelectorAll('.hw-word').forEach((w) => {
    w.classList.remove('hw-wipe');
    w.style.removeProperty('--hw');
    w.style.maskImage = 'none';
    w.style.webkitMaskImage = 'none';
    w.querySelectorAll('.hw-bloom').forEach((c) => c.classList.remove('hw-bloom'));
  });
  el.classList.remove('hw-split');
}

/* Live reduced-motion flip: clear ALL masks instantly, settle
   chars, remove the pen dot, clear timers. hwSettle covers every
   registered job (active + queued); the .hw-split/.hw-wipe sweeps
   below catch anything split outside the queue bookkeeping. */
function hwSettleAll() {
  for (const job of [...jobs.values()]) hwSettle(job.el);
  document.querySelectorAll('.hw-split').forEach((el) => hwSettle(el));
  document.querySelectorAll('.hw-wipe').forEach((w) => {
    w.classList.remove('hw-wipe');
    w.style.removeProperty('--hw');
    w.style.maskImage = 'none';
    w.style.webkitMaskImage = 'none';
  });
  document.querySelectorAll('.hw-bloom').forEach((c) => c.classList.remove('hw-bloom'));
  queue.length = 0;
  active = null;
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  if (pen) { pen.remove(); pen = null; }
}
window.addEventListener('motionprefchange', () => {
  if (motionPrefs.reduced) hwSettleAll();
});

/* ---------- QA debug surface ---------- */
function probe(data) {
  if (typeof window.__handwriteProbe === 'function') {
    try { window.__handwriteProbe(data); } catch { /* QA hook must never break the page */ }
  }
}
window.__handwriteDebug = () => {
  return {
    reduced: motionPrefs.reduced,
    queue: queue.map((j) => j.id),
    active: active && {
      id: active.id,
      phase: active.phase,
      word: active.wi,
      words: active.words ? active.words.length : 0,
      progress: Number((active.w / 105).toFixed(3)),
      finishedAt: active.finishAt != null ? Math.round(active.finishAt) : null,
    },
    pendingJobs: jobs.size,
    rafPending: rafId != null, // engine's own rAF - must be false when idle
    steps, // loop liveness: this must grow every frame while writing
    // the concurrency invariant: elements with a live sweep/pause
    // (queued-but-not-started jobs hold phase 'idle' - unmasked, and
    // the pen is only ever on one element at a time).
    writingElements: (() => {
      let n = 0;
      for (const j of jobs.values()) if (j.phase !== 'idle') n += 1;
      return n;
    })(),
    maskedWords: (() => {
      let n = 0;
      for (const j of jobs.values()) n += j.el.querySelectorAll('.hw-wipe').length;
      return n;
    })(),
  };
};
window.__hwDebugMeasure = debugMeasure; // QA helper kept off the plain-data debug object

export const hwWrite = hwEnqueue; // promise-resolving convenience for hero choreography

// Hero sweep tuning: big glyphs a touch slower, long lines faster to
// land the whole hero sequence inside the 3.2s budget; hand-pauses
// scaled down so the beats stay felt but don't eat the budget.
export const HW_HERO_OPTS = { glyphMs: 1000 / 100, scale: 0.2 };
