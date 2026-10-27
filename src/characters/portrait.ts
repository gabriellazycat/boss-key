import * as THREE from 'three';
import { makeCharacter, type Look } from './designs';
import type { Character } from './rig';

/**
 * Retratos dos personagens (busto, fundo transparente) para a tela de escolha. Usa um renderizador
 * próprio e pequeno, criado na hora e descartado no fim, para não mexer na cena do jogo.
 */
export async function portraits(looks: Look[], size = 256): Promise<string[]> {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e4ecff', '#c9b8a6', 1.1));
  const key = new THREE.DirectionalLight('#fff0d8', 1.9);
  key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight('#bcd2ff', 1.4);
  rim.position.set(4, 3, -5);
  scene.add(key, rim);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  const out: string[] = [];
  for (const look of looks) {
    const ch: Character = makeCharacter(look);
    ch.emotes = [];
    scene.add(ch.root);
    ch.setExpr('happy');
    // alguns quadros para a mola e o rosto assentarem
    for (let i = 0; i < 40; i++) {
      ch.lookAt.set(0.6, ch.top * 0.9, 4);
      ch.update(1 / 30);
    }
    const h = ch.top * ch.scale;
    cam.position.set(0.55, h * 0.78, 2.3);
    cam.lookAt(0, h * 0.62, 0);
    r.render(scene, cam);
    out.push(r.domElement.toDataURL('image/png'));
    scene.remove(ch.root);
    ch.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !o.userData.outline) m.geometry.dispose();
    });
    for (const f of ch.faces) f.tex.dispose();
    // não trava a interface entre um retrato e outro
    await new Promise((res) => setTimeout(res, 0));
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
