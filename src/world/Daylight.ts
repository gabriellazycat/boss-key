import * as THREE from 'three';
import { W } from './Office';

export type Weather = 'sol' | 'nublado' | 'chuva' | 'dourado';
/** Ordem fixa: o índice viaja na rede (snapshot). */
export const WEATHERS: readonly Weather[] = ['sol', 'nublado', 'chuva', 'dourado'];

/** Como o dia está iluminado agora (tudo já com o clima aplicado). */
export interface DayLook {
  sunColor: THREE.Color;
  sunI: number;
  sunPos: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  skyTint: THREE.Color;
  shaftColor: THREE.Color;
  shaftK: number;
  /** 0..1: luminárias/varal acendendo no fim da tarde. */
  lampK: number;
  /** 0..1: janelas dos prédios acendendo. */
  cityK: number;
  lift: THREE.Vector3;
  gain: THREE.Vector3;
}

interface Key {
  t: number;
  sun: string;
  sunI: number;
  pos: [number, number, number];
  sky: string;
  hemiI: number;
  tint: [number, number, number];
  lift: [number, number, number];
  gain: [number, number, number];
}

/** 9h fria · 12h branca · 15h quente · 17h dourada · 18h roxa (t = 0..1 do expediente). */
const KEYS: Key[] = [
  { t: 0, sun: '#ffe8cc', sunI: 4.6, pos: [24, 26, 11], sky: '#e9f1ff', hemiI: 0.72, tint: [0.95, 1.0, 1.06], lift: [0.012, 0.024, 0.05], gain: [1.0, 1.0, 1.0] },
  { t: 0.333, sun: '#fff4e2', sunI: 6.0, pos: [12, 34, 24], sky: '#fff0dc', hemiI: 0.8, tint: [1, 1, 1], lift: [0.012, 0.022, 0.04], gain: [1.03, 1.0, 0.95] },
  { t: 0.667, sun: '#ffd49a', sunI: 5.8, pos: [-6, 32, 16], sky: '#fff0dc', hemiI: 0.78, tint: [1.0, 0.96, 0.9], lift: [0.014, 0.02, 0.035], gain: [1.05, 1.0, 0.92] },
  { t: 0.889, sun: '#ffae5e', sunI: 4.6, pos: [-12, 22, 9], sky: '#ffdcb6', hemiI: 0.7, tint: [1.0, 0.8, 0.62], lift: [0.03, 0.016, 0.03], gain: [1.08, 0.97, 0.88] },
  { t: 1, sun: '#ff7f5f', sunI: 2.4, pos: [-15, 15, 5], sky: '#cdb0ff', hemiI: 0.58, tint: [0.62, 0.48, 0.74], lift: [0.04, 0.02, 0.06], gain: [1.04, 0.94, 0.96] },
];

const out: DayLook = {
  sunColor: new THREE.Color(),
  sunI: 0,
  sunPos: new THREE.Vector3(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color('#4f7f88'),
  hemiI: 0,
  skyTint: new THREE.Color(),
  shaftColor: new THREE.Color(),
  shaftK: 1,
  lampK: 0,
  cityK: 0,
  lift: new THREE.Vector3(),
  gain: new THREE.Vector3(),
};
const ca = new THREE.Color();
const cb = new THREE.Color();
const grey = new THREE.Color('#c9cfd8');

/** Interpola os keyframes do dia e aplica o clima. Reaproveita o mesmo objeto (sem alocar por quadro). */
export function dayLook(t01: number, weather: Weather): DayLook {
  const t = THREE.MathUtils.clamp(t01, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const L = THREE.MathUtils.lerp;
  out.sunColor.copy(ca.set(a.sun)).lerp(cb.set(b.sun), k);
  out.sunI = L(a.sunI, b.sunI, k);
  out.sunPos.copy(W(L(a.pos[0], b.pos[0], k), L(a.pos[2], b.pos[2], k), L(a.pos[1], b.pos[1], k)));
  out.hemiSky.copy(ca.set(a.sky)).lerp(cb.set(b.sky), k);
  out.hemiI = L(a.hemiI, b.hemiI, k);
  out.skyTint.setRGB(L(a.tint[0], b.tint[0], k), L(a.tint[1], b.tint[1], k), L(a.tint[2], b.tint[2], k));
  out.lift.set(L(a.lift[0], b.lift[0], k), L(a.lift[1], b.lift[1], k), L(a.lift[2], b.lift[2], k));
  out.gain.set(L(a.gain[0], b.gain[0], k), L(a.gain[1], b.gain[1], k), L(a.gain[2], b.gain[2], k));
  out.shaftColor.copy(out.sunColor);
  out.shaftK = 1 - THREE.MathUtils.smoothstep(t, 0.85, 1) * 0.6;
  out.lampK = THREE.MathUtils.smoothstep(t, 0.72, 0.95);
  out.cityK = THREE.MathUtils.smoothstep(t, 0.78, 1);
  // clima
  if (weather === 'nublado') {
    out.sunI *= 0.42;
    out.sunColor.lerp(grey, 0.6);
    out.hemiSky.lerp(grey, 0.5);
    out.skyTint.multiplyScalar(0.82).lerp(grey, 0.3);
    out.shaftK *= 0.25;
    out.lampK = Math.max(out.lampK, 0.35);
    out.gain.set(1.0, 1.0, 1.0);
  } else if (weather === 'chuva') {
    out.sunI *= 0.22;
    out.sunColor.set('#9fb3cc');
    out.hemiSky.set('#aeb9c9');
    out.hemiI *= 0.82;
    out.skyTint.setRGB(0.24, 0.27, 0.35);
    out.shaftK = 0;
    out.lampK = Math.max(out.lampK, 0.7);
    out.cityK = Math.max(out.cityK, 0.55);
    out.lift.set(0.01, 0.025, 0.06);
    out.gain.set(0.97, 1.0, 1.04);
  } else if (weather === 'dourado') {
    out.sunI *= 1.08;
    out.sunColor.lerp(ca.set('#ffc777'), 0.35);
    out.skyTint.multiply(cb.setRGB(1.04, 0.95, 0.85));
    out.gain.x += 0.03;
    out.gain.z -= 0.03;
  }
  return out;
}
