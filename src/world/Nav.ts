import * as THREE from 'three';
import { MAP, type AABB } from './Office';

/** A* em grade de 0,5 m sobre o escritório, com suavização por linha reta. */
export class Nav {
  private readonly cell = 0.5;
  private readonly w: number;
  private readonly h: number;
  private readonly ox = -MAP.ox;
  private readonly oz = -MAP.oz;
  private blocked: Uint8Array;

  constructor(colliders: AABB[], inflate = 0.4) {
    this.w = Math.round(MAP.w / this.cell);
    this.h = Math.round(MAP.d / this.cell);
    this.blocked = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) {
        const x = this.ox + (i + 0.5) * this.cell;
        const z = this.oz + (j + 0.5) * this.cell;
        for (const b of colliders) {
          if (x > b.minX - inflate && x < b.maxX + inflate && z > b.minZ - inflate && z < b.maxZ + inflate) {
            this.blocked[j * this.w + i] = 1;
            break;
          }
        }
      }
  }

  private idx(p: THREE.Vector3) {
    const i = THREE.MathUtils.clamp(Math.floor((p.x - this.ox) / this.cell), 0, this.w - 1);
    const j = THREE.MathUtils.clamp(Math.floor((p.z - this.oz) / this.cell), 0, this.h - 1);
    return [i, j] as const;
  }

  private free(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i];
  }

  private nearestFree(i: number, j: number): [number, number] {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 8; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) if (this.free(i + di, j + dj)) return [i + di, j + dj];
    return [i, j];
  }

  private center(i: number, j: number) {
    return new THREE.Vector3(this.ox + (i + 0.5) * this.cell, 0, this.oz + (j + 0.5) * this.cell);
  }

  private clearLine(a: THREE.Vector3, b: THREE.Vector3) {
    const d = a.distanceTo(b);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const [i, j] = this.idx(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t));
      if (!this.free(i, j)) return false;
    }
    return true;
  }

  find(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const [si, sj] = this.nearestFree(...this.idx(from));
    const [ti, tj] = this.nearestFree(...this.idx(to));
    const N = this.w * this.h;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const s = sj * this.w + si;
    const t = tj * this.w + ti;
    g[s] = 0;
    f[s] = Math.hypot(ti - si, tj - sj);
    open.push(s);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === t) {
        found = true;
        break;
      }
      closed[cur] = 1;
      const ci = cur % this.w;
      const cj = (cur - ci) / this.w;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
        const n = nj * this.w + ni;
        if (closed[n]) continue;
        const ng = g[cur] + cost;
        if (ng < g[n]) {
          if (g[n] === Infinity) open.push(n);
          g[n] = ng;
          f[n] = ng + Math.hypot(ti - ni, tj - nj);
          came[n] = cur;
        }
      }
    }
    if (!found) return [to.clone()];
    const cells: THREE.Vector3[] = [];
    for (let c = t; c !== -1; c = came[c]) cells.push(this.center(c % this.w, Math.floor(c / this.w)));
    cells.reverse();
    cells[0] = from.clone().setY(0);
    cells.push(to.clone().setY(0));
    // suavização: pula pontos com linha livre
    const out: THREE.Vector3[] = [cells[0]];
    let k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--)
        if (this.clearLine(cells[k], cells[m])) {
          far = m;
          break;
        }
      out.push(cells[far]);
      k = far;
    }
    out.shift();
    return out;
  }

  length(path: THREE.Vector3[], from: THREE.Vector3) {
    let d = 0;
    let p = from;
    for (const q of path) {
      d += Math.hypot(q.x - p.x, q.z - p.z);
      p = q;
    }
    return d;
  }
}
