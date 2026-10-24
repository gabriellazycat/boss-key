import '@fontsource/darumadrop-one/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './style.css';
import { Renderer } from './core/Renderer';
import { AudioEngine } from './core/Audio';
import { Input } from './core/Input';
import { Juice } from './core/Juice';
import { Office } from './world/Office';
import { HUD } from './ui/HUD';
import { Screens } from './ui/Screens';
import { Game, type DayResult } from './game/Game';
import { load, save } from './save';
import { B } from './balance';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

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
  game.player.ball.setTie(s.tie);
  game.player.ball.setBodyColor(s.color);
  game.mascot.setTie(s.tie);
  game.mascot.setBodyColor(s.color);
  save(data);
}

const screens = new Screens(ui, audio, data, applySettings);
let state: 'boot' | 'menu' | 'day' | 'between' = 'boot';

function toMenu() {
  state = 'menu';
  game.abortDay();
  game.startAttract();
  screens.menu({
    play: () => screens.wipe(() => startWeek()),
    howto: () => screens.howto(toMenu),
    options: () => screens.options(toMenu),
    credits: () => screens.credits(toMenu),
  });
}

function startWeek() {
  game.newWeek();
  briefing(0);
}

function briefing(i: number) {
  state = 'between';
  game.startAttract();
  screens.briefing(i, game.results, game.warnings, () =>
    screens.wipe(() => {
      screens.clear();
      state = 'day';
      game.startDay(i);
    }),
  );
}

game.onDayEnd = (r: DayResult) => {
  state = 'between';
  const lost = game.warnings >= B.ADVERTENCIAS_LIMITE;
  const last = r.day >= B.WEEK_DAYS - 1;
  setTimeout(() => {
    screens.report(r, game.warnings, last, lost, () =>
      screens.wipe(() => {
        if (lost || last) finalScreen();
        else briefing(r.day + 1);
      }),
    );
  }, 600);
};

function finalScreen() {
  game.startAttract();
  const res = game.results;
  const total = res.reduce((a, r) => a + r.score, 0);
  const lost = game.warnings >= B.ADVERTENCIAS_LIMITE;
  const metas = res.filter((r) => r.met).length;
  const clutches = res.reduce((a, r) => a + r.clutches, 0);
  const firedDays = res.filter((r) => r.fired).length;
  let grade = 'C';
  let title = 'Funcionário Padrão';
  if (lost) {
    grade = 'F';
    title = 'Demitido em massa 📦';
  } else if (metas === 5 && firedDays === 0) {
    grade = 'S';
    title = 'Lenda da Enrolação 👑';
  } else if (metas >= 4) {
    grade = 'A';
    title = 'Mestre do ALT-TAB';
  } else if (metas >= 3) {
    grade = 'B';
    title = clutches >= 5 ? 'Rei do Clutch' : 'Enrolador Profissional';
  } else if (metas <= 1) {
    grade = 'D';
    title = 'Trabalhou demais (que vergonha)';
  }
  const isBest = total > data.bestScore;
  if (isBest) {
    data.bestScore = total;
    data.bestTitle = title;
  }
  if (!lost) data.weeksWon++;
  if (grade === 'S') data.crown = true;
  save(data);
  audio.play(lost ? 'sad' : 'fanfare', 1);
  screens.final(res, game.warnings, total, title, grade, isBest, () => screens.wipe(toMenu), () => screens.wipe(startWeek));
}

game.onPause = () => {
  if (state !== 'day' || game.paused) return;
  game.paused = true;
  input.unlock();
  screens.pause(
    () => {
      screens.clear();
      game.paused = false;
      if (['walk', 'ghost', 'chair', 'nap', 'foosball'].includes(game.pc.mode)) input.lock();
    },
    () => screens.wipe(toMenu),
  );
};

// pausa automática ao sair da aba
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'day') game.onPause?.();
});

applySettings();
game.startAttract();
screens.boot(() => {
  audio.unlock();
  applySettings();
  audio.play('confirm', 1);
  game.startAttract();
  screens.wipe(toMenu);
});

// debug: expõe o jogo no console (?debug)
if (location.search.includes('debug')) {
  const w = window as unknown as Record<string, unknown>;
  w.game = game;
  w.renderer = renderer;
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
    game.player.ball.setPos(mx - 15, mz - 13.5);
    game.pc.camYaw = (yawDeg * Math.PI) / 180;
    game.pc.camPitch = pitch;
    game.pc.camPos.set(mx - 15, 2, mz - 13.5);
    step(0.6);
  };
  /** Câmera livre para prints (posição/alvo na planta). */
  w.cam = (mx: number, my: number, mz: number, lx: number, ly: number, lz: number) => {
    game.attract = false;
    const c = renderer.camera;
    c.position.set(mx - 15, my, mz - 13.5);
    c.lookAt(lx - 15, ly, lz - 13.5);
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
    game.newWeek();
    state = 'day';
    game.startDay(day);
    step(0.1);
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
