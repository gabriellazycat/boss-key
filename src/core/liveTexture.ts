import * as THREE from 'three';

/**
 * Textura de canvas redesenhada durante o jogo (monitores, TV, rostos).
 *
 * Reenviar um canvas para uma textura sRGB (SRGB8_ALPHA8) não tem o caminho rápido GPU→GPU do
 * Chrome: cada envio lê o canvas de volta da GPU e trava o quadro (~20 ms; sentado no PC o jogo
 * caía de ~180 para ~36 fps). Por isso ela sobe em RGBA8 cru e o material decodifica o sRGB no
 * shader, como o three faz com vídeo. Todo material que usar a textura precisa de `decodeLive`.
 */
export function liveTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Decodifica o sRGB do `map` no shader (o mesmo trecho que o three usa em VideoTexture). */
export function decodeLive<M extends THREE.Material>(m: M): M {
  // todo material do three aceita `defines`, mas os tipos só o declaram em ShaderMaterial
  const d = m as M & { defines?: Record<string, string> };
  d.defines = { ...d.defines, DECODE_VIDEO_TEXTURE: '' };
  return m;
}
