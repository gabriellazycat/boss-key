import * as THREE from 'three';

type Pos = { x: number; y: number; z: number };
type Synth = (a: AudioEngine, out: AudioNode, t: number, p: number) => void;

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Motor de áudio 100% sintetizado (Web Audio). Mixer: master → sfx / music / ui.
 * Sons 3D usam PannerNode HRTF com o listener preso à câmera.
 */
export class AudioEngine {
  ctx!: AudioContext;
  master!: GainNode;
  sfx!: GainNode;
  ui!: GainNode;
  music!: GainNode;
  private musicDuck!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  ready = false;
  /** Multiplicadores de percepção (fones, pescaria). */
  stepMul = 1;
  doorMul = 1;
  vol = { master: 0.8, sfx: 0.9, music: 0.45 };
  private musicOn = false;
  private musicNext = 0;
  private musicStep = 0;
  private musicMode: 'menu' | 'day' = 'menu';
  tension = 0;

  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.gain(this.master);
    this.ui = this.gain(this.master);
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 9000;
    this.musicDuck = this.gain(this.master);
    this.music = this.ctx.createGain();
    this.music.connect(this.musicFilter).connect(this.musicDuck);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ready = true;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.ui.gain.value = this.vol.sfx * 0.8;
    this.music.gain.value = this.vol.music * 0.5;
  }

  get now() {
    return this.ready ? this.ctx.currentTime : 0;
  }

  gain(to: AudioNode, v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(to);
    return g;
  }

  osc(type: OscillatorType, f: number, t: number, dur: number, to: AudioNode) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noise(t: number, dur: number, to: AudioNode) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.connect(to);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    return s;
  }

  env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  filter(type: BiquadFilterType, f: number, q: number, to: AudioNode) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(to);
    return b;
  }

  updateListener(cam: THREE.Camera) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3();
    const f = new THREE.Vector3();
    const up = new THREE.Vector3();
    cam.getWorldPosition(p);
    cam.getWorldDirection(f);
    up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, up.x, up.y, up.z);
    }
  }

  panner(pos: Pos, maxDist = 25, to: AudioNode = this.sfx) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.maxDistance = maxDist;
    p.rolloffFactor = 1.1;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(to);
    return p;
  }

  /** Toca um som global (UI ou aviso). */
  play(name: keyof typeof SYNTHS, vol = 1, param = 0) {
    if (!this.ready) return;
    const g = this.gain(name in UI_SET ? this.ui : this.sfx, vol);
    SYNTHS[name](this, g, this.ctx.currentTime + 0.005, param);
  }

  /** Toca um som 3D posicional. */
  play3D(name: keyof typeof SYNTHS, pos: Pos, vol = 1, param = 0, maxDist = 25) {
    if (!this.ready) return;
    const g = this.gain(this.panner(pos, maxDist), vol);
    SYNTHS[name](this, g, this.ctx.currentTime + 0.005, param);
  }

  /** Loop contínuo controlável (cooler, vídeo, alarme). */
  loop(kind: 'cooler' | 'video' | 'alarm' | 'typing' | 'hum', pos: Pos | null) {
    if (!this.ready) return null;
    return new LoopSound(this, kind, pos);
  }

  duck(amount: number, dur: number) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.musicDuck.gain.cancelScheduledValues(t);
    this.musicDuck.gain.setTargetAtTime(amount, t, 0.05);
    this.musicDuck.gain.setTargetAtTime(1, t + dur, 0.6);
  }

  // ---------- Música lounge procedural ----------
  startMusic(mode: 'menu' | 'day') {
    if (!this.ready) return;
    this.musicMode = mode;
    if (!this.musicOn) {
      this.musicOn = true;
      this.musicNext = this.ctx.currentTime + 0.1;
      this.musicStep = 0;
    }
  }
  stopMusic() {
    this.musicOn = false;
  }

  update() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(9000 - this.tension * 7800, t, 0.3);
    if (!this.musicOn) return;
    const bpm = this.musicMode === 'menu' ? 96 : 88;
    const sixteenth = 60 / bpm / 4;
    while (this.musicNext < t + 0.25) {
      this.scheduleMusicStep(this.musicStep, this.musicNext, sixteenth);
      this.musicNext += sixteenth * (this.musicStep % 2 === 0 ? 1.12 : 0.88); // swing
      this.musicStep++;
    }
  }

  private scheduleMusicStep(step: number, t: number, s16: number) {
    // Fmaj7 – Em7 – Dm7 – G7(13), 1 compasso cada
    const prog = [
      [53, 57, 60, 64, 41],
      [52, 55, 59, 62, 40],
      [50, 53, 57, 60, 38],
      [55, 59, 62, 64, 43],
    ];
    const bar = Math.floor(step / 16) % 4;
    const st = step % 16;
    const ch = prog[bar];
    const out = this.music;
    // Rhodes: acordes em síncope
    if (st === 0 || st === 6 || st === 10) {
      for (let i = 0; i < 4; i++) this.ep(NOTE(ch[i]), t, st === 0 ? 1.4 : 0.6, st === 0 ? 0.05 : 0.035, out);
    }
    // baixo walking
    const bassPat = [0, 7, 12, 10];
    if (st % 4 === 0) {
      const n = ch[4] + bassPat[st / 4];
      const g = this.gain(out, 0);
      const o = this.osc('triangle', NOTE(n), t, 0.4, g);
      o.detune.value = -4;
      this.env(g, t, 0.01, 0.16, 0.35);
    }
    // vassourinha
    if (st % 2 === 0) {
      const g = this.gain(out, 0);
      const f = this.filter('highpass', 7000, 0.7, g);
      this.noise(t, 0.08, f);
      this.env(g, t, 0.005, st % 4 === 2 ? 0.05 : 0.022, 0.07);
    }
    // melodia (só no menu, vibraphone)
    if (this.musicMode === 'menu' && (st === 3 || st === 8 || st === 13) && Math.random() < 0.7) {
      const scale = [0, 2, 4, 7, 9, 12];
      const n = ch[3] + 12 + scale[Math.floor(Math.random() * scale.length)] - 5;
      this.vib(NOTE(n), t, out);
    }
  }

  private ep(f: number, t: number, dur: number, v: number, out: AudioNode) {
    const g = this.gain(out, 0);
    const o = this.osc('sine', f, t, dur, g);
    const mod = this.ctx.createOscillator();
    const mg = this.ctx.createGain();
    mod.frequency.value = f * 2;
    mg.gain.setValueAtTime(f * 0.6, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.3);
    mod.connect(mg).connect(o.frequency);
    mod.start(t);
    mod.stop(t + dur + 0.05);
    this.env(g, t, 0.01, v, dur);
  }

  private vib(f: number, t: number, out: AudioNode) {
    const g = this.gain(out, 0);
    this.osc('sine', f, t, 1.2, g);
    this.osc('sine', f * 4, t, 0.3, this.gain(g, 0.15));
    this.env(g, t, 0.005, 0.06, 1.1);
  }
}

export class LoopSound {
  private nodes: AudioScheduledSourceNode[] = [];
  readonly out: GainNode;
  private panner: PannerNode | null = null;
  private timer = 0;
  private alive = true;

  constructor(private a: AudioEngine, private kind: string, pos: Pos | null) {
    const ctx = a.ctx;
    const dest = pos ? (this.panner = a.panner(pos, 30)) : a.sfx;
    this.out = a.gain(dest, 0);
    const t = ctx.currentTime;
    if (kind === 'cooler' || kind === 'hum') {
      const f = a.filter('bandpass', kind === 'hum' ? 120 : 900, kind === 'hum' ? 1.5 : 0.8, this.out);
      this.nodes.push(a.noise(t, 9999, f));
      if (kind === 'hum') this.nodes.push(a.osc('sine', 60, t, 9999, a.gain(this.out, 0.3)));
      else this.nodes.push(a.osc('sawtooth', 180, t, 9999, a.gain(a.filter('lowpass', 400, 1, this.out), 0.15)));
    } else {
      this.tick();
    }
  }

  setPos(p: Pos) {
    if (!this.panner) return;
    const t = this.a.ctx.currentTime;
    this.panner.positionX.setTargetAtTime(p.x, t, 0.05);
    this.panner.positionY.setTargetAtTime(p.y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
  }

  setVol(v: number) {
    this.out.gain.setTargetAtTime(v, this.a.ctx.currentTime, 0.08);
  }

  private tick = () => {
    if (!this.alive) return;
    const a = this.a;
    const t = a.ctx.currentTime + 0.02;
    if (this.kind === 'video') {
      const arp = [72, 76, 79, 84, 79, 76, 74, 77];
      for (let i = 0; i < 8; i++) {
        const g = a.gain(this.out, 0);
        a.osc('square', NOTE(arp[(i + this.timer * 8) % 8] - (this.timer % 2) * 5), t + i * 0.12, 0.1, a.filter('lowpass', 2500, 1, g));
        a.env(g, t + i * 0.12, 0.005, 0.18, 0.1);
      }
      const k = a.gain(this.out, 0);
      for (let i = 0; i < 4; i++) {
        const kg = a.gain(this.out, 0);
        const o = a.osc('sine', 120, t + i * 0.24, 0.12, kg);
        o.frequency.exponentialRampToValueAtTime(45, t + i * 0.24 + 0.1);
        a.env(kg, t + i * 0.24, 0.002, 0.5, 0.12);
      }
      k.disconnect();
      this.timer++;
      setTimeout(this.tick, 940);
    } else if (this.kind === 'alarm') {
      for (let i = 0; i < 3; i++) {
        const g = a.gain(this.out, 0);
        a.osc('square', 1180, t + i * 0.18, 0.1, a.filter('lowpass', 3000, 1, g));
        a.env(g, t + i * 0.18, 0.005, 0.25, 0.09);
      }
      setTimeout(this.tick, 700);
    } else if (this.kind === 'typing') {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const g = a.gain(this.out, 0);
        const tt = t + i * (0.06 + Math.random() * 0.07);
        a.noise(tt, 0.03, a.filter('bandpass', 2500 + Math.random() * 2000, 2, g));
        a.env(g, tt, 0.001, 0.3, 0.03);
      }
      setTimeout(this.tick, 250 + Math.random() * 300);
    }
  };

  stop() {
    this.alive = false;
    const t = this.a.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const n of this.nodes) n.stop(t + 0.3);
    setTimeout(() => this.out.disconnect(), 500);
  }
}

const UI_SET = { click: 1, hover: 1, confirm: 1, back: 1, fun: 1, clutch: 1, caught: 1, stamp: 1, fanfare: 1, sad: 1, tick: 1, miss: 1, bell: 1, warn: 1 } as const;

const SYNTHS = {
  click: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('triangle', 1200, t, 0.05, g).frequency.exponentialRampToValueAtTime(600, t + 0.04);
    a.env(g, t, 0.002, 0.25, 0.05);
  },
  hover: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('sine', 1800, t, 0.03, g);
    a.env(g, t, 0.002, 0.06, 0.03);
  },
  confirm: (a, o, t) => {
    [72, 79, 84].forEach((n, i) => {
      const g = a.gain(o, 0);
      a.osc('triangle', NOTE(n), t + i * 0.06, 0.25, g);
      a.env(g, t + i * 0.06, 0.004, 0.2, 0.22);
    });
  },
  back: (a, o, t) => {
    [76, 69].forEach((n, i) => {
      const g = a.gain(o, 0);
      a.osc('triangle', NOTE(n), t + i * 0.07, 0.2, g);
      a.env(g, t + i * 0.07, 0.004, 0.18, 0.15);
    });
  },
  /** p = combo (sobe o tom). */
  fun: (a, o, t, p) => {
    const base = 76 + Math.min(p, 12);
    [base, base + 7].forEach((n, i) => {
      const g = a.gain(o, 0);
      a.osc('sine', NOTE(n), t + i * 0.05, 0.25, g);
      a.osc('sine', NOTE(n) * 3, t + i * 0.05, 0.1, a.gain(g, 0.2));
      a.env(g, t + i * 0.05, 0.003, 0.22, 0.25);
    });
  },
  tick: (a, o, t, p) => {
    const g = a.gain(o, 0);
    a.osc('sine', p > 0 ? 1320 : 990, t, 0.08, g);
    a.env(g, t, 0.002, 0.25, 0.08);
  },
  miss: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('square', 180, t, 0.18, a.filter('lowpass', 900, 1, g)).frequency.exponentialRampToValueAtTime(90, t + 0.16);
    a.env(g, t, 0.002, 0.25, 0.18);
  },
  warn: (a, o, t) => {
    [0, 0.16].forEach((d) => {
      const g = a.gain(o, 0);
      a.osc('square', 880, t + d, 0.1, a.filter('lowpass', 2400, 1, g));
      a.env(g, t + d, 0.003, 0.14, 0.1);
    });
  },
  door: (a, o, t) => {
    // rangido + trinco + baque
    const g = a.gain(o, 0);
    const bp = a.filter('bandpass', 1100, 9, g);
    const s = a.osc('sawtooth', 95, t, 1.1, bp);
    s.frequency.setValueAtTime(95, t);
    s.frequency.linearRampToValueAtTime(140, t + 0.35);
    s.frequency.linearRampToValueAtTime(82, t + 0.7);
    s.frequency.linearRampToValueAtTime(120, t + 1.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.6 * a.doorMul, t + 0.1);
    g.gain.setValueAtTime(1.6 * a.doorMul, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    const c = a.gain(o, 0);
    a.noise(t, 0.04, a.filter('bandpass', 3200, 3, c));
    a.env(c, t, 0.001, 0.9 * a.doorMul, 0.04);
    const th = a.gain(o, 0);
    a.osc('sine', 85, t + 1.15, 0.3, th).frequency.exponentialRampToValueAtTime(40, t + 1.4);
    a.env(th, t + 1.15, 0.003, 1.2 * a.doorMul, 0.3);
  },
  /** p: 0 = chefe pesado, 1 = X9 leve. */
  step: (a, o, t, p) => {
    const g = a.gain(o, 0);
    const f = p ? 140 : 75;
    a.osc('sine', f, t, 0.16, g).frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.12);
    a.env(g, t, 0.003, (p ? 0.7 : 1.4) * a.stepMul, p ? 0.08 : 0.16);
    const n = a.gain(o, 0);
    a.noise(t, 0.05, a.filter('lowpass', p ? 2200 : 900, 1, n));
    a.env(n, t, 0.002, (p ? 0.35 : 0.5) * a.stepMul, 0.05);
  },
  keys: (a, o, t) => {
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.045 + Math.random() * 0.03;
      const f = 3200 + Math.random() * 3000;
      const g = a.gain(o, 0);
      a.osc('sine', f, tt, 0.12, g);
      a.osc('sine', f * 1.51, tt, 0.08, a.gain(g, 0.5));
      a.env(g, tt, 0.001, 0.2, 0.1 + Math.random() * 0.08);
    }
  },
  yell: (a, o, t) => {
    const g = a.gain(o, 0);
    const s = a.osc('square', 700, t, 0.45, a.filter('lowpass', 2600, 2, g));
    s.frequency.linearRampToValueAtTime(1250, t + 0.12);
    s.frequency.linearRampToValueAtTime(980, t + 0.42);
    a.env(g, t, 0.01, 0.7, 0.42);
  },
  suspicious: (a, o, t) => {
    [0, 0.14].forEach((d, i) => {
      const g = a.gain(o, 0);
      a.osc('triangle', i ? 520 : 390, t + d, 0.2, g);
      a.env(g, t + d, 0.01, 0.5, 0.18);
    });
  },
  heartbeat: (a, o, t, p) => {
    [0, 0.16].forEach((d, i) => {
      const g = a.gain(o, 0);
      a.osc('sine', i ? 48 : 55, t + d, 0.2, g).frequency.exponentialRampToValueAtTime(32, t + d + 0.15);
      a.env(g, t + d, 0.004, (i ? 0.6 : 0.9) * (0.4 + p), 0.17);
    });
  },
  clutch: (a, o, t) => {
    const w = a.gain(o, 0);
    const bp = a.filter('bandpass', 400, 2, w);
    bp.frequency.exponentialRampToValueAtTime(5000, t + 0.25);
    a.noise(t, 0.3, bp);
    a.env(w, t, 0.05, 0.8, 0.25);
    [60, 64, 67, 72, 76].forEach((n, i) => {
      const g = a.gain(o, 0);
      const lp = a.filter('lowpass', 1800, 2, g);
      lp.frequency.exponentialRampToValueAtTime(5000, t + 0.4);
      const os = a.osc('sawtooth', NOTE(n + 7), t + 0.22, 0.9, lp);
      os.detune.value = (i - 2) * 6;
      a.env(g, t + 0.22, 0.01, 0.13, 0.9);
    });
    const b = a.gain(o, 0);
    a.osc('sine', NOTE(96), t + 0.22, 1.2, b);
    a.env(b, t + 0.22, 0.002, 0.25, 1.1);
  },
  caught: (a, o, t) => {
    [55, 54, 53, 52].forEach((n, i) => {
      const g = a.gain(o, 0);
      const lp = a.filter('lowpass', 1200, 3, g);
      const s = a.osc('sawtooth', NOTE(n), t + i * 0.35, i === 3 ? 1.2 : 0.32, lp);
      if (i === 3) {
        const lfo = a.ctx.createOscillator();
        const lg = a.ctx.createGain();
        lfo.frequency.value = 6;
        lg.gain.value = 9;
        lfo.connect(lg).connect(s.frequency);
        lfo.start(t + i * 0.35);
        lfo.stop(t + i * 0.35 + 1.25);
      }
      a.env(g, t + i * 0.35, 0.02, 0.4, i === 3 ? 1.1 : 0.3);
    });
  },
  stamp: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('sine', 110, t, 0.25, g).frequency.exponentialRampToValueAtTime(40, t + 0.2);
    a.env(g, t, 0.002, 1.4, 0.25);
    const n = a.gain(o, 0);
    a.noise(t, 0.08, a.filter('lowpass', 1500, 1, n));
    a.env(n, t, 0.001, 0.9, 0.08);
  },
  pew: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('square', 1400, t, 0.1, a.filter('lowpass', 3000, 1, g)).frequency.exponentialRampToValueAtTime(180, t + 0.09);
    a.env(g, t, 0.001, 0.22, 0.09);
  },
  boom: (a, o, t, p) => {
    const g = a.gain(o, 0);
    const lp = a.filter('lowpass', 1600, 1, g);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    a.noise(t, 0.5, lp);
    a.env(g, t, 0.002, 0.7 + p, 0.45);
    const s = a.gain(o, 0);
    a.osc('sine', 90, t, 0.3, s).frequency.exponentialRampToValueAtTime(30, t + 0.3);
    a.env(s, t, 0.002, 0.8, 0.3);
  },
  splash: (a, o, t) => {
    const g = a.gain(o, 0);
    const bp = a.filter('bandpass', 1400, 1.2, g);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    a.noise(t, 0.35, bp);
    a.env(g, t, 0.01, 0.35, 0.3);
  },
  plop: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('sine', 300, t, 0.1, g).frequency.exponentialRampToValueAtTime(900, t + 0.06);
    a.env(g, t, 0.002, 0.3, 0.08);
  },
  crunch: (a, o, t) => {
    for (let i = 0; i < 5; i++) {
      const g = a.gain(o, 0);
      const tt = t + i * 0.09 + Math.random() * 0.03;
      a.noise(tt, 0.05, a.filter('bandpass', 1800 + Math.random() * 1500, 1.5, g));
      a.env(g, tt, 0.002, 0.5, 0.05);
    }
  },
  throw: (a, o, t) => {
    const g = a.gain(o, 0);
    const bp = a.filter('bandpass', 800, 1, g);
    bp.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
    a.noise(t, 0.18, bp);
    a.env(g, t, 0.02, 0.3, 0.15);
  },
  swish: (a, o, t) => {
    const g = a.gain(o, 0);
    a.noise(t, 0.2, a.filter('highpass', 3000, 0.7, g));
    a.env(g, t, 0.01, 0.4, 0.2);
    [84, 88, 91, 96].forEach((n, i) => {
      const b = a.gain(o, 0);
      a.osc('sine', NOTE(n), t + 0.05 + i * 0.05, 0.3, b);
      a.env(b, t + 0.05 + i * 0.05, 0.002, 0.18, 0.3);
    });
  },
  thud: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('sine', 180, t, 0.1, g).frequency.exponentialRampToValueAtTime(70, t + 0.08);
    a.env(g, t, 0.002, 0.5, 0.09);
  },
  pour: (a, o, t) => {
    const g = a.gain(o, 0);
    const bp = a.filter('bandpass', 600, 3, g);
    const lfo = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    lfo.frequency.value = 14;
    lg.gain.value = 300;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start(t);
    lfo.stop(t + 1.3);
    a.noise(t, 1.3, bp);
    a.env(g, t, 0.1, 0.5, 1.2);
  },
  printer: (a, o, t) => {
    for (let i = 0; i < 6; i++) {
      const g = a.gain(o, 0);
      a.noise(t + i * 0.22, 0.15, a.filter('bandpass', 700, 2, g));
      a.env(g, t + i * 0.22, 0.02, 0.4, 0.13);
    }
  },
  blackout: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('sawtooth', 120, t, 1.5, a.filter('lowpass', 800, 1, g)).frequency.exponentialRampToValueAtTime(30, t + 1.4);
    a.env(g, t, 0.005, 0.6, 1.4);
    const n = a.gain(o, 0);
    a.noise(t, 0.12, a.filter('lowpass', 2500, 1, n));
    a.env(n, t, 0.001, 1.2, 0.12);
  },
  lightson: (a, o, t) => {
    for (let i = 0; i < 3; i++) {
      const g = a.gain(o, 0);
      a.osc('sawtooth', 100, t + i * 0.12, 0.08, a.filter('bandpass', 800, 2, g));
      a.env(g, t + i * 0.12, 0.002, 0.4, 0.06);
    }
  },
  gong: (a, o, t) => {
    [1, 2.4, 3.9, 5.4].forEach((m, i) => {
      const g = a.gain(o, 0);
      a.osc('sine', 110 * m, t, 2.5, g);
      a.env(g, t, 0.005, 0.4 / (i + 1), 2.4 / (i * 0.5 + 1));
    });
  },
  bell: (a, o, t) => {
    [72, 76, 79, 84].forEach((n, i) => {
      const g = a.gain(o, 0);
      a.osc('sine', NOTE(n), t + i * 0.09, 1.2, g);
      a.osc('sine', NOTE(n) * 2.76, t + i * 0.09, 0.3, a.gain(g, 0.25));
      a.env(g, t + i * 0.09, 0.002, 0.22, 1.1);
    });
  },
  fanfare: (a, o, t) => {
    const seq: [number, number, number][] = [
      [67, 0, 0.15], [72, 0.15, 0.15], [76, 0.3, 0.15], [79, 0.45, 0.35], [76, 0.8, 0.15], [79, 0.95, 0.8],
    ];
    for (const [n, d, l] of seq) {
      for (const det of [-7, 7]) {
        const g = a.gain(o, 0);
        const s = a.osc('sawtooth', NOTE(n), t + d, l + 0.1, a.filter('lowpass', 2500, 1, g));
        s.detune.value = det;
        a.env(g, t + d, 0.01, 0.12, l);
      }
    }
  },
  sad: (a, o, t) => {
    [67, 63, 60].forEach((n, i) => {
      const g = a.gain(o, 0);
      a.osc('triangle', NOTE(n), t + i * 0.3, 0.6, g);
      a.env(g, t + i * 0.3, 0.01, 0.3, 0.5);
    });
  },
  pop: (a, o, t) => {
    const g = a.gain(o, 0);
    a.osc('sine', 600, t, 0.08, g).frequency.exponentialRampToValueAtTime(1500, t + 0.05);
    a.env(g, t, 0.001, 0.35, 0.07);
    const n = a.gain(o, 0);
    a.noise(t, 0.06, a.filter('highpass', 4000, 1, n));
    a.env(n, t, 0.001, 0.3, 0.06);
  },
  snore: (a, o, t) => {
    const g = a.gain(o, 0);
    const lp = a.filter('lowpass', 500, 3, g);
    const s = a.osc('sawtooth', 70, t, 1.2, lp);
    s.frequency.linearRampToValueAtTime(95, t + 0.6);
    s.frequency.linearRampToValueAtTime(60, t + 1.1);
    const n = a.gain(o, 0);
    a.noise(t, 1.2, a.filter('bandpass', 700, 1.5, n));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    a.env(n, t + 0.4, 0.2, 0.15, 0.6);
  },
  chat: (a, o, t) => {
    for (let i = 0; i < 4; i++) {
      const g = a.gain(o, 0);
      const f = 260 + Math.random() * 260;
      const s = a.osc('triangle', f, t + i * 0.08, 0.07, a.filter('bandpass', 1200, 2, g));
      s.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + i * 0.08 + 0.07);
      a.env(g, t + i * 0.08, 0.01, 0.3, 0.06);
    }
  },
  happyChat: (a, o, t) => {
    [0, 0.09, 0.18, 0.3].forEach((d, i) => {
      const g = a.gain(o, 0);
      a.osc('triangle', 380 + i * 90, t + d, 0.1, a.filter('bandpass', 1400, 2, g));
      a.env(g, t + d, 0.01, 0.3, 0.09);
    });
  },
  squeak: (a, o, t) => {
    const g = a.gain(o, 0);
    const s = a.osc('sine', 1800 + Math.random() * 600, t, 0.12, g);
    s.frequency.linearRampToValueAtTime(2600, t + 0.1);
    a.env(g, t, 0.005, 0.12, 0.1);
  },
  sigh: (a, o, t) => {
    const g = a.gain(o, 0);
    const bp = a.filter('bandpass', 900, 1, g);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.8);
    a.noise(t, 0.9, bp);
    a.env(g, t, 0.15, 0.35, 0.7);
  },
} satisfies Record<string, Synth>;

export type SfxName = keyof typeof SYNTHS;
