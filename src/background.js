/* ============================================================
   Three.js background — animated particle field + rings.

   prefers-reduced-motion: the WebGL scene is skipped entirely.
   A static CSS gradient stands in on the canvas (same palette)
   and no renderer is created — zero per-frame CPU/GPU cost.
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

function initAnimated() {
  const canvas = canvasEl;
  const myGen = ++generation;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // point sprites (size ~2.6) gain nothing from MSAA; big cost on weak GPUs
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(innerWidth, innerHeight);
  const isMobile = matchMedia('(hover: none), (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1714, 0.0018);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 1000);

  const COUNT = isMobile ? 1400 : 4000;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const cAccent = new THREE.Color(0xb0763c);
  const cTeal = new THREE.Color(0x8a7a4f);
  const cWhite = new THREE.Color(0xe6ddd0);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2400;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1600;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1200;
    const mix = Math.random();
    const c = mix < 0.15 ? cAccent : mix < 0.3 ? cTeal : cWhite;
    const dim = 0.25 + Math.random() * 0.75;
    colors[i * 3] = c.r * dim;
    colors[i * 3 + 1] = c.g * dim;
    colors[i * 3 + 2] = c.b * dim;
    speeds[i] = 0.15 + Math.random() * 0.5;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pMat = new THREE.PointsMaterial({
    size: 2.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // Deliberate composition element (was: artifact-looking rotated
  // random-orbit rings). Now: a slow-creeping arc engraved into the
  // backdrop, always edge-on horizontal (no random tilts), low-contrast
  // against the warm field, like plate engraving behind the hero name.
  const ringGroup = new THREE.Group();
  const circleGeo = new THREE.RingGeometry(1, 1.012, 128);
  for (let r = 0; r < 3; r++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe6ddd0,
      transparent: true,
      opacity: [0.05, 0.035, 0.02][r],
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const ring = new THREE.Mesh(circleGeo, mat);
    ring.scale.setScalar(340 + r * 170);
    ring.userData.creep = (r + 1) * 0.008; // radians-per-second, slow & steady
    ringGroup.add(ring);
  }
  // Anchor to the hero name's position: left-of-center, slightly below
  // the tag line so the engraved circle frames 'Sho Byde' on purpose.
  ringGroup.position.set(-140, 120, -300);
  scene.add(ringGroup);

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
  }

  function animate() {
    if (myGen !== generation) {
      // superseded: stop the loop, free GPU resources, remove listeners
      teardown();
      return;
    }
    request_id = requestAnimationFrame(animate);
    const elapsed = (performance.now() - t0) * 0.001;
    const t = elapsed * 0.06;

    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;

    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] += speeds[i];
      if (pos[i * 3 + 1] > 900) pos[i * 3 + 1] = -900;
    }
    pGeo.attributes.position.needsUpdate = true;

    points.rotation.y = t * 0.03 + mouse.x * 0.05;
    points.rotation.x = mouse.y * 0.05;

    for (const ring of ringGroup.children) {
      // slow, uniform engraving creep — reads as depth, not rotation
      ring.rotation.z += ring.userData.creep * 0.016;
    }
    ringGroup.rotation.y = Math.sin(t * 0.4) * 0.06;
    ringGroup.rotation.z = mouse.x * 0.03;

    const sc = scrollY * 0.25;
    camera.position.y = -sc * 0.4 + mouse.y * 20;
    camera.position.x = mouse.x * 30;
    camera.lookAt(0, -sc * 0.15, -400);

    renderer.render(scene, camera);
  }

  // --- animate: paused whenever the tab is hidden or the (fixed)
  // canvas scrolls out of view. Pauses are event-driven — the loop
  // fully stops (cancelAnimationFrame instead of idle-spinning). ---
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
  // the visibilitychange listener isn't in zombieListeners because
  // it's harmless post-teardown (updateLoop is generation-gated), but
  // the IO observer must stop observing the live canvas — done in
  // teardown() above.

  let request_id = 0;
  updateLoop();
}
