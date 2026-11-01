import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Ícones de sinalização desenhados em vetor (sem emoji: nítidos em qualquer tamanho). */
export type SignIcon = 'printer' | 'coffee' | 'bolt' | 'tray' | 'boss' | 'up' | 'down' | 'bell' | 'bag' | 'exit' | 'wc' | 'info' | 'star' | 'pencil';

/** Temas da sinalização: fundo, texto, cor de destaque (círculo do ícone) e moldura. */
const THEMES = {
  dark: { bg: ['#2b3246', '#1f2535'], fg: '#fff8ec', sub: '#aab3c8', frame: '#151a26' },
  light: { bg: ['#fffdf7', '#f1ebdf'], fg: '#1b2233', sub: '#6b7285', frame: '#c9bfae' },
  yellow: { bg: ['#ffd84f', '#f5c62c'], fg: '#2a1c00', sub: '#6b4d00', frame: '#a8820f' },
  blue: { bg: ['#3567b8', '#2a5297'], fg: '#ffffff', sub: '#cfe0ff', frame: '#1c3866' },
  brass: { bg: ['#d9b46a', '#b8904a'], fg: '#2a1d08', sub: '#5a4220', frame: '#7a5a28' },
} as const;
export type SignTheme = keyof typeof THEMES;

export interface SignOpts {
  text: string;
  sub?: string;
  icon?: SignIcon;
  /** Cor do círculo do ícone. */
  accent?: string;
  theme?: SignTheme;
  /** Largura e altura da placa (m). */
  w: number;
  h: number;
  /** Arte dos dois lados (placa solta, de haste ou pendurada). */
  double?: boolean;
  /** Suporte: haste até o chão (`post`, altura do centro), cabos até o teto (`hang`, comprimento), parede (padrão). */
  post?: number;
  hang?: number;
  font?: string;
  /** Brilho próprio (placa iluminada); 0 = só a luz da cena. */
  glow?: number;
}

function icon(g: CanvasRenderingContext2D, id: SignIcon, cx: number, cy: number, s: number) {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 100, s / 100);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  switch (id) {
    case 'printer':
      rr(-22, -36, 44, 22, 3);
      g.fill();
      rr(-38, -16, 76, 34, 8);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(-26, 4, 52, 6);
      g.fillStyle = '#ffffff';
      rr(-24, 10, 48, 28, 3);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-16, 18, 32, 4);
      g.fillRect(-16, 27, 22, 4);
      break;
    case 'coffee':
      rr(-30, -14, 46, 44, 10);
      g.fill();
      g.beginPath();
      g.arc(20, 6, 13, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.lineWidth = 6;
      for (const x of [-18, -7, 4]) {
        g.beginPath();
        g.moveTo(x, -22);
        g.bezierCurveTo(x - 7, -30, x + 7, -36, x, -44);
        g.stroke();
      }
      break;
    case 'bolt':
      g.beginPath();
      g.moveTo(8, -42);
      g.lineTo(-26, 6);
      g.lineTo(-2, 6);
      g.lineTo(-10, 42);
      g.lineTo(26, -8);
      g.lineTo(2, -8);
      g.closePath();
      g.fill();
      break;
    case 'tray':
      g.beginPath();
      g.moveTo(-40, 0);
      g.lineTo(-26, -26);
      g.lineTo(26, -26);
      g.lineTo(40, 0);
      g.lineTo(40, 26);
      g.lineTo(-40, 26);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.moveTo(-30, 0);
      g.lineTo(-12, 0);
      g.lineTo(-8, 10);
      g.lineTo(8, 10);
      g.lineTo(12, 0);
      g.lineTo(30, 0);
      g.lineTo(30, 4);
      g.lineTo(-30, 4);
      g.fill();
      break;
    case 'boss':
      // gravata
      g.beginPath();
      g.moveTo(-12, -40);
      g.lineTo(12, -40);
      g.lineTo(6, -28);
      g.lineTo(16, 26);
      g.lineTo(0, 42);
      g.lineTo(-16, 26);
      g.lineTo(-6, -28);
      g.closePath();
      g.fill();
      break;
    case 'up':
    case 'down':
      if (id === 'down') g.rotate(Math.PI);
      g.beginPath();
      g.moveTo(0, -38);
      g.lineTo(32, 0);
      g.lineTo(12, 0);
      g.lineTo(12, 36);
      g.lineTo(-12, 36);
      g.lineTo(-12, 0);
      g.lineTo(-32, 0);
      g.closePath();
      g.fill();
      break;
    case 'bell':
      g.beginPath();
      g.arc(0, 12, 34, Math.PI, 0);
      g.fill();
      rr(-42, 12, 84, 10, 4);
      g.fill();
      g.beginPath();
      g.arc(0, -26, 6, 0, Math.PI * 2);
      g.fill();
      rr(-36, 28, 72, 8, 3);
      g.fill();
      break;
    case 'bag':
      rr(-32, -14, 64, 54, 8);
      g.fill();
      g.beginPath();
      g.arc(0, -14, 16, Math.PI, 0);
      g.stroke();
      break;
    case 'exit':
      rr(-34, -40, 40, 80, 4);
      g.fill();
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(-4, 0);
      g.lineTo(38, 0);
      g.moveTo(24, -14);
      g.lineTo(38, 0);
      g.lineTo(24, 14);
      g.stroke();
      break;
    case 'wc':
      g.beginPath();
      g.arc(-20, -30, 9, 0, Math.PI * 2);
      g.arc(20, -30, 9, 0, Math.PI * 2);
      g.fill();
      rr(-30, -16, 20, 34, 6);
      g.fill();
      g.beginPath();
      g.moveTo(20, -18);
      g.lineTo(36, 18);
      g.lineTo(4, 18);
      g.closePath();
      g.fill();
      g.fillRect(-28, 14, 6, 26);
      g.fillRect(-18, 14, 6, 26);
      g.fillRect(12, 16, 6, 24);
      g.fillRect(22, 16, 6, 24);
      break;
    case 'info':
      g.beginPath();
      g.arc(0, -26, 8, 0, Math.PI * 2);
      g.fill();
      rr(-8, -10, 16, 46, 4);
      g.fill();
      break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 17 : 40;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'pencil':
      g.rotate(-Math.PI / 4);
      rr(-10, -38, 20, 58, 3);
      g.fill();
      g.beginPath();
      g.moveTo(-10, 24);
      g.lineTo(10, 24);
      g.lineTo(0, 42);
      g.closePath();
      g.fill();
      break;
  }
  g.restore();
}

const FRAME_CACHE = new Map<string, THREE.MeshStandardMaterial>();
const frameMat = (c: string) => {
  let m = FRAME_CACHE.get(c);
  if (!m) FRAME_CACHE.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.35 })));
  return m;
};
const POLE = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.35, metalness: 0.7 });

/** Arte da placa num canvas de alta resolução (proporção da placa, ~1100 px por metro, até 1024 de largura). */
export function plaqueTex(o: SignOpts) {
  const th = THEMES[o.theme ?? 'dark'];
  const W = 1024;
  const H = Math.max(64, Math.round((W * o.h) / o.w));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = Math.min(H * 0.22, 60);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, th.bg[0]);
  bg.addColorStop(1, th.bg[1]);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, W, H, r);
  g.fill();
  // filete interno
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = Math.max(3, H * 0.025);
  g.beginPath();
  g.roundRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14, r * 0.7);
  g.stroke();
  const pad = H * 0.16;
  let x = pad + H * 0.05;
  if (o.icon) {
    const d = H - pad * 2;
    g.fillStyle = o.accent ?? '#ff8a3d';
    g.beginPath();
    g.arc(x + d / 2, H / 2, d / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.arc(x + d / 2, H / 2 + d * 0.06, d / 2, 0, Math.PI);
    g.fill();
    icon(g, o.icon, x + d / 2, H / 2, d * 0.62);
    x += d + H * 0.2;
  }
  const font = o.font ?? 'Fredoka';
  const avail = W - x - pad;
  const centered = !o.icon;
  g.textBaseline = 'middle';
  g.textAlign = centered ? 'center' : 'left';
  const tx = centered ? W / 2 : x;
  let size = Math.floor(H * (o.sub ? 0.36 : 0.46));
  g.font = `700 ${size}px ${font}, sans-serif`;
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${Math.round(size * 0.06)}px`;
  while (g.measureText(o.text).width > avail && size > 12) {
    size -= 2;
    g.font = `700 ${size}px ${font}, sans-serif`;
  }
  g.fillStyle = th.fg;
  const ty = o.sub ? H * 0.4 : H * 0.53;
  g.fillText(o.text, tx, ty);
  if (o.sub) {
    let ss = Math.floor(H * 0.2);
    g.font = `600 ${ss}px Fredoka, sans-serif`;
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1px';
    while (g.measureText(o.sub).width > avail && ss > 10) {
      ss -= 1;
      g.font = `600 ${ss}px Fredoka, sans-serif`;
    }
    g.fillStyle = th.sub;
    g.fillText(o.sub, tx, H * 0.72);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Placa de sinalização: moldura com espessura, arte nítida (com ícone vetorial) e um brilho próprio leve, para ler bem
 * sem "acender" como um adesivo. O grupo tem a frente virada para +z (gire o grupo para posicionar).
 */
export function makeSign(o: SignOpts) {
  const th = THEMES[o.theme ?? 'dark'];
  const g = new THREE.Group();
  const depth = 0.035;
  const fr = new THREE.Mesh(new RoundedBoxGeometry(o.w + 0.03, o.h + 0.03, depth, 2, Math.min(0.015, o.h * 0.12)), frameMat(th.frame));
  fr.castShadow = true;
  fr.receiveShadow = true;
  g.add(fr);
  const tex = plaqueTex(o);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: o.glow ?? 0.28, transparent: true });
  const geo = new THREE.PlaneGeometry(o.w, o.h);
  const face = new THREE.Mesh(geo, m);
  face.position.z = depth / 2 + 0.002;
  g.add(face);
  if (o.double) {
    const back = new THREE.Mesh(geo, m);
    back.rotation.y = Math.PI;
    back.position.z = -depth / 2 - 0.002;
    g.add(back);
  }
  if (o.post) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, o.post - o.h / 2, 10), POLE);
    pole.position.y = -(o.post - o.h / 2) / 2 - o.h / 2;
    pole.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.03, 18), POLE);
    foot.position.y = -o.post + 0.015;
    g.add(pole, foot);
  }
  if (o.hang) {
    for (const dx of [-o.w * 0.38, o.w * 0.38]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, o.hang, 4), POLE);
      cable.position.set(dx, o.h / 2 + o.hang / 2, 0);
      g.add(cable);
    }
  }
  return g;
}
