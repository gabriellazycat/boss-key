import '@fontsource/darumadrop-one/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/jetbrains-mono/700.css';
import './lab.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONCEPTS, ROLES, type Concept } from '../characters/designs';
import type { Expr } from '../characters/Face2D';
import type { Action, Character } from '../characters/rig';

/**
 * Laboratório de personagens: mostra as 5 propostas lado a lado (visão geral) ou o elenco
 * completo de cada uma, com as expressões do jogo, andar/pular e zoom no rosto.
 */

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const BG_TOP = '#c9d8f0';
const BG_BOT = '#f2e4d6';
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, BG_TOP);
  gr.addColorStop(0.62, '#e6e3ea');
  gr.addColorStop(1, BG_BOT);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
camera.position.set(0, 1.6, 9);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.8;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.53;
controls.minPolarAngle = Math.PI * 0.18;
controls.target.set(0, 0.7, 0);

// luz: chave quente, contra-luz fria (silhueta), céu/chão
scene.add(new THREE.HemisphereLight('#e4ecff', '#c9b8a6', 1.1));
const key = new THREE.DirectionalLight('#fff0d8', 1.9);
key.position.set(-4, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight('#bcd2ff', 1.3);
rim.position.set(5, 4, -6);
scene.add(rim);
const fill = new THREE.DirectionalLight('#ffd9e6', 0.5);
fill.position.set(6, 2, 4);
scene.add(fill);

// chão com degradê radial
{
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  gr.addColorStop(0, '#f8f2ec');
  gr.addColorStop(0.55, '#efe5dc');
  gr.addColorStop(1, '#ece2da');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ map: t }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.45, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/** Largura ocupada pelo painel da direita (a cena se centraliza no espaço que sobra). */
function panelW() {
  const card = document.getElementById('card');
  if (!card || window.innerWidth <= 760 || card.offsetWidth === 0) return 0;
  return card.offsetWidth + 20;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // deslocamento de lente: empurra o centro da imagem para a esquerda do painel
  const f = panelW() / 2 / w;
  camera.filmOffset = f * camera.aspect * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.getFilmWidth();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ elenco em cena

interface Slot {
  ch: Character;
  x: number;
  plate: HTMLDivElement;
  pedestal: THREE.Group;
  delay: number;
}

const stage = new THREE.Group();
scene.add(stage);
let slots: Slot[] = [];
let view: 'overview' | number = 'overview';
let expr: Expr = 'normal';
let action: Action = 'idle';
let auto = true;
let autoT = 0;
let autoI = 0;
const AUTO: Expr[] = ['normal', 'alert', 'happy', 'talk', 'clutch', 'bored', 'caught', 'sleep'];

function pedestal(r: number, accent: string) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, 0.05, 48), new THREE.MeshToonMaterial({ color: '#fbf8f3' }));
  top.position.y = -0.02;
  top.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: accent }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.004;
  g.add(top, ring);
  return g;
}

function clearStage() {
  for (const s of slots) {
    stage.remove(s.ch.root, s.pedestal);
    s.plate.remove();
    s.ch.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
  slots = [];
}

const labels = document.getElementById('labels')!;

function build(v: 'overview' | number) {
  clearStage();
  view = v;
  const items: { ch: Character; title: string; sub: string; color: string }[] = [];
  if (v === 'overview') {
    for (const c of CONCEPTS) items.push({ ch: c.build('voce'), title: `${c.n} · ${c.name}`, sub: c.ref, color: c.accent });
  } else {
    const c = CONCEPTS[v];
    for (const r of ROLES) items.push({ ch: c.build(r.id), title: r.label, sub: r.job, color: c.accent });
  }
  const widths = items.map((it) => Math.max(0.95, 0.95 * it.ch.scale));
  const gap = v === 'overview' ? 0.55 : 0.28;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = -total / 2;
  items.forEach((it, i) => {
    const cx = x + widths[i] / 2;
    x += widths[i] + gap;
    it.ch.root.position.set(cx, 0.03, 0);
    it.ch.action = action;
    stage.add(it.ch.root);
    const ped = pedestal(0.42 * Math.max(1, it.ch.scale * 0.92), it.color);
    ped.position.set(cx, 0.03, 0);
    stage.add(ped);
    const plate = document.createElement('div');
    plate.className = 'plate';
    plate.style.setProperty('--c', it.color);
    plate.innerHTML = `<b>${it.title}</b><span>${it.sub}</span>`;
    labels.appendChild(plate);
    const s: Slot = { ch: it.ch, x: cx, plate, pedestal: ped, delay: i * 0.09 };
    s.ch.root.traverse((o) => (o.userData.slot = s));
    slots.push(s);
  });
  applyExpr(expr, true);
  frame(total);
  renderTabs();
  renderCard();
}

// ------------------------------------------------------------------ câmera (enquadrar / focar)

let tween: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number } | null = null;
let focused: Slot | null = null;

function moveCam(pos: THREE.Vector3, target: THREE.Vector3) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, k: 0 };
}

let lastTotal = 6;
function frame(total = lastTotal) {
  lastTotal = total;
  focused = null;
  const free = (window.innerWidth - panelW()) / window.innerWidth;
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect * free);
  const dist = Math.max(3.2, (total / 2 + 0.45) / Math.tan(hfov / 2));
  const tgt = new THREE.Vector3(0, 0.72, 0);
  moveCam(new THREE.Vector3(0, 1.25 + dist * 0.07, dist), tgt);
}

function focus(s: Slot) {
  focused = s;
  const h = s.ch.top * s.ch.scale;
  const tgt = new THREE.Vector3(s.x, h - 0.28 * s.ch.scale, 0);
  moveCam(new THREE.Vector3(s.x + 0.25, h - 0.1, 1.9 * Math.max(1, s.ch.scale * 0.85)), tgt);
}

// ------------------------------------------------------------------ olhar segue o mouse

const mouse = new THREE.Vector2(0, 0);
let mouseIn = false;
const ray = new THREE.Raycaster();
const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.4);
const lookP = new THREE.Vector3();
canvas.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouseIn = true;
});
canvas.addEventListener('pointerleave', () => (mouseIn = false));

let downAt = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(slots.map((s) => s.ch.root), true).find((h) => h.object.userData.slot);
  const s = hit?.object.userData.slot as Slot | undefined;
  if (s && s !== focused) focus(s);
  else if (!s || s === focused) {
    if (focused) frame();
  }
});

// ------------------------------------------------------------------ UI

const EXPRS: { id: Expr; label: string; key: string }[] = [
  { id: 'normal', label: 'Normal', key: 'N' },
  { id: 'alert', label: 'Alerta', key: 'A' },
  { id: 'clutch', label: 'Pânico', key: 'P' },
  { id: 'caught', label: 'Pego!', key: 'G' },
  { id: 'bored', label: 'Tédio', key: 'T' },
  { id: 'happy', label: 'Feliz', key: 'F' },
  { id: 'talk', label: 'Falando', key: 'L' },
  { id: 'sleep', label: 'Soneca', key: 'Z' },
];
const ACTS: { id: Action; label: string }[] = [
  { id: 'idle', label: 'Parado' },
  { id: 'walk', label: 'Andando' },
  { id: 'jump', label: 'Pulando' },
];

const exprsEl = document.getElementById('exprs')!;
const actsEl = document.getElementById('acts')!;
const autoEl = document.getElementById('auto') as HTMLButtonElement;
const tabsEl = document.getElementById('tabs')!;
const cardEl = document.getElementById('card')!;

function applyExpr(e: Expr, instant = false) {
  expr = e;
  for (const s of slots) {
    if (instant) s.ch.setExpr(e);
    else setTimeout(() => s.ch.setExpr(e), s.delay * 1000);
  }
  for (const b of exprsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === e);
}

function setAuto(on: boolean) {
  auto = on;
  autoT = 0;
  autoEl.classList.toggle('on', on);
  autoEl.textContent = on ? '▶ Demo' : '❚❚ Demo';
}

for (const e of EXPRS) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.id = e.id;
  b.innerHTML = `${e.label} <kbd>${e.key}</kbd>`;
  b.onclick = () => {
    setAuto(false);
    applyExpr(e.id);
  };
  exprsEl.appendChild(b);
}
for (const a of ACTS) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.id = a.id;
  b.textContent = a.label;
  b.onclick = () => setAction(a.id);
  actsEl.appendChild(b);
}
function setAction(a: Action) {
  action = a;
  for (const s of slots) s.ch.action = a;
  for (const b of actsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === a);
}
setAction('idle');
autoEl.onclick = () => setAuto(!auto);

function renderTabs() {
  tabsEl.innerHTML = '';
  const mk = (v: 'overview' | number, html: string, color?: string) => {
    const b = document.createElement('button');
    b.className = `tab${view === v ? ' on' : ''}`;
    if (color) b.style.setProperty('--c', color);
    b.innerHTML = html;
    b.onclick = () => build(v);
    tabsEl.appendChild(b);
  };
  mk('overview', 'Visão geral');
  CONCEPTS.forEach((c, i) => mk(i, `<span class="n">${c.n}</span>${c.name} <small>${c.ref}</small>`, c.accent));
}

function renderCard() {
  if (view === 'overview') {
    cardEl.style.setProperty('--accent', '#1d1b2c');
    cardEl.innerHTML = `
      <span class="ref">Visão geral</span>
      <h2>5 caminhos</h2>
      <p>O mesmo "Você" nas cinco propostas. Todas trocam a bola com olhos 3D por <b>corpo com braços e pernas</b> e um <b>rosto 2D animado</b> desenhado em tempo real: pisca, olha para o mouse, muda de pálpebra, boca, suor e rubor.</p>
      <h3>Abrir o elenco</h3>
      <div class="grid">${CONCEPTS.map((c, i) => `<button class="pick" data-i="${i}" style="border-left:4px solid ${c.accent}"><b>${c.n}. ${c.name}</b><span>${c.ref}</span></button>`).join('')}</div>
      <div class="port"><b>Dica:</b> as expressões são as mesmas do jogo (alerta, pânico, pego, tédio, feliz) e ainda tem falando e soneca.</div>`;
    for (const b of cardEl.querySelectorAll<HTMLButtonElement>('.pick')) b.onclick = () => build(Number(b.dataset.i));
    return;
  }
  const c: Concept = CONCEPTS[view];
  cardEl.style.setProperty('--accent', c.accent);
  cardEl.innerHTML = `
    <span class="ref">Inspiração · ${c.ref}</span>
    <h2>${c.name} <span class="num">proposta ${c.n}/5</span></h2>
    <p>${c.pitch}</p>
    <h3>Rosto 2D</h3>
    <p>${c.face}</p>
    <h3>Pontos fortes</h3>
    <ul>${c.good.map((g) => `<li>${g}</li>`).join('')}</ul>
    <h3>Atenção</h3>
    <ul class="watch">${c.watch.map((g) => `<li>${g}</li>`).join('')}</ul>
    <div class="port"><b>Portar pro jogo:</b> ${c.port}</div>`;
}

window.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '5') build(e.key === '0' ? 'overview' : Number(e.key) - 1);
  const ex = EXPRS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
  if (ex) {
    setAuto(false);
    applyExpr(ex.id);
  }
  if (e.key === 'Escape') frame();
  if (e.key === ' ') setAction(action === 'walk' ? 'idle' : 'walk');
});

// ------------------------------------------------------------------ laço

const _v = new THREE.Vector3();
let last = performance.now();
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  requestAnimationFrame(tick);
}

function step(dt: number) {
  if (auto) {
    autoT += dt;
    if (autoT > 2.4) {
      autoT = 0;
      autoI = (autoI + 1) % AUTO.length;
      applyExpr(AUTO[autoI]);
    }
  }
  if (tween) {
    tween.k = Math.min(1, tween.k + dt * 1.6);
    const k = 1 - Math.pow(1 - tween.k, 3);
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (tween.k >= 1) tween = null;
  }
  controls.update();
  // alvo do olhar: mouse projetado num plano à frente; sem mouse, a câmera
  if (mouseIn) {
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(lookPlane, lookP);
  } else lookP.copy(camera.position);
  for (const s of slots) {
    s.ch.lookAt.copy(lookP);
    s.ch.update(dt);
  }
  composer.render(dt);
  // plaquinhas
  for (const s of slots) {
    _v.set(s.x, 0.03, 0.5 * Math.max(1, s.ch.scale * 0.9));
    _v.project(camera);
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    s.plate.style.left = `${x}px`;
    s.plate.style.top = `${y + 6}px`;
    s.plate.style.opacity = focused && focused !== s ? '0' : _v.z < 1 ? '1' : '0';
  }
}

build('overview');
requestAnimationFrame(tick);

// depuração: ?debug expõe controles para prints com o painel em segundo plano
if (location.search.includes('debug')) {
  const w = window as unknown as Record<string, unknown>;
  w.lab = {
    build,
    focus: (i: number) => focus(slots[i]),
    frame: () => frame(),
    expr: (e: Expr) => {
      setAuto(false);
      applyExpr(e, true);
    },
    act: setAction,
    step: (secs: number) => {
      for (let i = 0; i < secs * 30; i++) step(1 / 30);
    },
    cam: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
      tween = null;
      camera.position.set(x, y, z);
      controls.target.set(tx, ty, tz);
      controls.update();
    },
    slots: () => slots,
    ui: (on: boolean) => {
      for (const sel of ['#card', '.dock', '.top', '#labels', '#hint']) (document.querySelector(sel) as HTMLElement).style.display = on ? '' : 'none';
      resize();
    },
    /** Enquadra os personagens a..b (índices) sem animação. */
    closeup: (a: number, b: number, y = 0.72, h = 1.05, zoom = 1.05) => {
      const x0 = slots[a].x;
      const x1 = slots[b].x;
      const cx = (x0 + x1) / 2;
      const span = Math.abs(x1 - x0) + 1.0;
      const d = (span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.aspect) * zoom;
      tween = null;
      camera.position.set(cx, h, d);
      controls.target.set(cx, y, 0);
      controls.update();
      step(0.2);
    },
  };
}
