import * as THREE from 'three';
import { W } from './Office';
import type { Weather } from './Daylight';

/** Nuvem fofa desenhada num canvas (billboard). */
function cloudTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const x = 50 + Math.random() * 156;
    const y = 60 + Math.random() * 30;
    const r = 26 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Pigeon {
  g: THREE.Group;
  head: THREE.Object3D;
  home: THREE.Vector3;
  /** 0 = pousado; >0 = voando (segundos de voo); <0 = longe (volta quando chegar a 0). */
  fly: number;
  dir: THREE.Vector3;
  peckT: number;
  hopT: number;
}

/**
 * O lado de fora: nuvens passando, um avião de vez em quando, chuva com raios (quinta) e pombos
 * no parapeito das janelas do sul (voam quando alguém chega perto ou bate no vidro).
 */
export class Outside {
  readonly root = new THREE.Group();
  private clouds: { m: THREE.Mesh; speed: number }[] = [];
  private cloudMat: THREE.MeshBasicMaterial;
  private plane: THREE.Group;
  private planeT = 30;
  private rain: THREE.LineSegments;
  private rainU = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  readonly pigeons: Pigeon[] = [];
  private cooT = 6;
  weather: Weather = 'sol';
  /** Flash do raio (0..1), lido pelo Office para clarear céu e sol. */
  flash = 0;
  private flashT = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    // nuvens: na frente dos painéis do horizonte (sul, oeste e leste)
    this.cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, fog: false, toneMapped: false });
    // atrás dos prédios mais altos, na frente do céu (bem acima dos telhados)
    const spots: [number, number, number, number][] = [
      [-10, 66, 30, 0], [20, 67, 36, 0], [40, 66, 27, 0],
      [-46, 4, 31, Math.PI / 2], [-46, 26, 37, Math.PI / 2],
      [66, 6, 34, -Math.PI / 2], [66, 24, 29, -Math.PI / 2],
    ];
    for (const [x, z, y, rot] of spots) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(22 + Math.random() * 10, 10 + Math.random() * 3), this.cloudMat);
      m.position.copy(W(x, z, y));
      m.rotation.y = rot === 0 ? Math.PI : rot;
      m.userData.noAO = true;
      this.root.add(m);
      this.clouds.push({ m, speed: 0.3 + Math.random() * 0.4 });
    }
    // aviãozinho
    this.plane = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: '#f4f6fa', fog: false });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.2, 4, 8), white);
    body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 2.6), white);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: '#e5484d', fog: false }));
    tail.position.set(-1.2, 0.3, 0);
    this.plane.add(body, wing, tail);
    this.plane.visible = false;
    this.root.add(this.plane);
    // chuva: riscos curtos caindo só do lado de fora (faixas sul, oeste e leste)
    const N = 1800;
    const pos = new Float32Array(N * 6);
    const tail2 = new Float32Array(N * 2);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const band = i % 3;
      const x = band === 0 ? -6 + Math.random() * 32 : band === 1 ? -7 + Math.random() * 6.4 : 20.6 + Math.random() * 6.4;
      const z = band === 0 ? 24.4 + Math.random() * 9 : -3 + Math.random() * 30;
      const p = W(x, z, Math.random() * 9);
      pos.set([p.x, p.y, p.z, p.x, p.y, p.z], i * 6);
      tail2.set([0, 1], i * 2);
      const s = Math.random();
      seed.set([s, s], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aTail', new THREE.BufferAttribute(tail2, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainU,
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float aTail; attribute float aSeed; uniform float uTime;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * (8.0 + aSeed * 3.0) + aSeed * 37.0, 9.5) - 0.6 + aTail * 0.32;
          p.x += aTail * 0.04;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uOpacity; void main() { gl_FragColor = vec4(0.78, 0.84, 0.95, uOpacity); }`,
    });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.userData.noAO = true;
    this.root.add(this.rain);
    // pombos no parapeito de fora das janelas do sul (só nos vãos 9–13 e 15–18: o vão 2–7 fica atrás do balcão da copa)
    for (const x of [9.8, 11.2, 12.6, 17.3]) this.pigeons.push(this.makePigeon(W(x, 24.13, 0.735)));
  }

  private makePigeon(at: THREE.Vector3): Pigeon {
    const g = new THREE.Group();
    const grey = new THREE.MeshStandardMaterial({ color: '#8e96a6', roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#5d6474', roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), grey);
    body.scale.set(1, 0.85, 1.35);
    body.position.y = 0.075;
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark);
    wing.scale.set(1.25, 0.6, 1.3);
    wing.position.set(0, 0.09, -0.02);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.08), dark);
    tail.position.set(0, 0.07, -0.12);
    tail.rotation.x = -0.4;
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), dark);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.012, 6, 14), new THREE.MeshStandardMaterial({ color: '#4fae8a', roughness: 0.4, metalness: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.03;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 8), new THREE.MeshStandardMaterial({ color: '#f2b45a' }));
    beak.rotation.x = Math.PI / 2;
    beak.position.z = 0.045;
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: '#111' }));
      eye.position.set(s * 0.03, 0.01, 0.025);
      head.add(eye);
    }
    head.add(skull, ring, beak);
    head.position.set(0, 0.16, 0.08);
    g.add(body, wing, tail, head);
    g.position.copy(at);
    g.rotation.y = Math.PI + (Math.random() - 0.5) * 1.2;
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.root.add(g);
    return { g, head, home: at.clone(), fly: 0, dir: new THREE.Vector3(), peckT: Math.random() * 3, hopT: 2 + Math.random() * 4 };
  }

  setWeather(w: Weather) {
    this.weather = w;
    this.rain.visible = w === 'chuva';
    this.cloudMat.color.set(w === 'chuva' ? '#7d8796' : w === 'nublado' ? '#cfd5de' : '#ffffff');
    for (const p of this.pigeons) {
      p.fly = w === 'chuva' ? -999 : 0;
      p.g.visible = w !== 'chuva';
      p.g.position.copy(p.home);
    }
  }

  /** Pombos fogem (alguém perto do vidro ou bateu nele). Retorna quantos voaram. */
  scare(near: THREE.Vector3, r: number) {
    let n = 0;
    for (const p of this.pigeons) {
      if (p.fly !== 0 || !p.g.visible) continue;
      if (p.g.position.distanceTo(near) > r) continue;
      p.fly = 2.2;
      p.dir.set((Math.random() - 0.5) * 2, 1.4, 1.5 + Math.random()).normalize();
      n++;
    }
    return n;
  }

  /** Pombo mais perto (para o "bater no vidro"). */
  nearestPigeon(p: THREE.Vector3) {
    let best: Pigeon | null = null;
    let d = Infinity;
    for (const pg of this.pigeons) {
      if (pg.fly !== 0 || !pg.g.visible) continue;
      const dd = pg.g.position.distanceTo(p);
      if (dd < d) {
        d = dd;
        best = pg;
      }
    }
    return best ? { pos: best.g.position, dist: d } : null;
  }

  /** Raio: dois flashes rápidos. */
  lightning() {
    this.flashT = 0.35;
  }

  /** Atualiza tudo; devolve true quando um pombo arrulha (para o som 3D). */
  update(dt: number, time: number, sky: THREE.Color): THREE.Vector3 | null {
    for (const c of this.clouds) {
      // deriva lateral, dando a volta no horizonte
      const m = c.m;
      const side = Math.abs(m.rotation.y - Math.PI) < 0.1 ? 'x' : 'z';
      if (side === 'x') {
        m.position.x += c.speed * dt;
        if (m.position.x > 60) m.position.x = -60;
      } else {
        m.position.z += c.speed * dt * 0.8;
        if (m.position.z > 50) m.position.z = -50;
      }
    }
    this.cloudMat.opacity = 0.9;
    this.cloudMat.color.lerp(sky, 0.02);
    // avião a cada ~90 s
    this.planeT -= dt;
    if (this.planeT <= 0 && !this.plane.visible && this.weather !== 'chuva') {
      this.plane.visible = true;
      this.plane.position.copy(W(-60, 64, 44));
      this.plane.scale.setScalar(2.5);
    }
    if (this.plane.visible) {
      this.plane.position.x += dt * 7;
      this.plane.position.y += Math.sin(time) * 0.002;
      if (this.plane.position.x > 70) {
        this.plane.visible = false;
        this.planeT = 70 + Math.random() * 40;
      }
    }
    // chuva e raios
    this.rainU.uTime.value = time;
    this.rainU.uOpacity.value = this.weather === 'chuva' ? 0.55 : 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash = this.flashT > 0.22 || (this.flashT > 0.05 && this.flashT < 0.14) ? 1 : 0;
    } else this.flash = 0;
    // pombos
    let coo: THREE.Vector3 | null = null;
    for (const p of this.pigeons) {
      if (p.fly > 0) {
        p.fly -= dt;
        p.g.position.addScaledVector(p.dir, dt * 4.5);
        p.g.rotation.z = Math.sin(time * 40) * 0.3;
        if (p.fly <= 0) {
          p.fly = -(18 + Math.random() * 15);
          p.g.visible = false;
        }
      } else if (p.fly < 0) {
        if (this.weather === 'chuva') continue;
        p.fly += dt;
        if (p.fly >= 0) {
          p.fly = 0;
          p.g.visible = true;
          p.g.position.copy(p.home);
          p.g.rotation.z = 0;
        }
      } else {
        // bica o parapeito e dá pulinhos
        p.peckT -= dt;
        const peck = p.peckT < 0.25 && p.peckT > 0 ? Math.sin((p.peckT / 0.25) * Math.PI) : 0;
        p.head.position.set(0, 0.16 - peck * 0.06, 0.08 + peck * 0.04);
        if (p.peckT <= 0) p.peckT = 1.5 + Math.random() * 3;
        p.hopT -= dt;
        if (p.hopT <= 0) {
          p.hopT = 3 + Math.random() * 5;
          p.g.rotation.y = Math.PI + (Math.random() - 0.5) * 1.6;
          p.g.position.x = THREE.MathUtils.clamp(p.g.position.x + (Math.random() - 0.5) * 0.3, p.home.x - 0.5, p.home.x + 0.5);
        }
      }
    }
    this.cooT -= dt;
    if (this.cooT <= 0) {
      this.cooT = 7 + Math.random() * 9;
      const vis = this.pigeons.filter((p) => p.fly === 0 && p.g.visible);
      if (vis.length) coo = vis[Math.floor(Math.random() * vis.length)].g.position;
    }
    return coo;
  }
}
