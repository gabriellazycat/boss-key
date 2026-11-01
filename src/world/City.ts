import * as THREE from 'three';
import { facadeSet } from './lobbyTextures';
import type { DayLook } from './Daylight';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Caixa com UV em metros/8×12 nas laterais (a fachada repete sem esticar) e o teto liso. */
function buildingGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // faces do BoxGeometry: +x, −x, +y, −y, +z, −z (4 vértices cada)
  const span = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = span[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (!su) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, uv.getX(i) * (su / 8), uv.getY(i) * (sv / 12));
    }
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * A vizinhança vista das janelas: prédios de verdade (caixas com fachada, iluminadas pelo sol e com janelas que
 * acendem no fim da tarde) entre o escritório e o céu. Substitui o horizonte pintado num plano.
 */
export class City {
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(add: (o: THREE.Object3D, x: number, y: number, z: number) => void) {
    this.mats = facadeSet().map((t) => new THREE.MeshStandardMaterial({ map: t.day, emissiveMap: t.lights, emissive: '#ffd9a0', emissiveIntensity: 0, roughness: 0.85 }));
    const roof = new THREE.MeshStandardMaterial({ color: '#7d828c', roughness: 0.9 });
    const r = rng(9);
    // a rua fica 12 andares abaixo do escritório: da janela se vê o topo dos vizinhos e muito céu
    const y0 = -40;
    const place = (x: number, z: number, w: number, d: number, h: number) => {
      const m = new THREE.Mesh(buildingGeo(w, h, d), this.mats[Math.floor(r() * this.mats.length)]);
      m.castShadow = false;
      m.receiveShadow = false;
      add(m, x, y0 + h / 2, z);
      // cornija e casa de máquinas no topo
      add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roof), x, y0 + h + 0.25, z);
      if (r() < 0.5) add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 2, d * 0.3), roof), x + (r() - 0.5) * w * 0.4, y0 + h + 1.5, z + (r() - 0.5) * d * 0.4);
    };
    // uma fileira próxima (mais baixa) e uma distante (mais alta) em cada lado com janela: sul, oeste e leste
    const row = (a: number, b: number, at: (c: number, w: number) => void) => {
      for (let c = a; ; ) {
        const w = 7 + r() * 7;
        if (c + w > b) break;
        at(c + w / 2, w);
        c += w;
      }
    };
    const h = (lo: number, hi: number) => lo + r() * (hi - lo);
    // alturas a partir da rua: a fileira perto termina logo abaixo da janela, a de trás passa do teto
    row(-14, 34, (x, w) => place(x, 44 + r() * 2, w - 1.2, 7 + r() * 2, h(28, 40)));
    row(-30, 50, (x, w) => place(x, 58 + r() * 2, w - 1.2, 9, h(36, 66)));
    row(0, 36, (z, w) => place(-20 - r() * 2, z, 7 + r() * 2, w - 1.2, h(28, 40)));
    row(0, 48, (z, w) => place(-34, z, 9, w - 1.2, h(36, 66)));
    row(0, 36, (z, w) => place(40 + r() * 2, z, 7 + r() * 2, w - 1.2, h(28, 40)));
    row(0, 48, (z, w) => place(54, z, 9, w - 1.2, h(36, 66)));
  }

  update(look: DayLook) {
    for (const m of this.mats) m.emissiveIntensity = 1.3 * look.cityK;
  }
}
