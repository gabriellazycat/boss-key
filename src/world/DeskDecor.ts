import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, mat, type Desk } from './Office';

/** Junta as malhas estáticas de um grupo por material (poucos draw calls por mesa). */
export function mergeGroup(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mtl = m.material as THREE.Material;
    if (Array.isArray(m.material) || (mtl as THREE.Material & { transparent: boolean }).transparent) {
      keep.push(m);
      return;
    }
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    let list = buckets.get(mtl);
    if (!list) buckets.set(mtl, (list = []));
    list.push(geo);
  });
  const out = new THREE.Group();
  out.position.copy(g.position);
  out.rotation.copy(g.rotation);
  for (const [mtl, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mtl);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const k of keep) {
    const c = k.clone();
    new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  }
  return out;
}

const put = (g: THREE.Group, o: THREE.Object3D, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  g.add(o);
  return o;
};

/**
 * Mesa com a cara do dono. Coordenadas locais: x = distância da parede (para dentro do salão),
 * z = ao longo da mesa (0 = centro), y = altura.
 */
export function deskTheme(variant: string, color: string): THREE.Group {
  const g = new THREE.Group();
  switch (variant) {
    case 'bia': {
      // laço: novelo na mesa e um banquinho fofo ao lado
      const yarn = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), mat('#ff7eb6', 0.9));
      put(g, yarn, 0.84, 0.855, -0.78);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 18), mat('#e0569a', 0.9));
        ring.rotation.set(i * 1.1, i * 0.7, 0);
        put(g, ring, 0.84, 0.855, -0.78);
      }
      put(g, box(0.5, 0.05, 0.5, mat('#c9a27a', 0.9), 0.02), 0.45, 0.025, 1.45);
      put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 12), mat('#d8b98a', 1)), 0.45, 0.47, 1.45);
      put(g, box(0.42, 0.06, 0.42, mat('#ff9fc8', 0.9), 0.03), 0.45, 0.94, 1.45);
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#ffd23f', 0.6)), 0.6, 0.75, 1.3);
      break;
    }
    case 'caio': {
      // antena: segundo monitor CRT, cabos e fita de LED embaixo do tampo
      put(g, box(0.3, 0.26, 0.3, mat('#d9dde6', 0.5), 0.04), 0.3, 0.92, -0.8);
      const scr = box(0.02, 0.18, 0.22, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), toneMapped: false }), 0);
      put(g, scr, 0.46, 0.93, -0.8);
      const led = box(0.02, 0.015, 1.8, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }), 0);
      put(g, led, 0.96, 0.7, 0);
      for (let i = 0; i < 3; i++) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 0.78, -0.5 + i * 0.2), new THREE.Vector3(0.25, 0.4, -0.4 + i * 0.25), new THREE.Vector3(0.4, 0.02, 0.2 + i * 0.3), new THREE.Vector3(0.9, 0.02, 0.4 + i * 0.25)]);
        put(g, new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 5), mat(['#2a3042', '#e5484d', '#4da3ff'][i], 0.5)), 0, 0, 0);
      }
      put(g, box(0.4, 0.5, 0.35, mat('#2a3042', 0.4), 0.03), 0.4, 0.25, 1.45);
      put(g, box(0.02, 0.06, 0.06, new THREE.MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }), 0), 0.61, 0.4, 1.4);
      break;
    }
    default: {
      // post-it: tigela de tangerinas e uma boia de pato no chão
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#e8ecf1', 0.4));
      bowl.rotation.x = Math.PI;
      put(g, bowl, 0.84, 0.88, -0.8);
      for (let i = 0; i < 4; i++) put(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#ff9a2e', 0.6)), 0.84 + Math.cos(i * 1.6) * 0.04, 0.85 + (i === 3 ? 0.04 : 0), -0.8 + Math.sin(i * 1.6) * 0.04);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 10, 20), mat('#ffd23f', 0.5));
      ring.rotation.x = -Math.PI / 2;
      put(g, ring, 0.45, 0.08, 1.45);
      put(g, new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat('#ffd23f', 0.5)), 0.45, 0.2, 1.62);
      break;
    }
  }
  return g;
}

/** A decoração é montada no referencial da mesa (`Desk.frame`): fica na origem dele. */
export function placeOnDesk(g: THREE.Group, d: Desk) {
  void d;
  g.position.set(0, 0, 0);
  return g;
}
