import '@fontsource/darumadrop-one/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './style.css';
import * as THREE from 'three';
import { Renderer } from './core/Renderer';
import { AudioEngine } from './core/Audio';
import { Input } from './core/Input';
import { Juice } from './core/Juice';
import { MAP, Office } from './world/Office';
import { HUD } from './ui/HUD';
import { Screens } from './ui/Screens';
import { Game, type DayResult } from './game/Game';
import { Multi } from './game/Multi';
import { hostLocal, localProvider } from './net/LocalLobby';
import { NET_VERSION, type JoinError, type Lobby, type LobbyProvider, type MemberMeta } from './net/Lobby';
import { keepSaveOff, load, save } from './save';
import { PLAYABLE, type Variant } from './characters/designs';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const fitUI = () => document.documentElement.style.setProperty('--s', String(Math.max(0.85, Math.min(1.7, window.innerHeight / 800))));
fitUI();
window.addEventListener('resize', fitUI);

const data = load();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const input = new Input(canvas);
const juice = new Juice(renderer.scene, ui);
const office = new Office();
renderer.scene.add(office.root);
renderer.scene.background = null;
const hud = new HUD(ui);
const game = new Game(renderer, audio, input, juice, office, hud, data.settings);

function applySettings() {
  const s = data.settings;
  audio.vol.master = s.master;
  audio.vol.sfx = s.sfx;
  audio.vol.music = s.music;
  audio.applyVolumes();
  input.sensitivity = s.sensitivity;
  renderer.setQuality(s.quality);
  const look = game.playerLook();
  for (const b of [game.player.ball, game.mascot]) if (b.differs(look)) b.setLook(look);
  save(data);
}

const screens = new Screens(ui, audio, data, applySettings);
let state: 'boot' | 'menu' | 'day' | 'between' = 'boot';

// ------------------------------------------------------------------ salas (Steam no app, BroadcastChannel no navegador)
const steamMods = import.meta.glob<{ steamProvider: () => LobbyProvider | null }>('./net/SteamLobby.ts');
const localRooms = localProvider();
let provider: LobbyProvider = localRooms;
const steamLoad = steamMods['./net/SteamLobby.ts'];
if (steamLoad && (window as unknown as { steam?: unknown }).steam)
  void steamLoad().then((m) => {
    const p = m.steamProvider();
    if (!p?.available) return;
    provider = p;
    p.onInvite((code) => {
      // o convite que abriu o jogo chega ainda na tela de boot: guarda até o menu, em vez de perder
      // (era por isso que o amigo precisava entrar pela Steam duas vezes)
      pendingInvite = code;
      if (state === 'menu' && !joining) takeInvite();
      else if (state === 'day' || state === 'between')
        game.hud.popup('warn', 'CONVITE DA STEAM', 'volte ao menu (ESC → sair) para entrar na sala');
    });
  });

let pendingInvite: string | null = null;
/** Criando/entrando numa sala: o menu e convites novos esperam. */
let joining = false;
/** Cada tentativa ganha um número; cancelar invalida a que estiver em voo. */
let attempt = 0;

function takeInvite() {
  const code = pendingInvite;
  pendingInvite = null;
  if (code) void joinRoom(code);
}

/** O carregamento fica pelo menos isso na tela, para não piscar quando a sala é local. */
const MIN_LOADING_MS = 700;
const atLeast = <T>(p: Promise<T>) =>
  Promise.all([p, new Promise((r) => setTimeout(r, MIN_LOADING_MS))]).then(([v]) => v);

const JOIN_ERR: Record<JoinError, string> = {
  'not-found': 'sala não encontrada — confira o código',
  full: 'sala cheia (6 jogadores)',
  version: 'versão diferente — peça o zip mais novo ao anfitrião',
  'in-day': 'o expediente já começou — espere o próximo dia',
  'no-host': 'o anfitrião não respondeu — tente de novo em instantes',
};

function memberMeta(): MemberMeta {
  const name = provider === localRooms ? data.settings.name || 'Jogador' : provider.selfName();
  return { name, look: game.playerLook(), ready: false, version: NET_VERSION };
}

function enterRoom(lobby: Lobby) {
  const net = new Multi(game, lobby);
  net.onHostLeft = () => {
    if (!game.net) return;
    leaveRoom();
    screens.notice('O ANFITRIÃO SAIU', 'a sala fechou — voltando ao menu', () => screens.wipe(toMenu));
  };
  game.setNet(net);
  game.newRun();
  screens.wipe(() => briefing(net.isHost ? 0 : net.hostDay));
}

function leaveRoom() {
  const net = game.net;
  if (!net) return;
  game.abortDay();
  game.setNet(null);
  net.leave();
  screens.clear();
}

async function hostRoom() {
  if (joining) return;
  joining = true;
  const my = ++attempt;
  screens.loading('CRIANDO SALA', 'reservando o escritório…', () => cancelLoading());
  try {
    const lobby = await atLeast(provider.create(memberMeta()));
    if (my !== attempt) return lobby.leave();
    enterRoom(lobby);
  } catch {
    if (my === attempt) screens.notice('NÃO DEU', 'a Steam não criou a sala — confira se ela está aberta e tente de novo', toMenu);
  } finally {
    if (my === attempt) joining = false;
  }
}

async function joinRoom(code: string) {
  if (joining) return;
  joining = true;
  const my = ++attempt;
  const step = screens.loading('ENTRANDO NA SALA', 'procurando a sala…', () => cancelLoading());
  try {
    const res = await atLeast(provider.joinByCode(code, memberMeta(), (t) => my === attempt && step(t)));
    if (my !== attempt) {
      if (typeof res !== 'string') res.leave();
      return;
    }
    if (typeof res === 'string') screens.join(joinRoom, toMenu, JOIN_ERR[res]);
    else enterRoom(res);
  } catch {
    if (my === attempt) screens.join(joinRoom, toMenu, JOIN_ERR['not-found']);
  } finally {
    if (my === attempt) joining = false;
  }
}

function cancelLoading() {
  attempt++;
  joining = false;
  toMenu();
}

function toMenu() {
  // pediu as contas no meio da run: o placar até aqui ainda conta para o recorde
  if (state === 'day' || state === 'between') recordRun();
  state = 'menu';
  leaveRoom();
  game.abortDay();
  game.startAttract();
  screens.menu({
    play: () => screens.wipe(() => startRun()),
    host: () => void hostRoom(),
    join: () => screens.join(joinRoom, toMenu),
    character: () => screens.character(toMenu),
    howto: () => screens.howto(toMenu),
    options: () => screens.options(toMenu),
    credits: () => screens.credits(toMenu),
  });
  if (pendingInvite && !joining) takeInvite();
}

function startRun() {
  game.newRun();
  briefing(0);
}

/** Começo de um dia: direto para o elevador (o painel lá dentro faz o briefing). */
function briefing(i: number) {
  screens.clear();
  state = 'day';
  game.startDay(i);
}

game.onDayEnd = (r: DayResult) => {
  state = 'between';
  setTimeout(() => {
    screens.report(r, () => screens.wipe(() => (r.runOver ? finalScreen() : briefing(r.day + 1))));
  }, 600);
};

/** Título da run pelo número de dias que você aguentou. */
function runTitle(days: number): [string, string] {
  if (days >= 15) return ['S', 'Lenda da Enrolação 👑'];
  if (days >= 10) return ['A', 'Mestre do ALT-TAB'];
  if (days >= 6) return ['B', 'Enrolador Profissional'];
  if (days >= 3) return ['C', 'Funcionário Padrão'];
  return ['D', 'Estagiário Assustado'];
}

/** Guarda o recorde (FUN total da run). Devolve se bateu o anterior. */
function recordRun() {
  const total = Math.floor(game.runFun);
  const days = game.results.length;
  if (!days || total <= data.bestScore) return false;
  data.bestScore = total;
  data.bestTitle = `${runTitle(days)[1]} · ${days} dia${days === 1 ? '' : 's'}`;
  if (runTitle(days)[0] === 'S') data.crown = true;
  save(data);
  return true;
}

function finalScreen() {
  game.startAttract();
  const res = game.results;
  const [grade, title] = runTitle(res.length);
  const isBest = recordRun();
  state = 'menu';
  audio.play(res.length >= 6 ? 'fanfare' : 'sad', 1);
  screens.final(res, game.runFun, title, grade, isBest, () => screens.wipe(toMenu), () => screens.wipe(game.net ? toMenu : startRun));
}

game.onPause = () => {
  if (state !== 'day' || game.paused) return;
  // online o dia não para: o menu abre por cima e o jogo segue
  if (!game.net) game.paused = true;
  input.unlock();
  showPause();
};

function showPause() {
  screens.pause(
    () => {
      screens.clear();
      game.paused = false;
      if (['walk', 'seated', 'ghost', 'chair', 'nap', 'hide', 'meeting'].includes(game.pc.mode)) input.lock();
    },
    () => screens.wipe(toMenu),
    () => screens.howto(showPause),
    !!game.net,
    () => screens.options(showPause, true),
  );
}

// pausa automática ao sair da aba
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'day' && !game.net) game.onPause?.();
});

applySettings();
game.startAttract();

// teste de multiplayer sem Steam: ?mp=host|join&room=CÓDIGO (mp-test.html abre as duas janelas lado a lado)
const mp = new URLSearchParams(location.search);
const mpRole = mp.get('mp');
if (mpRole === 'host' || mpRole === 'join') {
  // as janelas dividem o localStorage: cada uma tem nome e acessório próprios e ninguém grava o save real
  keepSaveOff();
  const s = data.settings;
  s.name = mp.get('name') || (mpRole === 'host' ? 'Anfitrião' : 'Convidado');
  const v = mp.get('variant');
  if (PLAYABLE.some((p) => p.id === v)) s.variant = v as Variant;
  s.tutorial = false;
  applySettings();
  // o áudio só liga com um gesto
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  const room = (mp.get('room') || 'TESTE').toUpperCase();
  state = 'menu';
  if (mpRole === 'host') enterRoom(hostLocal(room, memberMeta()));
  else
    void (async () => {
      // a janela do anfitrião pode carregar depois: tenta por ~15 s
      for (let i = 0; i < 30; i++) {
        const res = await localRooms.joinByCode(room, memberMeta());
        if (typeof res !== 'string') return enterRoom(res);
        if (res !== 'not-found') return screens.join(joinRoom, toMenu, JOIN_ERR[res]);
        await new Promise((r) => setTimeout(r, 500));
      }
      screens.join(joinRoom, toMenu, JOIN_ERR['not-found']);
    })();
} else
  screens.boot(() => {
    audio.unlock();
    applySettings();
    audio.play('confirm', 1);
    game.startAttract();
    screens.wipe(toMenu);
  });

// debug: expõe o jogo no console (?debug) — só no dev ou no build do playtest (VITE_PLAYTEST=1), nunca no do jogador
if ((import.meta.env.DEV || import.meta.env.VITE_PLAYTEST === '1') && location.search.includes('debug')) {
  const w = window as unknown as Record<string, unknown>;
  w.game = game;
  w.renderer = renderer;
  w.audio = audio;
  w.leaveRoom = () => toMenu();
  // avança a simulação N segundos de forma síncrona (testes com a aba em segundo plano)
  w.step = (secs: number, fps = 30) => {
    for (let i = 0; i < secs * fps; i++) {
      game.update(1 / fps);
      input.endFrame();
    }
    renderer.render(performance.now() / 1000);
  };
  const step = w.step as (s: number, f?: number) => void;
  w.key = (code: string, hold = 0.04) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    step(hold);
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    step(0.04);
  };
  w.click = (fx: number, fy: number, btn = 0) => {
    const r = canvas.getBoundingClientRect();
    const o = { clientX: r.left + (fx / 800) * r.width, clientY: r.top + (fy / 450) * r.height, button: btn, bubbles: true };
    canvas.dispatchEvent(new MouseEvent('mousemove', o));
    step(0.04);
    canvas.dispatchEvent(new MouseEvent('mousedown', o));
    step(0.04);
    window.dispatchEvent(new MouseEvent('mouseup', o));
    step(0.04);
  };
  /** Teleporta o jogador (coordenadas da planta) e aponta a câmera. */
  w.tp = (mx: number, mz: number, yawDeg: number, pitch = 0.3) => {
    game.player.ball.setPos(mx - MAP.ox, mz - MAP.oz);
    game.pc.camYaw = (yawDeg * Math.PI) / 180;
    game.pc.camPitch = pitch;
    game.pc.camPos.set(mx - MAP.ox, 2, mz - MAP.oz);
    step(0.6);
  };
  /** Câmera livre para prints (posição/alvo na planta). */
  w.cam = (mx: number, my: number, mz: number, lx: number, ly: number, lz: number) => {
    game.attract = false;
    const c = renderer.camera;
    c.position.set(mx - MAP.ox, my, mz - MAP.oz);
    c.lookAt(lx - MAP.ox, ly, lz - MAP.oz);
    game.pc.camPos.copy(c.position);
    w.frozen = true;
    renderer.render(performance.now() / 1000);
  };
  /** Simula o cursor travado (o painel de testes não concede pointer lock). */
  w.fakeLock = () => {
    Object.defineProperty(input, 'locked', { get: () => true, set: () => {} });
    input.lock = () => {};
    input.unlock = () => {};
  };
  /** Move o mouse (em pixels da janela) para olhar em modo travado. */
  w.look = (dx: number, dy = 0) => {
    input.dx += dx;
    input.dy += dy;
    game.update(1 / 30);
    input.endFrame();
  };
  w.quickstart = (day = 0) => {
    audio.unlock();
    screens.clear();
    game.newRun();
    state = 'day';
    game.startDay(day);
    step(0.1);
  };
  w.skipElevator = () => {
    game.skipElevator();
    step(0.3);
  };
  /**
   * Teste de visão das mesas: de cada cadeira, olhando o centro do monitor (sem girar a cabeça), a porta do chefe e um
   * ponto 2 m adiante no caminho dele precisam cair dentro da imagem e sem nada na frente (monitor, gente, pilar).
   */
  w.visionTest = (aspect = window.innerWidth / window.innerHeight) => {
    const cam = new THREE.PerspectiveCamera(62, aspect, 0.05, 60);
    const ray = new THREE.Raycaster();
    const office = game.office;
    const doorLeaf = new Set<THREE.Object3D>();
    office.door.traverse((o) => doorLeaf.add(o));
    const targets: [string, THREE.Vector3][] = [
      ['porta (centro)', office.P.bossDoor.clone().setY(1.3)],
      ['porta (lado esq.)', office.P.bossDoor.clone().add(new THREE.Vector3(-0.6, 1.3, 0))],
      ['porta (lado dir.)', office.P.bossDoor.clone().add(new THREE.Vector3(0.6, 1.3, 0))],
      ['caminho +2 m', office.P.bossDoor.clone().add(new THREE.Vector3(0, 1.3, 2))],
    ];
    const meshes: THREE.Object3D[] = [];
    renderer.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible && !doorLeaf.has(m) && !(m.material as THREE.Material).transparent) meshes.push(m);
    });
    const rows = office.desks.map((d) => {
      // quem senta nessa mesa não tapa a própria vista
      const own = new Set<THREE.Object3D>();
      game.allWorkers.find((x) => x.desk === d)?.ball.root.traverse((o) => own.add(o));
      // a cadeira gira com você (o encosto fica atrás)
      d.chair.traverse((o) => own.add(o));
      const head = d.seat.clone().setY(1.12);
      cam.position.copy(head);
      cam.lookAt(d.screenCenter);
      cam.updateMatrixWorld(true);
      const res: Record<string, string> = { mesa: `#${d.index}` };
      for (const [name, p] of targets) {
        const v = p.clone().project(cam);
        const inFrame = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
        const dir = p.clone().sub(head);
        const dist = dir.length();
        ray.set(head, dir.normalize());
        ray.far = dist - 0.3;
        const hit = ray.intersectObjects(meshes, false).find((h) => !own.has(h.object));
        const at = hit ? hit.object.getWorldPosition(new THREE.Vector3()) : null;
        const blocker = hit && at ? `${hit.object.name || (hit.object as THREE.Mesh).geometry?.type} em (${(at.x + MAP.ox).toFixed(1)}, ${(at.z + MAP.oz).toFixed(1)})` : '';
        res[name] = !inFrame ? 'FORA DO QUADRO' : blocker ? `tapado (${blocker} a ${hit!.distance.toFixed(1)} m)` : 'ok';
      }
      return res;
    });
    console.table(rows);
    return rows;
  };
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if ((window as unknown as { frozen?: boolean }).frozen) {
    renderer.render(now / 1000);
    requestAnimationFrame(frame);
    return;
  }
  game.update(dt);
  renderer.render(now / 1000);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
