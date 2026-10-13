/* ============================================================
   Three.js background — animated particle field + rings.

   prefers-reduced-motion: the WebGL scene is skipped entirely.
   A static CSS gradient stands in on the canvas (same palette)
   and no renderer is created — zero per-frame CPU/GPU cost.
   Toggling the OS setting live tears down / re-inits without a
   reload. A monotonic token ensures a superseding init stops
   the previous one's animation loop and event listeners.
   ============================================================ */
import * as THREE from 'three';
import { motionPrefs } from './motionPrefs.js';

export function initBackground() {
  const canvas = document.getElementById('bg3d');
  if (!canvas) return;

  const GRADIENT =
    'radial-gradient(ellipse at 50% 30%, rgba(176,118,60,0.12), transparent 60%),' +
    'radial-gradient(ellipse at 80% 70%, rgba(138,122,79,0.08), transparent 55%),' +
    '#1a1714';

  // Growing token: a listener compares its own id against this to
  // know whether it still belongs to the live instance.
  let generation = 0;

  // Reduced motion right now: paint the static gradient (idempotent)
  // and return. The change listener below handles the reverse flip.
  if (motionPrefs.reduced) {
    canvas.style.background = GRADIENT;
  }

  window.addEventListener('motionprefchange', function onChange() {
    if (motionPrefs.reduced) {
      generation++;           // kills the animated instance's loop
      canvas.style.background = GRADIENT;
      disposeListeners(cleanupFns.zombie);
    } else {
      // Motion allowed: tear down whatever is showing, restart
      // the full WebGL instance (same function, re-enters).
      generation++;
      canvas.style.background = '';
      initBackground();
    }
  });

  function disposeListeners(fns) {
    (fns || []).forEach(([target, type, fn]) => target.removeEventListener(type, fn));
  }

  if (motionPrefs.reduced) return;

  // ----- animated instance -----
  const myGen = ++generation;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1714, 0.0018);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 1000);

  const COUNT = 4000;
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

  const ringGroup = new THREE.Group();
  const circleGeo = new THREE.RingGeometry(1, 1.02, 64);
  for (let r = 0; r < 3; r++) {
    const mat = new THREE.MeshBasicMaterial({
      color: r === 0 ? 0xb0763c : r === 1 ? 0x8a7a4f : 0x5a3d22,
      transparent: true,
      opacity: 0.18 - r * 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const ring = new THREE.Mesh(circleGeo, mat);
    ring.scale.setScalar(260 + r * 180);
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.y = Math.random() * Math.PI;
    ring.userData.rotSpeed = { x: (Math.random() - 0.5) * 0.0004, y: (Math.random() - 0.5) * 0.0006 };
    ringGroup.add(ring);
  }
  ringGroup.position.set(0, -60, -200);
  scene.add(ringGroup);

  let scrollY = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const t0 = performance.now();
  const cleanupFns = { zombie: [] };

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

  function animate() {
    if (myGen !== generation) {
      // superseded: stop the loop, free GPU resources, remove listeners
      // (only one instance ever reaches teardown with its own handles).
      cancelAnimationFrame(request_id);
      renderer.dispose();
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.dispose?.();
        else obj.material?.dispose?.();
      });
      removeEventListener('scroll', onScroll);
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('resize', onResize);
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
      ring.rotation.x += ring.userData.rotSpeed.x;
      ring.rotation.y += ring.userData.rotSpeed.y;
    }
    ringGroup.rotation.y = Math.sin(t * 0.4) * 0.15;
    ringGroup.rotation.z = mouse.x * 0.08;

    const sc = scrollY * 0.25;
    camera.position.y = -sc * 0.4 + mouse.y * 20;
    camera.position.x = mouse.x * 30;
    camera.lookAt(0, -sc * 0.15, -400);

    renderer.render(scene, camera);
  }

  let request_id = requestAnimationFrame(animate);
}
