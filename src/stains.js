/* ============================================================
   Parchment stains layer - coffee rings + water/tide marks
   kanban t_07a2ae7a (T2). One self-contained module: injects its
   own <svg id="stains"> + <defs> filters into document.body and
   draws 3-4 coffee-cup rim rings + 1-2 tide marks spread over the
   FULL document height. LOADED VIA `import './stains.js';` in
   main.js (side-effect import - the one file outside this module
   the feature needs; kept out of index.html per spec).

   Design contract:
   - Multiply-blended dark-brown ink so stains read as saturated
     paper fiber on ANY light ground (the parchment token flip in
     T3 lands on top of this; nothing here is tuned to #1a1714).
     NOTE for T3/T4: on the current dark bg, multiply ink at spec
     alphas is sub-quantum BY PHYSICS (calibrated: 0.10 alpha
     shows 0.0039 luma, 0.031 shows 0.0000 on #1a1714). The stains
     are verified plate-correct on the #f2ead8 parchment family;
     their visibility arrives with T3's paper flip, unmodified.
   - Layer order: #bg3d (z0) < #stains (z0, later in DOM) < .site
     (z1). Stains print onto the WebGL ground, sit behind all copy.
   - Static forever: zero rAF, zero per-frame cost, exempt from
     motionPrefs. Relayout happens ONLY on resize / document-height
     change (debounced 150ms), re-derived from the SAME seed, so a
     resize never reshuffles the visit's stain layout.
   - Deterministic per page load: one module-seeded LCG
     (Math.random()*2**32|0 at import time) drives every dimension,
     angle, opacity and position. No raw Math.random() in layout.
   - Placement rules (spec): band-stratified ring slots (ring i
     draws y inside its i-th doc slice, Tier B prefers that slice's
     text-free gap) guarantee doc-wide top-to-bottom spread on any
     seed. Desktop centers live in the outer gutters outside the
     measured text column (full box avoidance); fallback tiers use
     vertical gaps between text blocks, then a tiny alpha-capped
     ring. Mobile (<768px) centers stay out of the 20-80% x-band,
     everything 0.7x size / 0.8x opacity. Stains in the top 90vh
     (hero zone) are alpha-capped, never full-strength.
   - Lives OUTSIDE #app on purpose: main.js replaces #app's
     innerHTML and the blog router toggles views inside it; a
     body-level sibling survives both.
   ============================================================ */

const SEED = (Math.random() * 2 ** 32) | 0;

/* Classic LCG (Numerical Recipes constants). Returns a draw() in [0,1). */
function makeLcg(seed) {
  let s = seed >>> 0;
  return function draw() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---- tunables (SUBTLE tier) ---- */
const RING = {
  strokeColors: ['#6b3e1e', '#7a4526'],     // warm sepia family
  bloomRGB: [122, 69, 38],                  // rgba(122,69,38, a) interior
  edgeOp: [0.10, 0.18],
  bloomOp: [0.04, 0.055],
  dropOp: [0.08, 0.14],
  strokeWidth: [1.5, 3.0],
  dia: [96, 150],                           // desktop ring diameter range
  minDia: 72,                               // smallest gutter ring worth inking
};
const TIDE = {
  color: '#8a6a3e',
  op: [0.05, 0.10],
  w: [200, 420],
  h: [20, 50],
};
const CLEAR = 10;          // clearance between stain box and any text box (covers displacement bleed)
const MIN_PAIR_DIST = 420; // min center-to-center distance between stains
const EDGE_PAD = 6;        // keep stain boxes this far off the canvas edges
const NAV_STRIP = 130;     // nothing renders this far down: keeps the fixed nav pill clean
const BLEED = 28;          // displacement can shift ink up to ~2x scale px; keep-out expands by this

/* SVG turbulence filters, defined once, referenced per stain.
   Displacement makes every edge organic; the seed is LCG-derived so
   the noise field is stable within a visit, fresh across visits. */
const FILTERS = (seedN) => `
  <filter id="stainsTurbFine" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.021 0.034" numOctaves="2" seed="${seedN}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="stainsTurbCoarse" x="-12%" y="-30%" width="124%" height="160%">
    <feTurbulence type="fractalNoise" baseFrequency="0.009 0.02" numOctaves="2" seed="${(seedN + 7) >>> 0}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="13" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;

const STYLE = `
  #stains {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;                /* #bg3d is z0 earlier in DOM; .site is z1 */
    pointer-events: none;
    mix-blend-mode: multiply;  /* ink soaks INTO the ground, not on top */
    overflow: visible;
  }`;

/* ---------- helpers ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
const range = (rng, [lo, hi]) => lerp(lo, hi, rng());

/* Irregular ring outline: jittered-radii closed path around (cx, cy).
   Two slow sine harmonics + per-vertex noise make it read as a cup
   rim set down by hand, never a compass circle. */
function ringPath(rng, cx, cy, r) {
  const a1 = lerp(0.05, 0.11, rng()), p1 = rng() * Math.PI * 2;
  const a2 = lerp(0.02, 0.05, rng()), p2 = rng() * Math.PI * 2;
  const n = 56;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const rr = r * (1 + a1 * Math.sin(3 * th + p1) + a2 * Math.sin(5 * th + p2)) + (rng() - 0.5) * r * 0.045;
    pts.push([cx + rr * Math.cos(th), cy + rr * Math.sin(th)]);
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const [x, y] = pts[i % n];
    const [px, py] = pts[(i - 1) % n];
    const mx = (px + x) / 2, my = (py + y) / 2;
    d += ` Q ${px.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d + ' Z';
}

/* Elongated horizontal smear: wobbly top/bottom edges, tapered ends.
   Always horizontal - height is the noise, not a rotated rectangle. */
function tidePath(rng, cx, cy, w, h) {
  const n = 14, hw = w / 2, hh = h / 2;
  const wob = [];
  for (let i = 0; i <= n; i++) wob.push((rng() - 0.5) * h * 0.34);
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = cx - hw + w * t;
    const taper = Math.sin(Math.PI * t) ** 0.7; // ends pull thin
    top.push([x, cy - hh * taper + wob[i] * taper]);
    bot.push([x, cy + hh * taper + wob[(i + 3) % (n + 1)] * taper]);
  }
  let d = `M ${top[0][0].toFixed(1)} ${top[0][1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) d += ` L ${top[i][0].toFixed(1)} ${top[i][1].toFixed(1)}`;
  for (let i = n; i >= 0; i--) d += ` L ${bot[i][0].toFixed(1)} ${bot[i][1].toFixed(1)}`;
  return d + ' Z';
}

/* ---------- geometry / placement ---------- */
function measure() {
  const vw = document.documentElement.clientWidth;
  const docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  const vh = window.innerHeight;
  const hero = document.querySelector('.hero');
  let heroBottom = vh * 0.9; // fallback: hero hidden (post view) or not yet laid out
  if (hero && hero.offsetHeight > 0) {
    // offset chain: layout position, NOT affectable by reveal transforms
    let x = 0, y = 0, n = hero;
    while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    heroBottom = y + hero.offsetHeight;
  }
  return { vw, docH, vh, heroBottom, mobile: vw < 768 };
}

/* Every readable block the ink must not fog. Uses offset* layout
   coords (transform-independent) so pre-reveal translateY on
   .reveal/.tl-item can't skew the keep-out map, and so a stain placed
   against a not-yet-revealed block stays put after it reveals.
   getBoundingClientRect() WOULD include the reveal transform. */
function textRects() {
  const els = document.querySelectorAll(
    '.container p, .container li, .container h1, .container h2, .container h3, ' +
    '.hero p, .hero h1, .postview p, .postview li, .postview h1, .postview h2, .postview h3, ' +
    'footer p, footer div'
  );
  const rects = [];
  els.forEach((el) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w < 4 || h < 4) return; // hidden (display:none ancestors) or empty
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return; // display:none
    let x = 0, y = 0, n = el;
    while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    rects.push({
      x1: x - CLEAR - BLEED, y1: y - CLEAR - BLEED,
      x2: x + w + CLEAR + BLEED, y2: y + h + CLEAR + BLEED,
    });
  });
  return rects;
}

const hitsText = (rects, x1, y1, x2, y2) =>
  rects.some((t) => x1 < t.x2 && x2 > t.x1 && y1 < t.y2 && y2 > t.y1);

/* Free horizontal y-intervals (section paddings, inter-block gaps) -
   the preferred home for stains that can't fit the outer gutters. */
function freeBands(rects, from, to) {
  const spans = rects.map((t) => [t.y1, t.y2])
    .filter(([a, b]) => b > from && a < to)
    .sort((a, b) => a[0] - b[0]);
  const bands = [];
  let cur = from;
  for (const [a, b] of spans) {
    if (a - cur >= 66) bands.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (to - cur >= 66) bands.push([cur, to]);
  return bands;
}

/* Opacity cap: 0.5x inside the top-90vh hero zone (spec: excluded from
   HIGH-opacity placement), 0.6x when a stain box grazes copy anyway,
   1x otherwise. Keeps glyph-region luma delta inside budget. */
function makeCapFor(heroCapY) {
  return (cy, grazes) => (cy < heroCapY ? 0.5 : grazes ? 0.6 : 1);
}

/* Build every stain for one layout pass. rng is re-seeded per pass, so
   a relayout at unchanged dimensions reproduces geometry exactly. */
function layout() {
  const { vw, docH, vh, heroBottom, mobile } = measure();
  const rects = textRects();
  const rng = makeLcg(SEED);
  const sizeF = mobile ? 0.7 : 1;
  const opF = mobile ? 0.8 : 1;

  let colLeft = Infinity, colRight = -Infinity;
  for (const t of rects) {
    colLeft = Math.min(colLeft, t.x1);
    colRight = Math.max(colRight, t.x2);
  }
  if (!isFinite(colLeft)) { colLeft = vw * 0.5; colRight = vw * 0.5; }

  const nRings = Math.min(4, Math.max(3, Math.round(docH / 1000)));
  const nTides = Math.min(2, Math.max(1, Math.round(docH / 1400)));
  const stains = [];

  const yLo = Math.max(CLEAR + 20, NAV_STRIP);
  const yHi = Math.max(yLo + 1, docH - 100);
  const capFor = makeCapFor(Math.min(heroBottom, vh * 0.9));

  const tooClose = (x, y) => stains.some((s) => Math.hypot(s.cx - x, s.cy - y) < MIN_PAIR_DIST);
  const boxHits = (cx, cy, r, pad) =>
    hitsText(rects, cx - r - pad, cy - r - pad, cx + r + pad, cy + r + pad);

  /* ---- coffee rings ---- */
  for (let i = 0; i < nRings; i++) {
    let placed = null, cap = 1;

    if (mobile) {
      /* Centers confined to the outer 4-20% / 80-96% x-bands (spec:
         no ring center inside the 20-80% band). Boxes may graze copy
         at 0.8x opacity - the luma budget covers it. Ring i's center
         is stratified into its i-th y-slice (desktop parity). */
      for (let a = 0; a < 50 && !placed; a++) {
        const dia = range(rng, RING.dia) * sizeF;
        const r = dia / 2;
        const left = rng() < 0.5;
        const lo = left ? Math.max(vw * 0.04, EDGE_PAD) : vw * 0.80;
        const hi = left ? vw * 0.20 : Math.min(vw * 0.96, vw - EDGE_PAD);
        if (hi - lo < 8) continue;
        const cx = lerp(lo, hi, rng());
        const bl = yLo + (yHi - yLo) * (i / nRings);
        const bh = yLo + (yHi - yLo) * ((i + 1) / nRings);
        const cy = bl + rng() * Math.max(1, bh - bl);
        if (cy > docH - 40 || tooClose(cx, cy)) continue;
        placed = { kind: 'ring', cx, cy, r };
        cap = capFor(cy, boxHits(cx, cy, r, 8));
      }
    } else {
      /* Tier A: full-box avoidance in the outer gutters. Skipped when the
         gutter can't host at least a MinDia-sized ring (then Tier B's
         section-gap bands carry the full 96-150 rim instead of every cup
         shrinking to the ~60px the gutter fits). */
      for (let a = 0; a < 30 && !placed; a++) {
        const left = rng() < 0.5;
        const spanLo = left ? EDGE_PAD : colRight + CLEAR;
        const spanHi = left ? colLeft - CLEAR : vw - EDGE_PAD;
        const span = spanHi - spanLo;
        if (span < 40 || span * 0.9 < RING.minDia) continue;
        const dia = Math.min(range(rng, RING.dia), span * 0.9);
        const r = dia / 2;
        const cx = spanLo + r + rng() * Math.max(0, span - dia);
        /* band-stratified: ring i samples y only inside its i-th slice of
           the doc, so 3-4 rings always spread across the full document
           height (seeded LCG keeps the within-band draw random) */
        const bl = yLo + (yHi - yLo) * (i / nRings);
        const bh = yLo + (yHi - yLo) * ((i + 1) / nRings);
        const cy = bl + rng() * Math.max(1, bh - bl);
        if (cx - r - 8 < -2 || cx + r + 8 > vw + 2 || cy + r + 8 > docH - 40) continue;
        if (boxHits(cx, cy, r, 0)) continue; // rects already carry CLEAR
        if (tooClose(cx, cy)) continue;
        placed = { kind: 'ring', cx, cy, r };
        cap = capFor(cy, false);
      }
      /* Tier B: vertical gap between text blocks, x free in [4%,96%].
         Bands intersecting ring i's stratified y-slice are preferred so
         the top-to-bottom spread contract survives even when Tier A
         couldn't fit the full box in the gutter. */
      if (!placed) {
        const bands = freeBands(rects, yLo, yHi).filter(([b1, b2]) => b2 - b1 >= 80);
        const bl2 = yLo + (yHi - yLo) * (i / nRings);
        const bh2 = yLo + (yHi - yLo) * ((i + 1) / nRings);
        const prio = bands.filter(([b1, b2]) => b2 > bl2 && b1 < bh2);
        const useBands = prio.length ? prio : bands;
        for (let a = 0; a < 20 && !placed && useBands.length; a++) {
          const [b1, b2] = useBands[Math.floor(rng() * useBands.length)];
          const dia = Math.min(range(rng, RING.dia), 96, b2 - b1 - 8);
          const r = dia / 2;
          const cx = lerp(vw * 0.04 + r, vw * 0.96 - r, rng());
          const cy = lerp(b1 + r + 4, b2 - r - 4, rng());
          if (cy < yLo || cy > yHi || tooClose(cx, cy)) continue;
          if (boxHits(cx, cy, r, 0)) continue;
          placed = { kind: 'ring', cx, cy, r };
          cap = capFor(cy, false);
        }
      }
      /* Tier C: <= 72px ring, gutter centroid only, alpha-capped (cap is
         clamped >= 0.38 in render() so edges stay inside the visible
         plate portion of the spec's 0.10-0.18 band). */
      if (!placed) {
        for (let a = 0; a < 15 && !placed; a++) {
          const left = rng() < 0.5;
          const spanLo = left ? EDGE_PAD : colRight + CLEAR;
          const spanHi = left ? colLeft - CLEAR : vw - EDGE_PAD;
          const span = spanHi - spanLo;
          if (span < 40) continue;
          const dia = Math.min(72, span * 0.95);
          const r = dia / 2;
          const cx = spanLo + r + rng() * Math.max(0, span - dia);
          const cy = yLo + rng() * (yHi - yLo);
          if (cy + r + 8 > docH - 40 || tooClose(cx, cy)) continue;
          placed = { kind: 'ring', cx, cy, r };
          cap = capFor(cy, true);
        }
      }
    }
    if (placed) stains.push({ ...placed, alphaCap: cap });
  }

  /* ---- tide marks: horizontal smears in text-free y-bands, i-th
     y-slice priority (same spread contract as the rings) ---- */
  const bands = freeBands(rects, yLo, yHi);
  for (let i = 0; i < nTides; i++) {
    let placed = null, cap = 1;
    const tb1 = yLo + (yHi - yLo) * (i / nTides);
    const tb2 = yLo + (yHi - yLo) * ((i + 1) / nTides);
    for (let a = 0; a < 40 && !placed; a++) {
      const w = range(rng, TIDE.w) * sizeF;
      const h = range(rng, TIDE.h) * sizeF;
      if (bands.length) {
        const tprio = bands.filter(([b1, b2]) => b2 > tb1 && b1 < tb2);
        const useT = tprio.length ? tprio : bands;
        const [b1, b2] = useT[Math.floor(rng() * useT.length)];
        if (b2 - b1 < h + 16) continue;
        const cx = lerp(vw * 0.04 + w / 2, vw * 0.96 - w / 2, rng());
        const cy = lerp(b1 + h / 2 + 6, b2 - h / 2 - 6, rng());
        if (tooClose(cx, cy)) continue;
        if (hitsText(rects, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)) continue;
        placed = { kind: 'tide', cx, cy, w, h };
        cap = capFor(cy, false);
      } else {
        /* no free bands: tuck into a gutter, alpha-capped */
        const left = rng() < 0.5;
        const cx = left ? Math.max(vw * 0.04, colLeft / 2) : Math.min(vw * 0.96, (colRight + vw) / 2);
        const cy = yLo + rng() * (yHi - yLo);
        if (tooClose(cx, cy)) continue;
        placed = { kind: 'tide', cx, cy, w, h };
        cap = capFor(cy, true);
      }
    }
    if (placed) stains.push({ ...placed, alphaCap: cap });
  }

  return { vw, docH, mobile, opF, stains, cappedCount: stains.filter((s) => s.alphaCap < 1).length };
}

/* ---------- render ---------- */
function render(l) {
  const { vw, docH, mobile, opF, stains } = l;
  const svg = document.getElementById('stains');
  if (!svg) return;
  svg.setAttribute('width', String(Math.round(vw)));
  svg.setAttribute('height', String(Math.round(docH)));
  svg.setAttribute('viewBox', `0 0 ${Math.round(vw)} ${Math.round(docH)}`);

  const rng = makeLcg(SEED ^ 0x9e3779b9); // separate stream for pure styling
  const parts = [];

  for (const s of stains) {
    /* alpha floor: caps below 0.38 would push rim alpha under the
       readable plate (0.10*mobileF*0.38 = 0.034); 0.38 keeps desktop
       gutter rings at 0.10-0.18 and mobile at ~0.07-0.10 - subtle but
       visible on any light ground. */
    const cap = Math.max(0.38, s.alphaCap);
    if (s.kind === 'ring') {
      const stroke = RING.strokeColors[Math.floor(rng() * RING.strokeColors.length)];
      const edgeOp = Math.min(range(rng, RING.edgeOp) * opF * cap, 0.18);
      const bloomOp = Math.min(range(rng, RING.bloomOp) * opF * cap, 0.08);
      const sw = range(rng, RING.strokeWidth) * (mobile ? 0.7 : 1);
      const [br, bg, bb] = RING.bloomRGB;
      const outer = ringPath(rng, s.cx, s.cy, s.r);
      const inner = ringPath(rng, s.cx + (rng() - 0.5) * 3, s.cy + (rng() - 0.5) * 3, s.r * 0.93);
      let g = `<g filter="url(#stainsTurbFine)">`;
      g += `<path d="${outer}" fill="rgba(${br},${bg},${bb},${bloomOp.toFixed(3)})" stroke="none"/>`;
      /* interior mottling: 3-4 patchy denser areas so the bloom has the
         uneven hydraulic structure of a real spill (never a flat fill) */
      const nmotes = 3 + (rng() < 0.5 ? 1 : 0);
      for (let m = 0; m < nmotes; m++) {
        const mth = rng() * Math.PI * 2;
        const mr = s.r * lerp(0.2, 0.75, rng());
        const mx = s.cx + mr * Math.cos(mth), my = s.cy + mr * Math.sin(mth);
        const mrx = lerp(4, s.r * 0.22, rng()), mry = mrx * lerp(0.6, 1, rng());
        const mrot = (rng() * 180) - 90;
        g += `<ellipse cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" rx="${mrx.toFixed(1)}" ry="${mry.toFixed(1)}" transform="rotate(${mrot.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})" fill="rgba(${br},${bg},${bb},${(bloomOp * 0.9).toFixed(3)})"/>`;
      }
      g += `<path d="${outer}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(2)}" stroke-opacity="${edgeOp.toFixed(3)}" stroke-linecap="round"/>`;
      g += `<path d="${inner}" fill="none" stroke="${stroke}" stroke-width="${(sw * 0.7).toFixed(2)}" stroke-opacity="${(edgeOp * 0.55).toFixed(3)}" stroke-linecap="round" stroke-dasharray="${(6 + rng() * 10).toFixed(1)} ${(4 + rng() * 8).toFixed(1)}"/>`;
      /* splatter: 1-2 droplets flung near-but-not-symmetric-to the rim */
      const ndrops = 1 + (rng() < 0.5 ? 1 : 0);
      for (let d = 0; d < ndrops; d++) {
        const th = rng() * Math.PI * 2;
        const dr = s.r * lerp(1.05, 1.38, rng());
        const dx = s.cx + dr * Math.cos(th), dy = s.cy + dr * Math.sin(th);
        const rx = lerp(1.5, 7, rng()) * (mobile ? 0.7 : 1);
        const ry = rx * lerp(0.55, 1, rng());
        const rot = (th * 180) / Math.PI + (rng() - 0.5) * 40;
        const dop = Math.min(range(rng, RING.dropOp) * opF * cap, 0.14);
        g += `<ellipse cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)})" fill="${stroke}" fill-opacity="${dop.toFixed(3)}"/>`;
      }
      parts.push(g + '</g>');
    } else {
      const topOp = Math.min(range(rng, TIDE.op) * opF * cap, 0.10);
      /* tide body + a faint deeper core band along its lower edge (real
         tide marks pool darkest at the waterline's last stand) */
      const coreOp = Math.min(topOp * 0.5, 0.05);
      let t = `<g filter="url(#stainsTurbCoarse)">`;
      t += `<path d="${tidePath(rng, s.cx, s.cy, s.w, s.h)}" fill="${TIDE.color}" fill-opacity="${topOp.toFixed(3)}"/>`;
      t += `<path d="${tidePath(rng, s.cx, s.cy + s.h * 0.18, s.w * 0.82, s.h * 0.4)}" fill="${TIDE.color}" fill-opacity="${coreOp.toFixed(3)}"/>`;
      t += `</g>`;
      parts.push(t);
    }
  }

  svg.innerHTML = `<defs>${FILTERS((SEED >>> 3) % 1000)}</defs>${parts.join('')}`;

  const svgStyle = getComputedStyle(svg);
  window.__stainsDebug = {
    seed: SEED >>> 0,
    vw,
    docH,
    rings: stains.filter((s) => s.kind === 'ring')
      .map((s) => ({ x: Math.round(s.cx), y: Math.round(s.cy), d: Math.round(s.r * 2), cap: s.alphaCap })),
    tides: stains.filter((s) => s.kind === 'tide')
      .map((s) => ({ x: Math.round(s.cx), y: Math.round(s.cy), w: Math.round(s.w), h: Math.round(s.h), cap: s.alphaCap })),
    capped: l.cappedCount,
    blend: svgStyle.mixBlendMode,
    zIndex: svgStyle.zIndex,
    at: Date.now(),
  };
}

/* ---------- lifecycle ---------- */
let debounceTimer = 0;
function relayout() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    try { render(layout()); } catch (e) { console.warn('[stains] relayout failed:', e); }
  }, 150);
}

function init() {
  if (document.getElementById('stains')) return; // idempotent

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'stains';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  /* body-level sibling AFTER #bg3d (z0-equal paint order puts it above
     the canvas) and OUTSIDE #app (survives innerHTML + route swaps) */
  const script = document.body.querySelector('script');
  document.body.insertBefore(svg, script || null);

  /* First layout waits for fonts (text boxes shift when webfonts land)
     but never hangs the boot - same 2.5s cap main.js uses. */
  const first = () => {
    try { render(layout()); } catch (e) { console.warn('[stains] init failed:', e); }
  };
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(first);

  window.addEventListener('resize', relayout, { passive: true });
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    new ResizeObserver(relayout).observe(document.body); // blog fetch + route flips change doc height
  }
}

try {
  init();
} catch (e) {
  console.warn('[stains] unavailable:', e);
}
