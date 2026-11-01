import * as THREE from 'three';

/** Texturas do térreo (saguão e rua). Tudo pintado em canvas, sem imagem externa. */

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number], srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Gerador com semente: a mesma rua todo dia. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, r: () => number, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

/** Veio de mármore: curva longa, tremida, desenhada em camadas (borrada embaixo, fina em cima). */
function vein(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, len: number, col: string) {
  const pts: [number, number][] = [];
  let x = x0;
  let y = y0;
  let a = r() * Math.PI * 2;
  for (let i = 0; i < 18; i++) {
    pts.push([x, y]);
    a += (r() - 0.5) * 0.9;
    x += Math.cos(a) * (len / 18);
    y += Math.sin(a) * (len / 18);
  }
  // halo largo e fraco por baixo, fio fino por cima (o mesmo efeito de um desfoque, sem o custo do filtro)
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [lw, al] of [[12, 0.03], [6, 0.05], [2.2, 0.2], [0.8, 0.4]] as const) {
    g.strokeStyle = col.replace('A', String(al));
    g.lineWidth = lw;
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.stroke();
  }
}

/** Piso de mármore claro em placas (4×4 placas por textura) com veios e rejunte fino. */
export const marbleTex = (rep: [number, number]) =>
  canvas(1024, 1024, (g) => {
    const r = rng(7);
    const N = 4;
    const s = 1024 / N;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const k = 236 + Math.floor(r() * 10);
        g.fillStyle = `rgb(${k},${k - 5},${k - 13})`;
        g.fillRect(x * s, y * s, s, s);
        const gr = g.createRadialGradient(x * s + r() * s, y * s + r() * s, 0, x * s + s / 2, y * s + s / 2, s);
        gr.addColorStop(0, 'rgba(255,255,255,0.35)');
        gr.addColorStop(1, 'rgba(200,190,175,0.12)');
        g.fillStyle = gr;
        g.fillRect(x * s, y * s, s, s);
      }
    g.save();
    g.beginPath();
    g.rect(0, 0, 1024, 1024);
    g.clip();
    for (let i = 0; i < 26; i++) vein(g, r, r() * 1024, r() * 1024, 260 + r() * 520, 'rgba(120,112,104,A)');
    for (let i = 0; i < 10; i++) vein(g, r, r() * 1024, r() * 1024, 200 + r() * 300, 'rgba(176,150,112,A)');
    g.restore();
    noise(g, 1024, 1024, 6000, 0.05, r);
    g.strokeStyle = 'rgba(150,138,122,0.75)';
    g.lineWidth = 3;
    for (let i = 0; i <= N; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, 1024);
      g.moveTo(0, i * s);
      g.lineTo(1024, i * s);
      g.stroke();
    }
  }, rep);

/** Granito escuro (faixas do piso, parede dos elevadores, balcões). */
export const graniteTex = (base = '#2c2f37', rep: [number, number] = [2, 2]) =>
  canvas(512, 512, (g) => {
    const r = rng(11);
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const t = r();
      g.fillStyle = t < 0.5 ? `rgba(0,0,0,${0.2 + r() * 0.3})` : t < 0.85 ? `rgba(160,150,140,${0.12 + r() * 0.2})` : `rgba(230,210,180,${0.2 + r() * 0.3})`;
      const sz = 1 + r() * 3;
      g.fillRect(r() * 512, r() * 512, sz, sz);
    }
  }, rep);

/** Pedra clara (travertino) em painéis de 2 × 1 m com junta funda. A textura cobre 4 × 2 m. */
export const stoneTex = (rep: [number, number]) =>
  canvas(1024, 512, (g) => {
    const r = rng(23);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const k = 222 + Math.floor(r() * 12);
        g.fillStyle = `rgb(${k},${k - 9},${k - 24})`;
        g.fillRect(x * 512, y * 256, 512, 256);
        // estrias horizontais do travertino
        for (let i = 0; i < 26; i++) {
          g.fillStyle = `rgba(${150 + r() * 40},${130 + r() * 30},${100 + r() * 20},${0.05 + r() * 0.08})`;
          g.fillRect(x * 512, y * 256 + r() * 256, 512, 1 + r() * 4);
        }
        for (let i = 0; i < 60; i++) {
          g.fillStyle = `rgba(120,100,80,${0.05 + r() * 0.12})`;
          g.beginPath();
          g.ellipse(x * 512 + r() * 512, y * 256 + r() * 256, 2 + r() * 8, 1 + r() * 2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    noise(g, 1024, 512, 4000, 0.05, r);
    g.fillStyle = 'rgba(90,72,52,0.55)';
    for (const x of [0, 512]) g.fillRect(x, 0, 4, 512);
    for (const y of [0, 256]) g.fillRect(0, y, 1024, 4);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (const x of [4, 516]) g.fillRect(x, 0, 2, 512);
    for (const y of [4, 260]) g.fillRect(0, y, 1024, 2);
  }, rep);

/** Ripado de madeira (parede da recepção). */
export const slatTex = (rep: [number, number]) =>
  canvas(512, 512, (g) => {
    const r = rng(31);
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      const x = i * 64;
      const base = 120 + r() * 30;
      const gr = g.createLinearGradient(x, 0, x + 52, 0);
      gr.addColorStop(0, `rgb(${base * 0.75},${base * 0.5},${base * 0.3})`);
      gr.addColorStop(0.5, `rgb(${base},${base * 0.66},${base * 0.4})`);
      gr.addColorStop(1, `rgb(${base * 0.7},${base * 0.46},${base * 0.28})`);
      g.fillStyle = gr;
      g.fillRect(x + 6, 0, 52, 512);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(60,30,10,${0.06 + r() * 0.1})`;
        g.fillRect(x + 6 + r() * 52, 0, 1 + r() * 2, 512);
      }
    }
  }, rep);

/** Calçada de placas de concreto (60 cm), com manchas. A textura cobre 2,4 × 2,4 m. */
export const pavingTex = (rep: [number, number]) =>
  canvas(512, 512, (g) => {
    const r = rng(41);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const k = 196 + Math.floor(r() * 18);
        g.fillStyle = `rgb(${k},${k - 2},${k - 6})`;
        g.fillRect(x * 128, y * 128, 128, 128);
      }
    noise(g, 512, 512, 7000, 0.08, r);
    for (let i = 0; i < 14; i++) {
      const gr = g.createRadialGradient(r() * 512, r() * 512, 0, r() * 512, r() * 512, 20 + r() * 50);
      gr.addColorStop(0, 'rgba(60,60,60,0.12)');
      gr.addColorStop(1, 'rgba(60,60,60,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 512, 512);
    }
    g.fillStyle = 'rgba(80,80,80,0.6)';
    for (let i = 0; i <= 4; i++) {
      g.fillRect(i * 128 - 2, 0, 3, 512);
      g.fillRect(0, i * 128 - 2, 512, 3);
    }
  }, rep);

/** Asfalto. A textura cobre 4 × 4 m. */
export const asphaltTex = (rep: [number, number]) =>
  canvas(512, 512, (g) => {
    const r = rng(53);
    g.fillStyle = '#3d4047';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 22000, 0.16, r, 2);
    for (let i = 0; i < 10; i++) {
      g.strokeStyle = `rgba(20,20,22,${0.25 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      let x = r() * 512;
      let y = r() * 512;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, rep);

export type FacadeStyle = { wall: string; trim: string; glass: [string, string]; frame: string; bays: number; floors: number; band?: string };

/**
 * Fachada de prédio (só os andares de cima): janelas com caixilho, peitoril e reflexo do céu. Devolve a arte de dia
 * e a camada das janelas acesas (para somar à noite). Cobre `bays` vãos × `floors` andares.
 */
export function facadeTex(st: FacadeStyle, seed: number) {
  const r = rng(seed);
  const bw = 128;
  const fh = 160;
  const W = st.bays * bw;
  const H = st.floors * fh;
  const lit = document.createElement('canvas');
  lit.width = W;
  lit.height = H;
  const lg = lit.getContext('2d')!;
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, W, H);
  const day = canvas(W, H, (g) => {
    g.fillStyle = st.wall;
    g.fillRect(0, 0, W, H);
    noise(g, W, H, (W * H) / 40, 0.06, r, 2);
    for (let f = 0; f < st.floors; f++) {
      const y = f * fh;
      if (st.band) {
        g.fillStyle = st.band;
        g.fillRect(0, y + fh - 18, W, 18);
      }
      for (let b = 0; b < st.bays; b++) {
        const x = b * bw;
        const wx = x + 18;
        const wy = y + 26;
        const ww = bw - 36;
        const wh = fh - 62;
        // sombra do vão
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(wx - 4, wy - 4, ww + 8, wh + 10);
        const gr = g.createLinearGradient(0, wy, 0, wy + wh);
        gr.addColorStop(0, st.glass[0]);
        gr.addColorStop(1, st.glass[1]);
        g.fillStyle = gr;
        g.fillRect(wx, wy, ww, wh);
        // reflexo diagonal
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.moveTo(wx + ww * 0.15, wy);
        g.lineTo(wx + ww * 0.45, wy);
        g.lineTo(wx + ww * 0.1, wy + wh);
        g.lineTo(wx, wy + wh);
        g.lineTo(wx, wy + wh * 0.6);
        g.fill();
        // cortina ou persiana em algumas
        if (r() < 0.35) {
          g.fillStyle = ['rgba(240,230,210,0.55)', 'rgba(200,215,230,0.5)', 'rgba(230,200,170,0.5)'][Math.floor(r() * 3)];
          g.fillRect(wx, wy, ww, wh * (0.2 + r() * 0.5));
        }
        g.fillStyle = st.frame;
        g.fillRect(wx, wy, ww, 4);
        g.fillRect(wx, wy + wh - 4, ww, 4);
        g.fillRect(wx, wy, 4, wh);
        g.fillRect(wx + ww - 4, wy, 4, wh);
        g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
        g.fillStyle = st.trim;
        g.fillRect(wx - 8, wy + wh + 2, ww + 16, 8);
        if (r() < 0.55) {
          lg.fillStyle = ['#ffd27a', '#ffe7b0', '#cfe6ff', '#ffc070'][Math.floor(r() * 4)];
          lg.globalAlpha = 0.65 + r() * 0.35;
          lg.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
          lg.globalAlpha = 1;
        }
      }
    }
  });
  const lights = new THREE.CanvasTexture(lit);
  lights.colorSpace = THREE.SRGBColorSpace;
  return { day, lights };
}

/** Estilos de prédio da vizinhança (cada textura cobre 4 vãos × 4 andares = 8 × 12 m e se repete). */
const FACADE_STYLES: FacadeStyle[] = [
  { wall: '#d9c3a5', trim: '#efe3cf', glass: ['#9cc1d8', '#56728a'], frame: '#efe9df', bays: 4, floors: 4 },
  { wall: '#8f9aa8', trim: '#c9cfd8', glass: ['#b6d5ea', '#4c6378'], frame: '#2b3038', bays: 4, floors: 4, band: '#76808d' },
  { wall: '#c98a6a', trim: '#f0d8c4', glass: ['#a9cbe0', '#5a6f80'], frame: '#fff6e6', bays: 4, floors: 4 },
  { wall: '#e8e1d2', trim: '#ffffff', glass: ['#8fb3cc', '#3e5568'], frame: '#4a4f58', bays: 4, floors: 4, band: '#d4cbbb' },
  { wall: '#6f7f6a', trim: '#d8dccf', glass: ['#b0cfdf', '#52697a'], frame: '#f2efe6', bays: 4, floors: 4 },
];
let facades: { style: FacadeStyle; day: THREE.Texture; lights: THREE.Texture }[] | null = null;

/** As 5 fachadas (dia + janelas acesas), feitas uma vez só e repetidas por UV (rua do térreo e cidade da janela). */
export function facadeSet() {
  return (facades ??= FACADE_STYLES.map((style, i) => {
    const t = facadeTex(style, 300 + i);
    for (const tx of [t.day, t.lights]) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return { style, ...t };
  }));
}

/** Escala o UV de uma geometria para a fachada repetir a cada 8 × 12 m (sem esticar). */
export function facadeUV(g: THREE.BufferGeometry, w: number, h: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 8), uv.getY(i) * (h / 12));
  uv.needsUpdate = true;
  return g;
}

/** Térreo de um prédio vizinho: loja com toldo, vitrine e letreiro. */
export function storefrontTex(name: string, color: string, wall: string, seed: number) {
  const r = rng(seed);
  return canvas(1024, 384, (g) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, 1024, 384);
    noise(g, 1024, 384, 6000, 0.06, r);
    // letreiro
    g.fillStyle = '#1b1e26';
    g.fillRect(120, 24, 784, 70);
    g.fillStyle = color;
    g.font = '700 50px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 512, 61);
    // toldo listrado
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#fff6e6' : color;
      g.beginPath();
      g.moveTo(80 + i * 54, 104);
      g.lineTo(80 + (i + 1) * 54, 104);
      g.lineTo(80 + (i + 1) * 54 - 4, 150);
      g.lineTo(80 + i * 54 - 4, 150);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(80, 150, 864, 10);
    // vitrine
    const gr = g.createLinearGradient(0, 160, 0, 384);
    gr.addColorStop(0, '#6f8798');
    gr.addColorStop(1, '#2b3540');
    g.fillStyle = gr;
    g.fillRect(100, 160, 824, 224);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ['#ffd23f', '#ff8a3d', '#4da3ff', '#3ddc97', '#ff6b9a', '#fff6e6'][Math.floor(r() * 6)];
      const w = 20 + r() * 40;
      const h = 20 + r() * 50;
      g.fillRect(130 + r() * 760, 380 - h - (r() < 0.5 ? 0 : 90), w, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.moveTo(200, 160);
    g.lineTo(320, 160);
    g.lineTo(180, 384);
    g.lineTo(100, 384);
    g.fill();
    g.fillStyle = '#20242c';
    for (const x of [100, 372, 650, 920]) g.fillRect(x - 3, 160, 8, 224);
  });
}

/** Céu de fundo (proporção certa, sem prédios pintados): degradê com nuvens macias. */
export const streetSkyTex = () =>
  canvas(1024, 512, (g) => {
    const r = rng(61);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#5aa8ec');
    gr.addColorStop(0.55, '#a6d6fb');
    gr.addColorStop(1, '#f4e3c8');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 18; i++) {
      const cx = r() * 1024;
      const cy = 60 + r() * 250;
      const sc = 0.6 + r() * 0.9;
      for (let k = 0; k < 9; k++) {
        const x = cx + (r() - 0.5) * 160 * sc;
        const y = cy + (r() - 0.5) * 30 * sc;
        const rad = (24 + r() * 34) * sc;
        const c = g.createRadialGradient(x, y, 0, x, y, rad);
        c.addColorStop(0, 'rgba(255,255,255,0.75)');
        c.addColorStop(0.6, 'rgba(255,255,255,0.35)');
        c.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = c;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  });

/** Lona listrada do toldo da lojinha. */
export const awningTex = (a: string, b: string) =>
  canvas(512, 128, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 64, 0, 64, 128);
    }
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 128);
  });

/** Letras douradas sobre fundo transparente (logo da recepção). */
export function goldTextTex(text: string, sub: string | null, w = 1024, h = 256, font = '"Darumadrop One", Fredoka, sans-serif') {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = Math.floor(h * (sub ? 0.5 : 0.7));
    g.font = `400 ${size}px ${font}`;
    const gr = g.createLinearGradient(0, h * 0.1, 0, h * 0.7);
    gr.addColorStop(0, '#fff1c2');
    gr.addColorStop(0.45, '#e2b45a');
    gr.addColorStop(1, '#9c6b22');
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 10;
    g.shadowOffsetY = 4;
    g.fillStyle = gr;
    g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
    if (sub) {
      g.shadowBlur = 4;
      g.shadowOffsetY = 2;
      g.font = `600 ${Math.floor(h * 0.15)}px Fredoka, sans-serif`;
      (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px';
      g.fillStyle = '#e8d3a2';
      g.fillText(sub, w / 2, h * 0.82);
    }
  });
}

/** Quadro dos andares (diretório do prédio). */
export function directoryTex(rows: [string, string][]) {
  return canvas(640, 900, (g) => {
    g.fillStyle = '#1c2029';
    g.fillRect(0, 0, 640, 900);
    g.fillStyle = '#c9a55a';
    g.fillRect(0, 0, 640, 110);
    g.fillStyle = '#1c2029';
    g.font = '700 46px Fredoka, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px';
    g.fillText('DIRETÓRIO', 320, 58);
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    const top = 150;
    const step = (880 - top) / rows.length;
    rows.forEach(([n, who], i) => {
      const y = top + i * step;
      if (i % 2) {
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fillRect(20, y - step / 2 + 4, 600, step - 8);
      }
      const mine = who.startsWith('BOSS KEY');
      g.textAlign = 'left';
      g.fillStyle = mine ? '#ffd23f' : '#c9a55a';
      g.font = '700 34px "JetBrains Mono", monospace';
      g.fillText(n, 40, y);
      g.fillStyle = mine ? '#ffffff' : '#d9dce6';
      g.font = `${mine ? 700 : 500} 28px Fredoka, sans-serif`;
      g.fillText(who, 150, y);
    });
  });
}

/** Medalhão do piso (embutido de pedra com a chave da empresa). */
export const medallionTex = () =>
  canvas(1024, 1024, (g) => {
    const c = 512;
    g.clearRect(0, 0, 1024, 1024);
    const ring = (r0: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(c, c, r0, 0, Math.PI * 2);
      g.fill();
    };
    ring(510, '#2c2f37');
    ring(470, '#c9a55a');
    ring(455, '#efe8dc');
    ring(330, '#7a2234');
    ring(318, '#efe8dc');
    // rosa dos ventos
    g.save();
    g.translate(c, c);
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.fillStyle = i % 2 ? '#c9a55a' : '#2c2f37';
      g.beginPath();
      g.moveTo(0, -440);
      g.lineTo(40, -330);
      g.lineTo(0, -320);
      g.lineTo(-40, -330);
      g.closePath();
      g.fill();
    }
    g.restore();
    // chave
    g.save();
    g.translate(c, c);
    g.rotate(-Math.PI / 4);
    g.fillStyle = '#2c2f37';
    g.beginPath();
    g.arc(-130, 0, 90, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efe8dc';
    g.beginPath();
    g.arc(-130, 0, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2c2f37';
    g.fillRect(-50, -24, 260, 48);
    g.fillRect(140, 24, 30, 50);
    g.fillRect(90, 24, 30, 36);
    g.restore();
    g.fillStyle = '#7a2234';
    g.font = '400 64px "Darumadrop One", Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BOSS KEY', c, c + 240);
  });

/** Mostrador de andar fixo dos elevadores de enfeite. */
export function floorIndicatorTex(text: string) {
  return canvas(256, 96, (g) => {
    g.fillStyle = '#120d08';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ff9a3c';
    g.font = '700 60px "JetBrains Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 52);
  });
}
