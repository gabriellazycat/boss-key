import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Passe final: grade de cor (sombras frias, luzes quentes, saturação), vinheta, aberração cromática,
 * flash, dessaturação, borda de perigo e grão.
 */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.28 },
    uAberration: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uDesat: { value: 0 },
    uDanger: { value: 0 },
    /** Suspeita alta: vinheta vermelha que pulsa como batimento. */
    uSus: { value: 0 },
    /** Velocidade (perseguição, corrida de cadeira): linhas radiais na borda. */
    uSpeed: { value: 0 },
    uGrain: { value: 0.022 },
    uSat: { value: 1.14 },
    uContrast: { value: 1.06 },
    uLift: { value: new THREE.Vector3(0.012, 0.022, 0.04) },
    uGain: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uAberration, uFlash, uDesat, uDanger, uGrain, uSat, uContrast, uSus, uSpeed;
    uniform vec3 uFlashColor, uLift, uGain;
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
      // grade: lift (sombras azuladas) / gain (luzes quentes) / contraste / saturação
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = col * uGain + uLift * (1.0 - lum);
      col = (col - 0.5) * uContrast + 0.5;
      lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSat * (1.0 - uDesat));
      float edge = smoothstep(0.12, 0.5, r2 * 1.6);
      col = mix(col, vec3(0.85, 0.05, 0.08), edge * uDanger * 0.75);
      // Suspeita: borda vermelha pulsando (o pulso acelera conforme sobe)
      float beat = 0.55 + 0.45 * pow(abs(sin(uTime * (2.2 + uSus * 4.5))), 6.0);
      col = mix(col, vec3(0.7, 0.04, 0.08), smoothstep(0.12, 0.55, r2 * 1.6) * uSus * 0.8 * beat);
      // velocidade: riscos radiais que piscam na borda
      float ang = atan(c.y, c.x);
      float ray = step(0.86, hash(vec2(floor(ang * 46.0), floor(uTime * 14.0))));
      col = mix(col, vec3(1.0), ray * smoothstep(0.1, 0.5, r2 * 1.6) * uSpeed * 0.4);
      col *= 1.0 - uVignette * smoothstep(0.1, 0.6, r2 * 1.4);
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

/** GTAO que ignora malhas marcadas com userData.noAO (feixes de luz, efeitos). */
class StylizedAO extends GTAOPass {
  private hidden: THREE.Object3D[] = [];
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
    this.hidden.length = 0;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (o.visible && (o.userData.noAO || (m && m.transparent && (o as THREE.Mesh).isMesh && m.blending === THREE.AdditiveBlending))) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const o of this.hidden) o.visible = true;
  }
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 160);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly ao: StylizedAO;
  readonly final: ShaderPass;
  baseFov = 60;
  fovKick = 0;
  private quality: 'alta' | 'baixa' = 'alta';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#9fd3ff');
    // IBL suave: reflexos e preenchimento de luz mais ricos
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.16;

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new StylizedAO(this.scene, this.camera, 1, 1);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 1.0);
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
    this.ao.enabled = q === 'alta';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = q === 'alta' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight && l.castShadow) {
        const size = q === 'alta' ? 4096 : 1024;
        if (l.shadow.mapSize.x !== size) {
          l.shadow.mapSize.set(size, size);
          l.shadow.map?.dispose();
          l.shadow.map = null;
        }
      }
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
