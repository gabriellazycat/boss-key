import * as THREE from 'three';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

export const carpetTex = () =>
  canvas(256, 256, (g) => {
    g.fillStyle = '#3F6C9A';
    g.fillRect(0, 0, 256, 256);
    // placas de carpete 50x50 com leve variação
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const v = (x + y) % 2 ? 6 : -6;
        g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},0.035)`;
        g.fillRect(x * 128, y * 128, 128, 128);
        g.strokeStyle = 'rgba(20,40,70,0.25)';
        g.strokeRect(x * 128 + 0.5, y * 128 + 0.5, 127, 127);
      }
    speckle(g, 256, 256, 5000, 0.12);
  }, [15, 10]);

export const woodTex = (base = '#a8784a') =>
  canvas(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`;
      g.fillRect(0, i * 32, 256, 31);
      g.fillStyle = 'rgba(40,20,0,0.35)';
      g.fillRect(0, i * 32 + 31, 256, 1);
      const off = Math.random() * 256;
      g.fillRect(off, i * 32, 1, 32);
    }
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(60,30,0,${Math.random() * 0.12})`;
      g.beginPath();
      const y = Math.random() * 256;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + 4, 160, y - 4, 256, y);
      g.stroke();
    }
  }, [4, 3]);

export const tileTex = (a: string, b: string, n = 8, rep: [number, number] = [4, 4]) =>
  canvas(256, 256, (g) => {
    const s = 256 / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect(x * s, y * s, s, s);
      }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, 256);
      g.moveTo(0, i * s);
      g.lineTo(256, i * s);
      g.stroke();
    }
    speckle(g, 256, 256, 800, 0.05);
  }, rep);

export const ceilingTex = () =>
  canvas(128, 128, (g) => {
    g.fillStyle = '#f2efe8';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#d8d3c8';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
    speckle(g, 128, 128, 900, 0.08);
  }, [15, 10]);

export const wallTex = () =>
  canvas(128, 128, (g) => {
    g.fillStyle = '#EDE8DC';
    g.fillRect(0, 0, 128, 128);
    speckle(g, 128, 128, 1500, 0.04);
  }, [8, 1]);

/** Pôsteres motivacionais paródicos. */
export function posterTex(title: string, sub: string, bg: string, draw: (g: CanvasRenderingContext2D) => void) {
  return canvas(256, 340, (g) => {
    g.fillStyle = '#111';
    g.fillRect(0, 0, 256, 340);
    g.fillStyle = bg;
    g.fillRect(14, 14, 228, 220);
    g.save();
    g.translate(14, 14);
    draw(g);
    g.restore();
    g.fillStyle = '#f4f1e8';
    g.font = '700 30px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText(title, 128, 276);
    g.font = '400 14px Fredoka, sans-serif';
    g.fillStyle = '#bbb';
    g.fillText(sub, 128, 304);
  });
}

export function ballDoodle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0b0b0e';
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

export function signTex(text: string, bg: string, fg: string, w = 256, h = 64) {
  return canvas(w, h, (g) => {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, 10);
    g.fill();
    g.fillStyle = fg;
    g.font = `700 ${Math.floor(h * 0.5)}px Fredoka, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function puddleTex() {
  return canvas(128, 128, (g) => {
    g.fillStyle = 'rgba(70,38,16,0.85)';
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
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.ellipse(52, 50, 14, 6, -0.5, 0, Math.PI * 2);
    g.fill();
  });
}
