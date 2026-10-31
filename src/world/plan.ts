import * as THREE from 'three';

/** Dimensões da planta (metros). Origem da planta no canto superior esquerdo; x → direita, z → para baixo.
 *  `north`: quanto os banheiros avançam além da fachada norte (z negativo). */
export const MAP = { w: 20, d: 24, ox: 10, oz: 12, wallH: 3, north: 2.6 };

/** Converte coordenadas da planta para o mundo (centrado). */
export const W = (mx: number, mz: number, y = 0) => new THREE.Vector3(mx - MAP.ox, y, mz - MAP.oz);

/** Elevador: a cabine vai de z = 0 até `ELEV_F` (a porta), larga o bastante para a sala toda mais o chefe. */
export const ELEV_F = 5.6;
/** Térreo: deslocamento (planta, z) da cabine do hall em relação à do escritório, e os limites do hall. */
export const LOBBY_DZ = -40;
export const LOBBY = { west: 5, east: 25, south: -20 };
/** Onde cada um espera em pé dentro da cabine (o slot da sala decide; o último vai no meio, junto da porta). */
export const ELEV_SPOTS = [W(13.85, 1.5), W(16.15, 1.5), W(13.85, 3.0), W(16.15, 3.0), W(13.85, 4.5), W(16.15, 4.5), W(15.0, 4.7)];
