/* ============================================================
   Three.js background - dark starfield scene.

   Tuned to the live CSS tokens (--bg #0b0b0f, --fg #e8e8ee,
   --accent #7c6cff, --accent2 #00d9b8). Additive blending is
   correct here again - it was only forbidden on the parchment
   ground, where it white-outs. The compass rose and the warm
   light-shafts (sun rays) were removed by request.

   Four passes:
     1. STAR FLY-THROUGH - the signature effect: star sprites
        drifting toward the camera (+z), size-attenuated so they
        widen as they pass, respawn at the far plane with fresh
        x/y on exit. White core, violet/teal accents.
     2. AMBIENT DUST - sparse faint specks, slow rise, so the
        gaps between streams aren't dead space.
     3. HAZE DRIFT - 3 large soft noise-sprite wisps, warm gray
        at very low additive opacity; wrap in world units.
     4. ACCENT GLOW FLICKER - a pooled violet underfill whose
        opacity breathes on summed incommensurate sines with an
        occasional deep dip; haze rides the same signal.

   All textures are baked at init into offscreen canvases - no
   image assets are added to the bundle.

   prefers-reduced-motion: the WebGL scene is skipped entirely.
   A static CSS gradient stands in on the canvas (dark ground
   with subtle violet/teal washes) and no renderer is created -
   zero per-frame CPU/GPU cost.
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
    'radial-gradient(ellipse at 30% 25%, rgba(124,108,255,0.10), transparent 60%),' +
    'radial-gradient(ellipse at 75% 70%, rgba(0,217,184,0.06), transparent 55%),' +
    '#0b0b0f';

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

// Soft round sprite: white core -> transparent rim. Used for stars,
// dust points and the accent glow.
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

// Billowy haze puff: ~40 overlapping soft blobs, denser toward
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
        `[background] starfield luma check: sd=${sd.toFixed(5)}, ` +
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
    antialias: false, // soft sprites gain nothing from MSAA
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(innerWidth, innerHeight);
  const isMobile = matchMedia('(hover: none), (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  // Light depth haze: far stars fade toward the page ground color,
  // so the fly-through reads with distance instead of a flat plane.
  scene.fog = new THREE.FogExp2(0x0b0b0f, 0.0006);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 1000);

  const starTex = softSpriteTexture(32);
  const dustTex = softSpriteTexture(64);
  const glowTex = softSpriteTexture(128);
  let ambientDust = null; // filled by the ambient-field block below

  /* --- 1. star fly-through ---------------------------------------- */

  const STAR_COUNT = isMobile ? 900 : 2200;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  const starSpeeds = new Float32Array(STAR_COUNT);
  const cWhite = new THREE.Color(0xe8e8ee);  // --fg
  const cAccent = new THREE.Color(0x7c6cff); // --accent
  const cTeal = new THREE.Color(0x00d9b8);   // --accent2
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 2400;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 1600;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 2200; // straddle camera z=1000
    const mix = Math.random();
    const c = mix < 0.12 ? cAccent : mix < 0.22 ? cTeal : cWhite;
    const dim = 0.25 + Math.random() * 0.75; // twinkle-by-brightness
    starCol[i * 3] = c.r * dim;
    starCol[i * 3 + 1] = c.g * dim;
    starCol[i * 3 + 2] = c.b * dim;
    starSpeeds[i] = 0.9 + Math.random() * 2.4; // world units toward +z
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 3.0,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // correct on a dark ground
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  /* --- 2. sparse ambient dust -------------------------------------- */

  const ambientCount = isMobile ? 250 : 500;
  {
    const positions = new Float32Array(ambientCount * 3);
    const colors = new Float32Array(ambientCount * 3);
    const drift = new Float32Array(ambientCount);
    const cDust = new THREE.Color(0x8a8a95); // --fg-dim
    for (let i = 0; i < ambientCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2600;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1700;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 700 - 400; // behind the stars
      const dim = 0.3 + Math.random() * 0.5;
      colors[i * 3] = cDust.r * dim;
      colors[i * 3 + 1] = cDust.g * dim;
      colors[i * 3 + 2] = cDust.b * dim;
      drift[i] = 0.05 + Math.random() * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.9,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    ambientDust = { geo, drift, count: ambientCount };
  }

  /* --- 3. haze drift ------------------------------------------------ */

  const smokeTex = smokeTexture(256);
  const smokeSprites = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: 0x5a5a66, // --fg-mute: barely-there warm-gray haze glow
      transparent: true,
      opacity: 0.05 + i * 0.015,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    const sc = 500 + i * 160;
    s.scale.set(sc, sc * 0.78, 1);
    s.position.set(-900 + i * 500, -260 + i * 90, -420 - i * 60);
    s.userData = {
      vx: 2.2 + i * 1.2,
      bobPhase: i * 2.1,
      baseOpacity: 0.05 + i * 0.015,
    };
    smokeSprites.push(s);
    scene.add(s);
  }

  /* --- 4. accent glow underfill ------------------------------------- */

  // Pooled violet glow lying behind the fg copy - not a light source,
  // just depth. The flicker keeps it perceptible without blooming.
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0x7c6cff,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(760, 540, 1);
  glow.position.set(-140, 60, -520); // behind the fg copy, not fullscreen
  scene.add(glow);

  // Slow breathing: longer-period summed sines, tight amplitude,
  // plus an occasional deep dip. Breathing ~ every 20s.
  function flick(t) {
    let v = 0.88
      + 0.08 * Math.sin(t * 0.31 + 1.7)
      + 0.05 * Math.sin(t * 1.13)
      + 0.03 * Math.sin(t * 3.07 + 0.6);
    // deterministic pseudo-random dip that hits ~1s in 16
    const s = Math.floor(t * 0.75); // dilated clock -> slower dip cadence
    let h = Math.sin(s * 12.9898) * 43758.5453;
    h -= Math.floor(h);
    if (h > 0.935) v *= 0.72 + (h - 0.935) * 0.8;
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

  function updateDust() {
    if (!ambientDust) return;
    const pos = ambientDust.geo.attributes.position.array;
    for (let i = 0; i < ambientDust.count; i++) {
      pos[i * 3 + 1] += ambientDust.drift[i];
      if (pos[i * 3 + 1] > 850) pos[i * 3 + 1] = -850;
    }
    ambientDust.geo.attributes.position.needsUpdate = true;
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
    disposeTexture(starTex);
    disposeTexture(dustTex);
    disposeTexture(glowTex);
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

    // 1. stars drift toward the camera; on exit they respawn at the
    //    far plane with fresh x/y so the wrap is unseeable
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

    // 2. ambient dust rises slowly
    updateDust();

    // 3. haze drifts, bobs, breathes (world-unit wrap, not px)
    for (const s of smokeSprites) {
      s.position.x += s.userData.vx * 0.016;
      const wrapAt = 1600 + s.scale.x;
      if (s.position.x > wrapAt) s.position.x = -wrapAt;
      s.position.y += Math.sin(elapsed * 0.11 + s.userData.bobPhase) * 0.05;
      s.material.opacity = s.userData.baseOpacity * (0.55 + flickV * 0.35);
    }

    // 4. accent glow breathes
    glowMat.opacity = 0.05 * flickV;

    // camera: settled parallax only
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
