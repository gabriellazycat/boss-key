import * as THREE from 'three';

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

/** Ruído suave em manchas (aspecto "pintado à mão"). */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, light = true) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 6 + Math.random() * 28;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const v = light ? (Math.random() < 0.5 ? 255 : 0) : 0;
    gr.addColorStop(0, `rgba(${v},${v},${v},${alpha * Math.random()})`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** Textura neutra (quase branca) para multiplicar cores planas — tira o "plástico" do CG. */
export const paintTex = () =>
  canvas(256, 256, (g) => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 120, 0.06);
    speckle(g, 256, 256, 1500, 0.04);
  }, [1, 1]);

export const carpetTex = () =>
  canvas(512, 512, (g) => {
    g.fillStyle = '#2f8f8a';
    g.fillRect(0, 0, 512, 512);
    // placas 50×50 com fibras alternadas
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const alt = (x + y) % 2;
        g.fillStyle = alt ? 'rgba(255,255,255,0.045)' : 'rgba(0,30,40,0.05)';
        g.fillRect(x * 128, y * 128, 128, 128);
        g.strokeStyle = 'rgba(10,50,60,0.35)';
        g.lineWidth = 2;
        g.strokeRect(x * 128 + 1, y * 128 + 1, 126, 126);
        g.strokeStyle = alt ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        g.lineWidth = 1;
        for (let k = 6; k < 128; k += 6) {
          g.beginPath();
          if (alt) {
            g.moveTo(x * 128 + k, y * 128);
            g.lineTo(x * 128 + k, y * 128 + 128);
          } else {
            g.moveTo(x * 128, y * 128 + k);
            g.lineTo(x * 128 + 128, y * 128 + k);
          }
          g.stroke();
        }
      }
    blotches(g, 512, 512, 140, 0.07);
    speckle(g, 512, 512, 9000, 0.12);
  }, [7.5, 4]);

export const loungeFloorTex = () =>
  canvas(512, 512, (g) => {
    // tacos de madeira mel em espinha de peixe simplificada
    g.fillStyle = '#d9a066';
    g.fillRect(0, 0, 512, 512);
    const cols = ['#d39a5f', '#e0ab72', '#cf9257', '#dba46b'];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 4; x++) {
        g.fillStyle = cols[(x * 3 + y * 7) % 4];
        const off = (y % 2) * 64;
        g.fillRect(x * 128 + off - 64, y * 32, 127, 31);
        g.fillRect(x * 128 + off + 64, y * 32, 127, 31);
      }
    g.strokeStyle = 'rgba(90,50,20,0.35)';
    for (let y = 0; y <= 16; y++) {
      g.beginPath();
      g.moveTo(0, y * 32);
      g.lineTo(512, y * 32);
      g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(110,60,20,${Math.random() * 0.12})`;
      g.beginPath();
      const y = Math.random() * 512;
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 3, 340, y - 3, 512, y);
      g.stroke();
    }
    blotches(g, 512, 512, 80, 0.06);
  }, [4, 2]);

export const woodTex = (base = '#c98f55', rep: [number, number] = [2, 1]) =>
  canvas(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(80,40,10,${Math.random() * 0.14})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * 256;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + 5, 170, y - 5, 256, y + 2);
      g.stroke();
    }
    blotches(g, 256, 256, 40, 0.06);
  }, rep);

export const tileTex = (a: string, b: string, n = 8, rep: [number, number] = [4, 4]) =>
  canvas(256, 256, (g) => {
    const s = 256 / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect(x * s, y * s, s, s);
      }
    g.strokeStyle = 'rgba(0,0,0,0.1)';
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, 256);
      g.moveTo(0, i * s);
      g.lineTo(256, i * s);
      g.stroke();
    }
    blotches(g, 256, 256, 30, 0.05);
  }, rep);

export const ceilingTex = () =>
  canvas(128, 128, (g) => {
    g.fillStyle = '#f6efe2';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ddd2bf';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
    speckle(g, 128, 128, 700, 0.06);
  }, [15, 13.5]);

/** Parede creme com degradê (mais escura embaixo) e faixa turquesa. */
export const wallTex = () =>
  canvas(64, 256, (g) => {
    const gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, '#e9d6b8');
    gr.addColorStop(0.35, '#f4e7d0');
    gr.addColorStop(1, '#fbf3e4');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 256);
    // faixa de destaque
    g.fillStyle = '#3aa6a0';
    g.fillRect(0, 256 - 256 * 0.36, 64, 9);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 256 - 256 * 0.36, 64, 2);
    blotches(g, 64, 256, 30, 0.04);
  }, [6, 1]);

export function posterTex(title: string, sub: string, bg: string, draw: (g: CanvasRenderingContext2D) => void) {
  return canvas(256, 340, (g) => {
    g.fillStyle = '#1d2233';
    g.fillRect(0, 0, 256, 340);
    g.fillStyle = bg;
    g.fillRect(14, 14, 228, 220);
    g.save();
    g.translate(14, 14);
    draw(g);
    g.restore();
    g.fillStyle = '#fff6e6';
    g.font = '400 30px "Darumadrop One", Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText(title, 128, 278);
    g.font = '500 14px Fredoka, sans-serif';
    g.fillStyle = '#c9cbd8';
    g.fillText(sub, 128, 306);
  });
}

export function ballDoodle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#20263a';
  g.beginPath();
  g.roundRect(x - r * 0.8, y - r * 0.32, r * 1.6, r * 0.55, r * 0.27);
  g.fill();
  g.fillStyle = '#f4f4f0';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + s * r * 0.33, y - r * 0.05, r * 0.2, r * 0.23, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#111';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(x + s * r * 0.33 + r * 0.05, y - r * 0.05, r * 0.1, 0, Math.PI * 2);
    g.fill();
  }
}

export function signTex(text: string, bg: string, fg: string, w = 256, h = 64, font = 'Fredoka') {
  return canvas(w, h, (g) => {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, 10);
    g.fill();
    g.fillStyle = fg;
    g.font = `700 ${Math.floor(h * 0.5)}px ${font}, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Letreiro neon (fundo transparente, brilho). */
export function neonTex(text: string, color: string, w = 512, h = 128) {
  return canvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.font = `400 ${Math.floor(h * 0.62)}px "Darumadrop One", Fredoka, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function puddleTex() {
  return canvas(128, 128, (g) => {
    g.fillStyle = 'rgba(80,42,16,0.9)';
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 40 + Math.sin(a * 3) * 10 + Math.random() * 10;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(52, 50, 14, 6, -0.5, 0, Math.PI * 2);
    g.fill();
  });
}

/** Céu + skyline pintados para ver pelas janelas. */
export function skylineTex() {
  return canvas(2048, 512, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#5fb4f0');
    sky.addColorStop(0.55, '#a9dcff');
    sky.addColorStop(0.8, '#ffe2b8');
    sky.addColorStop(1, '#ffd29a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 2048, 512);
    // nuvens fofas
    for (let i = 0; i < 14; i++) {
      const cx = Math.random() * 2048;
      const cy = 40 + Math.random() * 170;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.ellipse(cx + k * 22 - 60, cy + Math.sin(k * 1.7) * 8, 34 + Math.random() * 20, 20 + Math.random() * 10, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(200,220,245,0.6)';
      g.fillRect(cx - 80, cy + 10, 170, 8);
    }
    // prédios distantes (azulados) e próximos (quentes)
    const layer = (base: number, hMin: number, hMax: number, cols: string[], win: string) => {
      let x = 0;
      while (x < 2048) {
        const w = 50 + Math.random() * 110;
        const h = hMin + Math.random() * (hMax - hMin);
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x, base - h, w - 6, h);
        g.fillStyle = win;
        for (let wy = base - h + 12; wy < base - 10; wy += 18)
          for (let wx = x + 8; wx < x + w - 16; wx += 16) if (Math.random() < 0.7) g.fillRect(wx, wy, 8, 10);
        x += w;
      }
    };
    layer(470, 120, 260, ['#8fb6d8', '#9fc3e0', '#86abcf'], 'rgba(255,255,255,0.35)');
    layer(512, 60, 170, ['#f0b880', '#e89f72', '#f5c99a', '#d98c66'], 'rgba(255,240,200,0.55)');
    // copas de árvores
    for (let x = 0; x < 2048; x += 40 + Math.random() * 30) {
      g.fillStyle = Math.random() < 0.5 ? '#5bb36a' : '#4aa05c';
      g.beginPath();
      g.arc(x, 505, 26 + Math.random() * 18, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Degradê radial para feixes de luz / poeira. */
export function glowTex() {
  return canvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }, undefined, false);
}

export function rugTex(c1: string, c2: string, c3: string) {
  return canvas(256, 256, (g) => {
    g.fillStyle = c1;
    g.beginPath();
    g.arc(128, 128, 127, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = c2;
    g.lineWidth = 14;
    for (const r of [100, 64, 30]) {
      g.beginPath();
      g.arc(128, 128, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = c3;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 82, 0, Math.PI * 2);
    g.stroke();
    blotches(g, 256, 256, 30, 0.06);
  });
}
