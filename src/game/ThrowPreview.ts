import * as THREE from 'three';
import { MAP, type Office } from '../world/Office';

const MAX_DOTS = 40;
const DOT_GAP = 0.3;
const SKIP_NEAR = 0.5;

export interface ThrowSim {
  /** Pontos do arco já espaçados por comprimento (sem os primeiros ~0,5 m). */
  count: number;
  end: THREE.Vector3;
  normal: THREE.Vector3;
  /** Terminou dentro de uma cesta (plano do aro). */
  bin: boolean;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(32, 32, 29, 0, Math.PI * 2);
  g.fillStyle = 'rgba(20,24,40,0.95)';
  g.fill();
  g.beginPath();
  g.arc(32, 32, 19, 0, Math.PI * 2);
  g.fillStyle = '#fff3c4';
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Mira do arremesso: simula a mesma física da bolinha (gravidade, paredes, chão, teto e aro)
 * e desenha pontos de tamanho constante na tela + um anel onde ela vai bater.
 */
export class ThrowPreview {
  private readonly pos = new Float32Array(MAX_DOTS * 3);
  private readonly geo = new THREE.BufferGeometry();
  private readonly front: THREE.Points;
  private readonly behind: THREE.Points;
  private readonly ring: THREE.Mesh;
  private readonly sim: ThrowSim = { count: 0, end: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), bin: false };
  private t = 0;

  constructor(scene: THREE.Scene, private office: Office) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const map = dotTexture();
    const mk = (opacity: number, depthTest: boolean) => {
      const m = new THREE.PointsMaterial({ map, size: 12 * Math.min(2, window.devicePixelRatio || 1), sizeAttenuation: false, transparent: true, opacity, depthWrite: false, depthTest, toneMapped: false });
      const p = new THREE.Points(this.geo, m);
      p.frustumCulled = false;
      p.visible = false;
      p.userData.noAO = true;
      p.renderOrder = depthTest ? 20 : 21;
      scene.add(p);
      return p;
    };
    this.front = mk(1, true);
    this.behind = mk(0.3, false);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.22, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.45), toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.renderOrder = 22;
    this.ring.visible = false;
    this.ring.userData.noAO = true;
    scene.add(this.ring);
  }

  /** Simula o voo (mesmas regras de Player.updatePapers) e guarda os pontos espaçados. */
  simulate(start: THREE.Vector3, vel: THREE.Vector3): ThrowSim {
    const s = this.sim;
    const p = start.clone();
    const v = vel.clone();
    const prev = new THREE.Vector3();
    const dt = 1 / 90;
    let travelled = 0;
    let nextDot = SKIP_NEAR;
    s.count = 0;
    s.bin = false;
    s.normal.set(0, 1, 0);
    for (let i = 0; i < 90 * 3; i++) {
      prev.copy(p);
      v.y -= 9.8 * dt;
      p.addScaledVector(v, dt);
      if (p.y > MAP.wallH - 0.1) {
        p.y = MAP.wallH - 0.1;
        v.y = -Math.abs(v.y) * 0.3;
      }
      // aro de uma lixeira: cruzou o plano descendo, perto do centro
      if (v.y < 0) {
        let hitBin = false;
        for (const b of this.office.bins) {
          if (!(prev.y >= b.rim.y && p.y <= b.rim.y)) continue;
          if (Math.hypot(p.x - b.rim.x, p.z - b.rim.z) < b.r + 0.1) {
            const k = (prev.y - b.rim.y) / Math.max(1e-6, prev.y - p.y);
            s.end.lerpVectors(prev, p, k);
            s.bin = true;
            hitBin = true;
            break;
          }
        }
        if (hitBin) break;
      }
      const before = p.clone();
      this.office.collideBall(p, 0.07);
      const push = p.clone().sub(before).setY(0);
      if (push.lengthSq() > 1e-8) {
        s.end.copy(p);
        s.normal.copy(push.normalize());
        break;
      }
      if (p.y <= 0.06) {
        s.end.copy(p).setY(0.012);
        break;
      }
      travelled += p.distanceTo(prev);
      while (travelled >= nextDot && s.count < MAX_DOTS) {
        // posição exata no comprimento de arco desejado
        const over = travelled - nextDot;
        const seg = p.distanceTo(prev);
        const k = seg > 1e-6 ? 1 - over / seg : 1;
        const q = prev.clone().lerp(p, k);
        this.pos.set([q.x, q.y, q.z], s.count * 3);
        s.count++;
        nextDot += DOT_GAP;
      }
      s.end.copy(p);
    }
    return s;
  }

  show(start: THREE.Vector3, vel: THREE.Vector3, dt: number) {
    const s = this.simulate(start, vel);
    this.t += dt;
    const attr = this.geo.attributes.position as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.geo.setDrawRange(0, s.count);
    this.front.visible = this.behind.visible = true;
    const r = this.ring;
    r.visible = true;
    r.position.copy(s.end).addScaledVector(s.normal, 0.012);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.normal);
    r.scale.setScalar(1 + Math.sin(this.t * 9) * 0.12);
    return s;
  }

  hide() {
    this.front.visible = this.behind.visible = this.ring.visible = false;
  }
}
