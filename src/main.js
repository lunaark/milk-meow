import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ToyMotion } from './motion.js';
import { createCat } from './cat.js';
import './style.css';

const canvas = document.querySelector('#toy');
const stage = document.querySelector('#stage');
const feeling = document.querySelector('#feeling');
const firmness = document.querySelector('#firmness');
const damping = document.querySelector('#damping');
const calm = document.querySelector('#calm');
const motion = new ToyMotion();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
} catch {
  document.querySelector('#error').hidden = false;
  document.querySelector('#error').textContent = '暂时无法打开 3D 画面。请开启浏览器硬件加速，或换一个支持 WebGL 2 的浏览器。';
  document.querySelectorAll('button,input').forEach(el => el.disabled = true);
}
if (renderer) start();

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
  camera.position.set(0, 3.05, 7.8);
  camera.lookAt(0, 1.05, 0);
  const env = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(env, .08);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = .68;
  env.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fff8e8', '#b7ac98', 2.0));
  const sun = new THREE.DirectionalLight('#fff5df', 3.5);
  sun.position.set(-3, 6, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -3;
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.0001;
  sun.shadow.radius = 4;
  scene.add(sun);
  const cat = createCat();
  scene.add(cat.group);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({
    color: '#807364',
    opacity: .13
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = .01;
  floor.receiveShadow = true;
  scene.add(floor);
  // Soft painted contact shadow, generated locally rather than loaded as an asset.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(99,77,51,.20)');
  gradient.addColorStop(.6, 'rgba(99,77,51,.09)');
  gradient.addColorStop(1, 'rgba(99,77,51,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.3), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas),
    transparent: true,
    depthWrite: false
  }));
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .014;
  scene.add(contactShadow);
  let contact = null, pointer = null, autoRemaining = 0, flavor = 'milk', contextLost = false, idleLabel = false;
  let presses = 0, frameCount = 0, activeMs = 0;
  calm.checked = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const box = stage.getBoundingClientRect();
    renderer.setSize(box.width, box.height, false);
    camera.aspect = box.width / box.height;
    camera.position.z = camera.aspect < .85 ? 9.0 : 7.8;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  function release() {
    pointer = null;
    autoRemaining = 0;
    motion.release();
    idleLabel = false;
    feeling.textContent = '慢慢弹回来，慢慢放松';
  }

  function press() {
    if (contextLost) return;
    autoRemaining = .36;
    contact = {
      x: 0,
      y: 2,
      z: 0,
      nx: 0,
      ny: 1,
      nz: 0
    };
    motion.setTarget({
      press: .58
    });
    presses++;
    feeling.textContent = '把烦恼，轻轻按下去';
  }

  function reset() {
    release();
    motion.reset();
    contact = null;
    firmness.value = '0.45';
    damping.value = '0.35';
    calm.checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setFlavor('milk');
    feeling.textContent = '今天也要软乎乎';
  }

  function setFlavor(name) {
    flavor = name;
    cat.setFlavor(name);
    document.querySelectorAll('[data-flavor]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.flavor === name)));
    document.querySelector('.card-heading span:last-child').textContent = {
      milk: '01 / 03',
      berry: '02 / 03',
      matcha: '03 / 03'
    }[name];
  }
  document.querySelectorAll('[data-flavor]').forEach(b => b.addEventListener('click', () => setFlavor(b.dataset.flavor)));
  document.querySelector('#press').addEventListener('click', press);
  document.querySelector('#sway').addEventListener('click', () => {
    release();
    autoRemaining = .22;
    motion.setTarget({
      press: .08,
      pullX: .65,
      pullY: .25
    });
    feeling.textContent = '晃一晃，什么都不着急';
  });
  document.querySelector('#reset').addEventListener('click', reset);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0 || contextLost) return;
    const box = canvas.getBoundingClientRect();
    ndc.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(cat.body)[0];
    if (!hit) return;
    autoRemaining = 0;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({
      preventScroll: true
    });
    // Map a deformed hit back to the original triangle, including during recoil.
    const indices = [hit.face.a, hit.face.b, hit.face.c];
    const current = indices.map(i => new THREE.Vector3().fromBufferAttribute(cat.body.geometry.attributes.position, i));
    const weights = new THREE.Triangle(...current).getBarycoord(hit.point, new THREE.Vector3());
    const rest = indices.map(i => new THREE.Vector3().fromArray(cat.body.userData.rest, i * 3));
    const anchor = rest[0].clone()
      .multiplyScalar(weights.x)
      .addScaledVector(rest[1], weights.y)
      .addScaledVector(rest[2], weights.z);
    const n = new THREE.Triangle(...rest).getNormal(new THREE.Vector3());
    contact = {
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      nx: n.x,
      ny: n.y,
      nz: n.z
    };
    motion.setTarget({
      press: .32
    });
    presses++;
    feeling.textContent = '捏住啦，试着轻轻拉一拉';
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const box = canvas.getBoundingClientRect();
    const dx = (event.clientX - pointer.x) / box.width;
    const dy = (event.clientY - pointer.y) / box.height;
    motion.setTarget({
      press: THREE.MathUtils.clamp(.32 + dy * 2, -.18, .7),
      pullX: dx * 3,
      pullY: dy * .5
    });
  });
  const endPointer = event => {
    if (pointer?.id === event.pointerId) release();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release();
  });
  canvas.addEventListener('keydown', event => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) press();
    }
    if (event.key.toLowerCase() === 'r') reset();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    release();
    document.querySelector('#error').hidden = false;
    document.querySelector('#error').textContent = '画面连接中断，请刷新页面继续。';
  });
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05);
    if (contextLost || document.hidden) return;
    if (autoRemaining > 0) {
      autoRemaining -= dt;
      if (autoRemaining <= 0) release();
    }
    const state = motion.step(dt, Number(firmness.value), calm.checked ? 1 : Number(damping.value));
    cat.update(state, contact);
    contactShadow.scale.set(1 + state.press * .2, 1 + state.press * .1, 1);
    if (state.settled && !pointer && autoRemaining <= 0) {
      if (!idleLabel) {
        feeling.textContent = '今天也要软乎乎';
        idleLabel = true;
      }
    } else idleLabel = false;
    renderer.render(scene, camera);
    frameCount++;
    activeMs += dt * 1000;
  });
  if (new URLSearchParams(location.search).has('inspect')) {
    window.__MILK_MEOW__ = {
      read: () => ({
        state: motion.state,
        pointer: !!pointer,
        flavor,
        presses,
        frames: frameCount,
        meanFrameMs: activeMs / Math.max(1, frameCount),
        renderer: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles
        },
        canvas: {
          width: canvas.width,
          height: canvas.height
        },
        meshes: cat.group.children.length
      }),
      press,
      reset
    };
  }
}
