import * as THREE from 'three';
import { solid } from '../characters/rig';
import { pawColors, type Look } from '../characters/designs';

/** O que as patinhas estão fazendo (cada pose tem um alvo para cada mão). */
export type PawPose = 'none' | 'paper' | 'charge' | 'crumple' | 'coffee' | 'two' | 'heavy' | 'phone' | 'press';

interface Target {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}

const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Target => ({ pos: new THREE.Vector3(x, y, z), rot: new THREE.Euler(rx, ry, rz) });
/** Fora da tela (mão abaixada). */
const DOWN_R = T(0.34, -0.78, -0.42, 0.6, 0, -0.3);
const DOWN_L = T(-0.34, -0.78, -0.42, 0.6, 0, 0.3);

/** Alvos [direita, esquerda] por pose, no espaço da câmera. */
const POSES: Record<PawPose, [Target, Target]> = {
  none: [DOWN_R, DOWN_L],
  paper: [T(0.25, -0.27, -0.5, 0.3, 0, -0.2), DOWN_L],
  charge: [T(0.31, -0.17, -0.36, -0.5, 0.2, -0.4), T(-0.22, -0.34, -0.5, 0.4, 0, 0.5)],
  crumple: [T(0.07, -0.29, -0.45, 0.2, 0, -1.2), T(-0.07, -0.29, -0.45, 0.2, 0, 1.2)],
  coffee: [T(0.27, -0.3, -0.5, 0.15, 0, -0.1), DOWN_L],
  two: [T(0.17, -0.31, -0.48, 0.4, 0, -0.5), T(-0.17, -0.31, -0.48, 0.4, 0, 0.5)],
  heavy: [T(0.21, -0.4, -0.46, 0.2, 0, -0.9), T(-0.21, -0.4, -0.46, 0.2, 0, 0.9)],
  phone: [T(0.3, -0.08, -0.22, 0.2, -0.9, -0.5), DOWN_L],
  press: [T(0.12, -0.18, -0.55, -0.6, 0, -0.2), DOWN_L],
};

class Paw {
  readonly g = new THREE.Group();
  /** Onde o item segurado fica preso (palma da mão). */
  readonly socket = new THREE.Group();
  readonly vel = new THREE.Vector3();

  constructor(side: number, sleeve: string, hand: string) {
    const arm = solid(new THREE.CapsuleGeometry(0.045, 0.32, 6, 14), sleeve, 0.006);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.position.set(side * 0.03, -0.08, 0.17);
    const cuff = solid(new THREE.SphereGeometry(0.058, 16, 12), sleeve, 0.006);
    cuff.scale.set(1, 1, 0.8);
    cuff.position.set(side * 0.005, -0.012, 0.045);
    const palm = solid(new THREE.SphereGeometry(0.055, 18, 14), hand, 0.006);
    palm.scale.set(1.05, 0.95, 0.9);
    // dedinho/polegar: só um gomo, para ler como "mãozinha" de bicho
    const thumb = solid(new THREE.SphereGeometry(0.022, 12, 10), hand, 0.004);
    thumb.position.set(-side * 0.048, 0.016, -0.012);
    this.socket.position.set(0, 0.02, -0.055);
    this.g.add(arm, cuff, palm, thumb, this.socket);
    this.g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.frustumCulled = false;
      // mesma correção de tom dos personagens (a luz do escritório estoura o toon)
      if (!o.userData.outline && m.material instanceof THREE.MeshToonMaterial) m.material.color.multiplyScalar(0.55);
    });
  }
}

/**
 * Patinhas em primeira pessoa (presas à câmera): aparecem quando você segura ou faz algo,
 * com poses procedurais por mola e balanço ao andar.
 */
export class Paws {
  readonly root = new THREE.Group();
  readonly r: Paw;
  readonly l: Paw;
  /** Meio das duas mãos (itens de duas mãos: relatório, documento, galão). */
  readonly both = new THREE.Group();
  pose: PawPose = 'none';
  private swing = 0;
  private squeeze = 0;
  /** Identifica a aparência usada (para refazer se o jogador trocar de bicho). */
  readonly key: string;

  constructor(look: Look) {
    this.key = `${look.species}|${look.color}`;
    const c = pawColors(look);
    this.r = new Paw(1, c.sleeve, c.hand);
    this.l = new Paw(-1, c.sleeve, c.hand);
    this.root.add(this.r.g, this.l.g, this.both);
    for (const p of [this.r, this.l]) p.g.position.copy(POSES.none[p === this.r ? 0 : 1].pos);
  }

  /** Arremesso: dá um tapa para frente. */
  throwSwing() {
    this.swing = 1;
  }

  /** Amassar/pegar: as mãos apertam. */
  crumple() {
    this.squeeze = 1;
  }

  update(dt: number, bob: number, bobT: number) {
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.squeeze = Math.max(0, this.squeeze - dt * 2.6);
    const pose: PawPose = this.squeeze > 0.05 ? 'crumple' : this.pose;
    const [tr, tl] = POSES[pose];
    const k = Math.min(1, dt * 14);
    [this.r, this.l].forEach((p, i) => {
      const t = i === 0 ? tr : tl;
      const target = t.pos.clone();
      // balanço ao andar (mãos em contrafase) e respiração parada
      target.x += Math.sin(bobT + i * Math.PI) * 0.012 * bob;
      target.y += -Math.abs(Math.cos(bobT + i * Math.PI)) * 0.016 * bob + Math.sin(performance.now() / 700) * 0.003;
      if (i === 0 && this.swing > 0) target.add(new THREE.Vector3(-0.12, 0.06, -0.22).multiplyScalar(Math.sin(this.swing * Math.PI)));
      if (pose === 'crumple') target.x *= 1 - Math.sin(this.squeeze * Math.PI * 3) * 0.25;
      // mola simples: aproxima com um pouco de passagem
      const to = target.sub(p.g.position);
      p.vel.addScaledVector(to, dt * 180).multiplyScalar(Math.exp(-dt * 16));
      p.g.position.addScaledVector(p.vel, dt);
      p.g.rotation.x += (t.rot.x - p.g.rotation.x) * k;
      p.g.rotation.y += (t.rot.y - p.g.rotation.y) * k;
      p.g.rotation.z += (t.rot.z - p.g.rotation.z) * k;
    });
    this.both.position.lerpVectors(this.r.g.position, this.l.g.position, 0.5).add(new THREE.Vector3(0, 0.03, -0.05));
    this.both.rotation.set(0.35, 0, 0);
    const shown = pose !== 'none' || this.r.g.position.y > -0.7;
    this.root.visible = shown;
  }
}
