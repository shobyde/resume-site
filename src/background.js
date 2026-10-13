/* ============================================================
   Three.js background — animated particle field + logo points
   ============================================================ */
import * as THREE from 'three';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initBackground() {
  const canvas = document.getElementById('bg3d');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0b0f, 0.0018);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 1000);

  // --- scroll-driven camera target ---
  let scrollY = 0;
  addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  // --- particle field ---
  const COUNT = prefersReduced ? 1500 : 4000;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const cAccent = new THREE.Color(0x7c6cff);
  const cTeal = new THREE.Color(0x00d9b8);
  const cWhite = new THREE.Color(0xffffff);

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
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // --- connecting lines cluster (constellation feel) ---
  const ringGroup = new THREE.Group();
  const circleGeo = new THREE.RingGeometry(1, 1.02, 64);
  for (let r = 0; r < 3; r++) {
    const mat = new THREE.MeshBasicMaterial({
      color: r === 0 ? 0x7c6cff : r === 1 ? 0x00d9b8 : 0x3a3a55,
      transparent: true,
      opacity: 0.18 - r * 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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

  // --- mouse parallax ---
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  // --- animate ---
  let t = 0;
  let mouseIdle = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.001;

    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    mouseIdle = Math.abs(mouse.tx) + Math.abs(mouse.ty) < 0.01 ? mouseIdle + 1 : 0;

    // drift particles upward
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

    // scroll: camera rises, rings drift
    const sc = scrollY * 0.25;
    camera.position.y = -sc * 0.4 + mouse.y * 20;
    camera.position.x = mouse.x * 30;
    camera.lookAt(0, -sc * 0.15, -400);

    renderer.render(scene, camera);
  }
  animate();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}
