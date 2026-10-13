/* ============================================================
   Three.js background - old-West motif scene.

   Four deliberate period passes, tuned perceptible-but-subtle so
   the parchment fg copy stays readable. A post-frame-1 luma
   self-check on a throwaway canvas warns if the scene ever
   samples as flat black again (see checkFirstFrameLuma).

     1. DUST IN LIGHT-SHAFTS - motes clustered inside two wide
        diagonal sunbeam planes; per-mote color is multiplied by
        a gaussian falloff across the beam's short axis, so motes
        are nearly invisible at the edges and richest at the
        core. A sparse ambient field keeps the frame from being
        empty between shafts.
     2. ENGRAVED COMPASS ROSE - hairline parchment strokes:
        three rim circles, 8 primary + 8 secondary spokes, 32
        rim ticks, tiny hub. Slow-rotating watermark behind the
        hero, like a plate engraving.
     3. GUNSMOKE DRIFT - 3 large soft noise-sprite puffs on
        additive blending drifting horizontally, heavier and
        slower than dust.
     4. LAMPLIGHT FLICKER - a warm underfill behind the fg copy
        whose opacity breathes on summed incommensurate sines
        with an occasional irregular dip; shafts ride the same
        signal at reduced amplitude. NOT a screen-wide pulse.

   All textures are baked at init into offscreen canvases - no
   image assets are added to the bundle.

   prefers-reduced-motion: the WebGL scene is skipped entirely.
   A static CSS gradient stands in on the canvas (same palette)
   and no renderer is created - zero per-frame CPU/GPU cost.
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
    'radial-gradient(ellipse at 50% 30%, rgba(176,118,60,0.12), transparent 60%),' +
    'radial-gradient(ellipse at 80% 70%, rgba(138,122,79,0.08), transparent 55%),' +
    '#1a1714';

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

  // Two wide diagonal shafts, like late-afternoon sun through a
  // saloon window: rotation ~-0.5 rad (upper-left to lower-right).
  const SHAFTS = [
    { baseAngle: -0.5, x: -420, y: 180, z: -350, opacity: 0.30, swayPhase: 0 },
    { baseAngle: -0.62, x: 430, y: 60, z: -480, opacity: 0.22, swayPhase: 2.6 },
  ];
  const beamCount = isMobile ? 500 : 1300;   // motes per shaft
  const ambientCount = isMobile ? 300 : 700; // motes outside shafts
  const shaftState = []; // { group, mat, motes:{geo, speeds, phase, tScale} }

  const beamTexture = softSpriteTexture(128);
  for (const cfg of SHAFTS) {
    const group = new THREE.Group();
    group.position.set(cfg.x, cfg.y, cfg.z);
    group.rotation.z = cfg.baseAngle;

    // Beam volume: elongated soft plane, additive parchment-warm light.
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture,
      color: 0xc9a26a,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1500, 420), beamMat);
    group.add(beam);

    // Motes live in shaft-local space: gauss-distributed across the
    // beam's short axis (denser = brighter = "inside the sunbeam"),
    // their vertex color multiplied by the same falloff so additive
    // blending fades them at the edges automatically.
    const positions = new Float32Array(beamCount * 3);
    const colors = new Float32Array(beamCount * 3);
    const speeds = new Float32Array(beamCount);
    const phases = new Float32Array(beamCount);
    const cMote = new THREE.Color(0xe6ddd0);
    const cBrass = new THREE.Color(0xb0763c);
    for (let i = 0; i < beamCount; i++) {
      const u = Math.random() * 2 - 1;                       // along-beam
      const v = Math.max(-0.42, Math.min(0.42, (Math.random() + Math.random() + Math.random() - 1.5) * 0.55)); // across-beam, clamped gaussian
      positions[i * 3] = u * 700;
      positions[i * 3 + 1] = v * 200;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      const depth = Math.exp(-(v * v) * 14);                 // rich core, dim rim
      const c = Math.random() < 0.12 ? cBrass : cMote;
      const slight = Math.random() < 0.5 ? 1 : 0.6; // coarse ratio variance
      colors[i * 3] = c.r * depth * slight;
      colors[i * 3 + 1] = c.g * depth * slight;
      colors[i * 3 + 2] = c.b * depth * slight;
      // most motes rise slowly; ~1 in 4 is heavier and settles
      speeds[i] = Math.random() < 0.25
        ? -(0.05 + Math.random() * 0.18)
        : (0.08 + Math.random() * 0.3);
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.4,
      map: dustSprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    const cMote = new THREE.Color(0xe6ddd0);
    for (let i = 0; i < ambientCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2600;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1700;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 700;
      const dim = 0.16 + Math.random() * 0.16; // faint but readable
      colors[i * 3] = cMote.r * dim;
      colors[i * 3 + 1] = cMote.g * dim;
      colors[i * 3 + 2] = cMote.b * dim;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2,
      map: dustSprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(geo, mat));
  }

  /* --- 2. engraved compass rose ----------------------------------- */

  const rose = new THREE.Group();
  const hairMat = (op) => new THREE.MeshBasicMaterial({
    color: 0xe6ddd0,
    transparent: true,
    opacity: op,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  // rim circles - stroke widths tuned to survive downscale to 1 device px
  for (let [r, w, op] of [[300, 0.008, 0.20], [244, 0.007, 0.14], [120, 0.006, 0.11], [18, 0.05, 0.16]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * (1 - w), r, 128), hairMat(op));
    rose.add(ring);
  }
  // 8 primary spokes + 8 shorter secondary spokes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = new THREE.Mesh(new THREE.PlaneGeometry(8, 290), hairMat(0.16));
    long.position.set(Math.sin(a) * 145, Math.cos(a) * 145, 0);
    long.rotation.z = -a;
    rose.add(long);
    const a2 = a + Math.PI / 8;
    const short = new THREE.Mesh(new THREE.PlaneGeometry(5, 148), hairMat(0.11));
    short.position.set(Math.sin(a2) * 196, Math.cos(a2) * 196, 0);
    short.rotation.z = -a2;
    rose.add(short);
  }
  // 32 rim ticks
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 12), hairMat(0.14));
    tick.position.set(Math.sin(a) * 312, Math.cos(a) * 312, 0);
    tick.rotation.z = -a;
    rose.add(tick);
  }
  // Anchor to the hero name: same slot the old rings occupied.
  rose.position.set(-140, 120, -300);
  scene.add(rose);

  /* --- 3. gunsmoke drift ------------------------------------------ */

  const smokeTex = smokeTexture(256);
  const smokeSprites = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: 0xcdbfae,
      transparent: true,
      opacity: 0.16 + i * 0.038,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(mat);
    const sc = 520 + i * 190;
    s.scale.set(sc, sc * 0.72, 1);
    s.position.set(-900 + i * 700, -160 + i * 90, -420 - i * 60);
    s.userData = {
      vx: 5 + i * 2.5,        // slow horizontal drift, px/sec
      bobPhase: i * 2.1,
      bobAmp: 14 + i * 6,
    };
    smokeSprites.push(s);
    scene.add(s);
  }

  /* --- 4. lamplight underfill -------------------------------------- */

  const lampMat = new THREE.SpriteMaterial({
    map: beamTexture,
    color: 0xb0763c,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lamp = new THREE.Sprite(lampMat);
  lamp.scale.set(880, 620, 1);
  lamp.position.set(-140, 60, -520); // behind the fg copy, not fullscreen
  scene.add(lamp);

  // Irregular period-correct flicker: summed incommensurate sines + an
  // occasional asymmetric dip - never a metronome, never big.
  function flick(t) {
    let v = 0.78
      + 0.10 * Math.sin(t * 0.9 + 1.7)
      + 0.07 * Math.sin(t * 2.31)
      + 0.05 * Math.sin(t * 5.13 + 0.6);
    // deterministic pseudo-random dip that hits ~1s in 12
    const s = Math.floor(t);
    let h = Math.sin(s * 12.9898) * 43758.5453;
    h -= Math.floor(h);
    if (h > 0.915) v *= 0.86 + (h - 0.915) * 0.6;
    return Math.max(0.45, v);
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
      s.material.opacity = (0.16 + smokeSprites.indexOf(s) * 0.038) * (0.55 + flickV * 0.5);
    }

    // 4. lamplight breathes
    lampMat.opacity = 0.19 * flickV;

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
