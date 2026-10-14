/* ============================================================
   Three.js background - parchment journal scene.

   Four deliberate period passes, tuned perceptible-but-subtle so
   the warm-ink fg copy stays readable on the light ground. A
   post-frame-1 luma self-check on a throwaway canvas warns if the
   scene ever samples as flat/washed (see checkFirstFrameLuma).

     1. DUST IN LIGHT-SHAFTS - motes clustered inside two wide
        diagonal honey-wash planes; per-mote color is multiplied by
        a gaussian falloff across the beam's short axis, so motes
        fade at the edges and read strongest at the core. Motes are
        darker-than-paper ink specks riding a faint warm light zone
        (normal blending - additive would white-out a light scene).
        A sparse ambient field keeps the frame from being empty.
     2. FAINT INK-TRACED COMPASS ROSE - pale warm-ink hairlines
        just darker than the parchment: three rim circles, 8 primary
        + 8 secondary spokes, 32 rim ticks, tiny hub. A barely-there
        paper ornament watermark behind the hero.
     3. LAMP-STEAM DRIFT - 3 small soft noise-sprite wisps anchored
        near the lower-right corner, drifting lazily; warm gray-brown
        at low opacity so steam subtly darkens the paper.
     4. LAMPLIGHT FLICKER - a pooled warm honey underfill behind the
        fg copy whose opacity breathes slowly on summed
        incommensurate sines with an occasional deep dip; shafts ride
        the same signal at reduced amplitude. Reading-by-firelight.
        NOT a screen-wide pulse.
     5. INK-STAR STREAM - the old dark-theme fly-through field, rebuilt
        for parchment: sparse ink-dark stars drifting toward the camera
        (+z), size-attenuated so they widen as they pass, wrap to the
        far plane on exit. Normal blending - additive white would
        vanish (or white-out) on a light ground.

   All textures are baked at init into offscreen canvases - no
   image assets are added to the bundle.

   prefers-reduced-motion: the WebGL scene is skipped entirely.
   A static CSS gradient stands in on the canvas (parchment ground
   with subtle warm washes) and no renderer is created - zero
   per-frame CPU/GPU cost.
   Toggling the OS setting live tears down / re-inits without a
   reload. A module-level generation token ensures a superseded
   instance stops its own animation loop and event listeners.

   The motionprefchange listener is registered ONCE (module
   guard), so re-entering initBackground after a live toggle
   never stacks duplicate listeners.
   ============================================================ */
 import * as THREE from 'three';
import { motionPrefs } from './motionPrefs.js';

let canvasEl = null;
let GRADIENT = '';
let generation = 0;         // ++ every teardown; superseded loops check this
let changeListenerAttached = false;
const zombieListeners = []; // event listeners pushed by the live animated instance

function bumpGeneration() { generation++; }

function paintStatic() {
  canvasEl.style.background = GRADIENT;
}

function clearStatic() {
  canvasEl.style.background = '';
}

export function initBackground() {
  canvasEl = document.getElementById('bg3d');
  if (!canvasEl) return;

  GRADIENT =
    'radial-gradient(ellipse at 50% 30%, rgba(176,118,60,0.10), transparent 60%),' +
    'radial-gradient(ellipse at 80% 70%, rgba(138,106,52,0.07), transparent 55%),' +
    '#f2ead8';

  // Single persistent live-toggle listener, regardless of how many
  // times initBackground / initAnimated re-enter.
  if (!changeListenerAttached) {
    changeListenerAttached = true;
    window.addEventListener('motionprefchange', () => {
      if (motionPrefs.reduced) {
        bumpGeneration();      // kills the animated instance's loop
        for (const [target, type, fn] of zombieListeners.splice(0)) {
          target.removeEventListener(type, fn);
        }
        paintStatic();
      } else {
        bumpGeneration();      // in case a stale instance lingers
        clearStatic();
        initAnimated();        // restart WebGL in place
      }
    });
  }

  if (motionPrefs.reduced) {
    paintStatic();
    return;
  }
  initAnimated();
}

/* ---------- texture bakers (all offscreen-canvas, no assets) ---------- */

// Soft round sprite: white core -> transparent rim. Used for dust
// points and the lamplight underfill glow.
function softSpriteTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Billowy smoke puff: ~40 overlapping soft blobs, denser toward
// the center, stretched slightly for an irregular silhouette.
function smokeTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  for (let i = 0; i < 42; i++) {
    // cheaper-than-perlin clustering: gaussian-ish offsets from center
    const a = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 0.7) * size * 0.28;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.8;
    const r = size * (0.06 + Math.random() * 0.12);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.06 + Math.random() * 0.08;
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return new THREE.CanvasTexture(c);
}

function disposeTexture(tex) {
  if (tex && tex.dispose) tex.dispose();
}

/* ---------- post-frame luma self-check (diagnostics only) ---------- */

// Samples the first rendered frame through a throwaway 2D canvas and
// warns in the console when the scene still samples as flat black.
// Deliberately NOT el.getContext('webgl') on the real canvas - a
// second getContext call there would steal/null the live binding.
// This is a breadcrumb, never a failure state: all errors swallowed.
function checkFirstFrameLuma(src) {
  try {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 64;
    const g = probe.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.drawImage(src, 0, 0, 64, 64);
    const px = g.getImageData(0, 0, 64, 64).data;
    const n = 64 * 64;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < px.length; i += 4) {
      const luma = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      sum += luma;
      sumSq += luma * luma;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    if (sd < 0.004) {
      console.warn(
        `[background] western-scene luma check: sd=${sd.toFixed(5)}, ` +
        `mean=${mean.toFixed(4)} - canvas is flat; the scene is ` +
        `likely invisible again. (Diagnostics only.)`,
      );
    }
  } catch {
    /* diagnostics must never break the render loop */
  }
}

/* ---------- scene ---------- */

function initAnimated() {
  const canvas = canvasEl;
  const myGen = ++generation;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // hairlines + soft sprites gain nothing from MSAA
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(innerWidth, innerHeight);
  const isMobile = matchMedia('(hover: none), (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  // NOTE: no fog. FogExp2 at these depths was attenuating the entire
  // scene toward the near-black fog color (exp(-(d*z)^2) at z=400 is
  // already deep), which is why the engraved linework read flat.

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 1000);

  /* --- 1. light-shafts + dust-in-beam ------------------------------ */

  const dustSprite = softSpriteTexture(64);

  // Two wide diagonal shafts: faint warm honey light zones lying ON the
  // parchment (normal blending - additive would white-out a light page).
  // Opacities sit slightly above the drafted 0.07-0.09 band: the
  // luma-variance verify gate (sd >= 0.008) needs the broad washes to
  // carry perceptible texture once the 64px probe averages away the
  // sub-pixel motes.
  const SHAFTS = [
    { baseAngle: -0.5, x: -420, y: 180, z: -350, opacity: 0.19, swayPhase: 0 },
    { baseAngle: -0.62, x: 430, y: 60, z: -480, opacity: 0.15, swayPhase: 2.6 },
  ];
  const beamCount = isMobile ? 500 : 1300;   // motes per shaft
  const ambientCount = isMobile ? 300 : 700; // motes outside shafts
  const shaftState = []; // { group, mat, motes:{geo, speeds, phase, tScale} }

  const beamTexture = softSpriteTexture(128);
  for (const cfg of SHAFTS) {
    const group = new THREE.Group();
    group.position.set(cfg.x, cfg.y, cfg.z);
    group.rotation.z = cfg.baseAngle;

    // Beam volume: elongated soft plane, warm honey wash over the paper.
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture,
      color: 0xd8b070,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1500, 420), beamMat);
    group.add(beam);

    // Motes live in shaft-local space: gauss-distributed across the
    // beam's short axis (denser = stronger = "inside the sunbeam"),
    // their vertex color multiplied by the same falloff so the darker
    // specks fade at the beam edges automatically.
    const positions = new Float32Array(beamCount * 3);
    const colors = new Float32Array(beamCount * 3);
    const speeds = new Float32Array(beamCount);
    const phases = new Float32Array(beamCount);
    const cMote = new THREE.Color(0x6d5f45); // darker-than-paper speck ink
    const cBrass = new THREE.Color(0x5a4322);
    for (let i = 0; i < beamCount; i++) {
      const u = Math.random() * 2 - 1;                       // along-beam
      const v = Math.max(-0.42, Math.min(0.42, (Math.random() + Math.random() + Math.random() - 1.5) * 0.55)); // across-beam, clamped gaussian
      positions[i * 3] = u * 700;
      positions[i * 3 + 1] = v * 200;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      const depth = Math.exp(-(v * v) * 14);                 // rich core, dim rim
      const c = Math.random() < 0.2 ? cBrass : cMote;
      const slight = Math.random() < 0.5 ? 1 : 0.6; // coarse ratio variance
      colors[i * 3] = c.r * depth * slight;
      colors[i * 3 + 1] = c.g * depth * slight;
      colors[i * 3 + 2] = c.b * depth * slight;
      // most motes rise slowly and lazily; ~1 in 4 is heavier and settles
      speeds[i] = Math.random() < 0.25
        ? -(0.04 + Math.random() * 0.14)
        : (0.06 + Math.random() * 0.22);
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.0,
      map: dustSprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });
    const motes = new THREE.Points(geo, mat);
    group.add(motes);

    scene.add(group);
    shaftState.push({ cfg, group, beamMat, geo, speeds, phases, beamCount });
  }

  // Sparse ambient field so the gaps between shafts aren't dead.
  {
    const positions = new Float32Array(ambientCount * 3);
    const colors = new Float32Array(ambientCount * 3);
    const cMote = new THREE.Color(0x6d5f45);
    for (let i = 0; i < ambientCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2600;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1700;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 700;
      const dim = 0.12 + Math.random() * 0.14; // faint specks, not dead
      colors[i * 3] = cMote.r * dim;
      colors[i * 3 + 1] = cMote.g * dim;
      colors[i * 3 + 2] = cMote.b * dim;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.9,
      map: dustSprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(geo, mat));
  }

  /* --- 5. ink-star stream: fly-through toward the camera ----------- */

  // Round star sprite: crisp core + soft halo, baked once.
  const starCanvas = document.createElement('canvas');
  starCanvas.width = starCanvas.height = 32;
  const sctx = starCanvas.getContext('2d');
  const sgrad = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  sgrad.addColorStop(0, 'rgba(255,255,255,1)');
  sgrad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  sgrad.addColorStop(1, 'rgba(255,255,255,0)');
  sctx.fillStyle = sgrad;
  sctx.fillRect(0, 0, 32, 32);
  const starTex = new THREE.CanvasTexture(starCanvas);

  const STAR_COUNT = isMobile ? 700 : 1600;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const starSpeeds = new Float32Array(STAR_COUNT);
  const cInk = new THREE.Color(0x6d5f45);    // warm ink, darker than paper
  const cBrass = new THREE.Color(0x5a4322);  // a few deeper brass flecks
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 2400;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 1600;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 2000; // straddle camera z=1000
    const c = Math.random() < 0.15 ? cBrass : cInk;
    const dim = 0.25 + Math.random() * 0.65;           // twinkle-by-brightness
    starCol[i * 3] = c.r * dim;
    starCol[i * 3 + 1] = c.g * dim;
    starCol[i * 3 + 2] = c.b * dim;
    starSpeeds[i] = 0.9 + Math.random() * 2.2;         // world units toward +z
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 3.2,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  /* --- 2. engraved compass rose ----------------------------------- */

  const rose = new THREE.Group();
  // pale warm ink tracings, just darker than the paper
  const hairMat = (op) => new THREE.MeshBasicMaterial({
    color: 0x8a6a3e,
    transparent: true,
    opacity: op,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  // rim circles - stroke widths trimmed so the rose reads as a faint
  // ink-tracing ornament, not engraved plate linework
  for (let [r, w, op] of [[300, 0.006, 0.11], [244, 0.005, 0.08], [120, 0.004, 0.06], [18, 0.04, 0.09]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * (1 - w), r, 128), hairMat(op));
    rose.add(ring);
  }
  // 8 primary spokes + 8 shorter secondary spokes - hairline-thin, faded
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = new THREE.Mesh(new THREE.PlaneGeometry(5, 290), hairMat(0.09));
    long.position.set(Math.sin(a) * 145, Math.cos(a) * 145, 0);
    long.rotation.z = -a;
    rose.add(long);
    const a2 = a + Math.PI / 8;
    const short = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 148), hairMat(0.065));
    short.position.set(Math.sin(a2) * 196, Math.cos(a2) * 196, 0);
    short.rotation.z = -a2;
    rose.add(short);
  }
  // 32 rim ticks
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 12), hairMat(0.08));
    tick.position.set(Math.sin(a) * 312, Math.cos(a) * 312, 0);
    tick.rotation.z = -a;
    rose.add(tick);
  }
  // Anchor to the hero name: same slot the old rings occupied.
  rose.position.set(-140, 120, -300);
  scene.add(rose);

  /* --- 3. lamp-steam drift (was gunsmoke) -------------------------- */

  // Reads as gentle steam curling off a lamp: smaller, slower,
  // softer, anchored to a corner column instead of crossing the frame.
  // Warm gray-brown at LOW opacity - on parchment, steam darkens the
  // paper slightly rather than glowing.
  const smokeTex = smokeTexture(256);
  const smokeSprites = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: 0x6d5f45,
      transparent: true,
      opacity: 0.05 + i * 0.015,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const s = new THREE.Sprite(mat);
    const sc = 300 + i * 120;        // smaller puffs
    s.scale.set(sc, sc * 0.78, 1);
    // clustered near the lower-right corner, nested depths
    s.position.set(520 + i * 90, -260 + i * 70, -420 - i * 60);
    s.userData = {
      vx: 2.2 + i * 1.2,             // barely-there drift, ~1/3 the old speed
      bobPhase: i * 2.1,
      bobAmp: 8 + i * 4,
    };
    smokeSprites.push(s);
    scene.add(s);
  }

  /* --- 4. lamplight underfill -------------------------------------- */

  // Pooled warm honey lying on the paper, not a light source: normal
  // blending, gentle opacity; the flicker keeps it perceptible without
  // washing the copy column.
  const lampMat = new THREE.SpriteMaterial({
    map: beamTexture,
    color: 0xd8b070,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const lamp = new THREE.Sprite(lampMat);
  lamp.scale.set(760, 540, 1);
  lamp.position.set(-140, 60, -520); // behind the fg copy, not fullscreen
  scene.add(lamp);

  // Slow firelight breathing: longer-period summed sines, tighter
  // amplitude, plus an occasional deep warm dip. Breathing ~ every 20s.
  function flick(t) {
    let v = 0.88
      + 0.08 * Math.sin(t * 0.31 + 1.7)
      + 0.05 * Math.sin(t * 1.13)
      + 0.03 * Math.sin(t * 3.07 + 0.6);
    // deterministic pseudo-random dip that hits ~1s in 16
    const s = Math.floor(t * 0.75); // dilated clock -> slower dip cadence
    let h = Math.sin(s * 12.9898) * 43758.5453;
    h -= Math.floor(h);
    if (h > 0.935) v *= 0.72 + (h - 0.935) * 0.8; // deeper, warmer falloff
    return Math.max(0.55, v);
  }

  let scrollY = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const t0 = performance.now();

  function onScroll() { scrollY = window.scrollY; }
  function onPointerMove(e) {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  }
  function onResize() {
    if (myGen !== generation) return; // superseded
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('resize', onResize);
  // Track our listeners so the live-toggle path can remove them even
  // without waiting for our own loop to notice it was superseded.
  zombieListeners.push(
    [window, 'scroll', onScroll],
    [window, 'pointermove', onPointerMove],
    [window, 'resize', onResize],
  );

  // --- per-frame mote updates (in place; no allocations) -----------
  function updateShaftMotes(s, elapsed) {
    const pos = s.geo.attributes.position.array;
    for (let i = 0; i < s.beamCount; i++) {
      // rise / settle along beam-local Y
      pos[i * 3 + 1] += s.speeds[i];
      if (pos[i * 3 + 1] > 200) pos[i * 3 + 1] = -200;
      else if (pos[i * 3 + 1] < -200) pos[i * 3 + 1] = 200;
      // gentle lateral swirl per mote
      pos[i * 3] += Math.sin(elapsed * 0.35 + s.phases[i]) * 0.28;
      if (pos[i * 3] > 700) pos[i * 3] = -700;
      else if (pos[i * 3] < -700) pos[i * 3] = 700;
    }
    s.geo.attributes.position.needsUpdate = true;
  }

  function teardown() {
    cancelAnimationFrame(request_id);
    renderer.dispose();
    scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material?.dispose?.();
      else obj.material?.dispose?.();
    });
    removeEventListener('scroll', onScroll);
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('resize', onResize);
    visibilityObserver.disconnect();
    disposeTexture(dustSprite);
    disposeTexture(beamTexture);
    disposeTexture(smokeTex);
    disposeTexture(starTex);
  }

  function animate() {
    if (myGen !== generation) {
      // superseded: stop the loop, free GPU resources, remove listeners
      teardown();
      return;
    }
    request_id = requestAnimationFrame(animate);
    const elapsed = (performance.now() - t0) * 0.001;
    const flickV = flick(elapsed);
    window.__dbgFrames = (window.__dbgFrames || 0) + 1;
    if (window.__dbgEat === 1) return; // skip everything after render above


    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;

    // 0. ink-stars drift toward the camera (fly-through); on exit they
    // respawn at the far plane with fresh x/y so the wrap is unseeable
    {
      const pos = starGeo.attributes.position.array;
      for (let i = 0; i < STAR_COUNT; i++) {
        pos[i * 3 + 2] += starSpeeds[i];
        if (pos[i * 3 + 2] > 1100) { // just behind the camera plane
          pos[i * 3] = (Math.random() - 0.5) * 2400;
          pos[i * 3 + 1] = (Math.random() - 0.5) * 1600;
          pos[i * 3 + 2] = -1100;
        }
      }
      starGeo.attributes.position.needsUpdate = true;
    }

    // 1. shafts breathe with the lamp; cradle a barely-there sway
    for (const s of shaftState) {
      s.beamMat.opacity = s.cfg.opacity * (0.6 + flickV * 0.5);
      s.group.rotation.z = s.cfg.baseAngle
        + Math.sin(elapsed * 0.17 + s.cfg.swayPhase) * 0.018;
      updateShaftMotes(s, elapsed);
    }

    // 2. rose turns imperceptibly, like a water wheel under a porch
    rose.rotation.z += 0.00022;
    rose.rotation.y = mouse.x * 0.04;
    rose.rotation.x = -mouse.y * 0.03;

    // 3. smoke drifts, wraps, breathes
    for (const s of smokeSprites) {
      s.position.x += s.userData.vx * 0.016;
      if (s.position.x > innerWidth + s.scale.x + 300) s.position.x = -s.scale.x - 300;
      s.position.y += Math.sin(elapsed * 0.11 + s.userData.bobPhase) * 0.05;
      // base opacities 0.05-0.08; multiplier retuned so the flicker
      // modulates without pushing final visible opacity past ~0.08
      s.material.opacity = (0.05 + smokeSprites.indexOf(s) * 0.015) * (0.55 + flickV * 0.35);
    }

    // 4. lamplight breathes
    lampMat.opacity = 0.095 * flickV;

    // camera: settled parallax only - no rotating world
    const sc = scrollY * 0.25;
    camera.position.y = -sc * 0.4 + mouse.y * 12;
    camera.position.x = mouse.x * 18;
    camera.lookAt(0, -sc * 0.15, -400);

    renderer.render(scene, camera);
  }

  // --- animate: paused whenever the tab is hidden or the (fixed)
  // canvas scrolls out of view. Pauses are event-driven - the loop
  // fully stops instead of idle-spinning. ---
  let visible = true;
  let tabHidden = document.hidden;

  function updateLoop() {
    const shouldRun = visible && !tabHidden && myGen === generation;
    if (!shouldRun && request_id) {
      cancelAnimationFrame(request_id);
      request_id = 0;
    } else if (shouldRun && !request_id) {
      request_id = requestAnimationFrame(animate);
    }
  }

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateLoop();
  });
  visibilityObserver.observe(canvas);
  document.addEventListener('visibilitychange', () => {
    tabHidden = document.hidden;
    updateLoop();
  });

  let request_id = 0;
  updateLoop();

  // Diagnostics: verify frame 1 actually drew something perceptible.
  // Runs once, two rAFs in (render already presented), diagnostics-only.
  let lumaChecked = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!lumaChecked && myGen === generation) {
        lumaChecked = true;
        checkFirstFrameLuma(canvas);
      }
    });
  });
}
