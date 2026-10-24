import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Passe final: vinheta, aberração cromática, flash, dessaturação, tinta vermelha e grão. */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uAberration: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDesat: { value: 0 },
    uDanger: { value: 0 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uAberration, uFlash, uDesat, uDanger, uGrain;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * uAberration * (0.6 + r2 * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);
      // perigo: borda vermelha pulsante
      float edge = smoothstep(0.12, 0.5, r2 * 1.6);
      col = mix(col, vec3(0.85, 0.05, 0.08), edge * uDanger * 0.75);
      // vinheta
      col *= 1.0 - uVignette * smoothstep(0.08, 0.55, r2 * 1.4);
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly final: ShaderPass;
  baseFov = 60;
  fovKick = 0;
  private quality: 'alta' | 'baixa' = 'alta';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  get u() {
    return this.final.uniforms as unknown as typeof FinalShader.uniforms;
  }

  setQuality(q: 'alta' | 'baixa') {
    this.quality = q;
    this.bloom.enabled = q === 'alta';
    this.renderer.shadowMap.enabled = q === 'alta';
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.quality === 'alta' ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1) * 0.75;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * 0.5, h * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(time: number) {
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.u.uTime.value = time % 100;
    this.composer.render();
  }
}
