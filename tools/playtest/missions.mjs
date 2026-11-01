#!/usr/bin/env node
// v0.10 "Cota × Missão": cada peça do núcleo jogada de verdade dentro do jogo (?debug), com prints.
//   agenda     — compromissos com hora, sempre uma AUSÊNCIA LONGA (o chefe some pelo elevador) e o quadro mostra
//   distração  — impressora, rádio, viva-voz e alarme puxam (ou prendem) o chefe; o alarme evacua os colegas
//   minigames  — cada painel abre, resolve, e Q sai sem progresso (o pôster largado fica torto)
//   grampeador — chave extra (revirar) → escrivaninha (fechadura) → sua mesa; FUN pago; subtarefas na lista
//   flagrante  — visto com o item: perseguição; demitido com ele, o item volta e a missão volta uma etapa
//   passe      — botão direito com o item: ele voa e cai no chão
//   aquário, relógio, salgadinho (elevador em pleno dia), papel de parede, campeonato, pôsteres
//   cota       — a pauta não feita custa vida no fim do dia
//   papo       — trabalho feito vira segundos; o chefe para virado para quem fala
//   vigilância — câmera vermelha × verde, sensor que chama o chefe, sala trancada com código
//
//   npm run playtest:missions            (sobe o servidor na porta 5182 se precisar)
//   npm run playtest:missions -- --url http://localhost:5181/ [--only a,b] [--noshots 1]
// Sai com código 1 se algo falhar. Prints em tools/playtest/out/missions/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'out', 'missions');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};

let server = null;
async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
async function ensureServer() {
  const given = arg('url');
  if (given) return given;
  const url = 'http://localhost:5182/';
  if (await up(url)) return url;
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5182', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await up(url)) return url;
  }
  throw new Error('o servidor não subiu');
}

/** Dentro da página: começa o dia `day` com a missão `id` (sem depender da carreira salva). */
const HELPERS = `
window.__day = (day, id) => {
  const g = window.game;
  window.quickstart(day);
  window.skipElevator();
  if (id) { g.missions.roll(day, [id]); g.missions.big = id; g.missions['begin'](); }
  g.agenda.items = [];
  return g;
};
window.__go = (v) => window.game.player.ball.setPos(v.x, v.z);
`;

// Cada caso roda dentro da página e devolve { ok, evidence }.
const CASES = {
  agenda: () => {
    const g = window.game;
    window.quickstart(1);
    window.skipElevator();
    const ag = g.agenda;
    const long = ag.longItem;
    if (!long) return { ok: false, evidence: 'sem ausência longa' };
    const main = g.bosses[0];
    const rolled = ag.items.map((x) => `${x.kind}@${Math.round(x.at)}${x.kind === long.kind ? `(${Math.round(x.dur)} s)` : ''}`).join(' ');
    const n = ag.items.length;
    // só a ausência longa, logo: os compromissos de antes atrasam em cascata e empurravam a ausência para depois da
    // janela do teste (e o teste passava porque o chefe nunca voltava — era o bug "sumiu e nunca mais voltou")
    ag.items = [long];
    long.at = Math.ceil(g.time) + 3;
    let start = -1;
    let end = -1;
    while (g.phase === 'play' && g.time < long.at + long.dur * 2 + 30 && end < 0) {
      window.step(0.5);
      const gone = main.away && !main.ball.root.visible;
      if (gone && start < 0) start = g.time;
      if (!gone && start >= 0) end = g.time;
    }
    const awayT = start < 0 ? 0 : (end < 0 ? g.time : end) - start;
    // sumiu pela duração da agenda (±8 s) e VOLTOU visível
    const ok = n >= 3 && start >= 0 && end >= 0 && Math.abs(awayT - long.dur) <= 8 && main.ball.root.visible;
    return { ok, evidence: `${rolled}; sumiu do andar por ${awayT.toFixed(1)} s${end >= 0 ? ` e voltou (${main.state})` : ' e NÃO voltou'}` };
  },

  distracoes: () => {
    const g = window.game;
    const out = [];
    let ok = true;
    for (const id of ['impressora', 'radio', 'ramal', 'alarme']) {
      window.__day(2);
      window.step(22);
      const main = g.bosses[0];
      const wasBusy = main.busy;
      g.distract.apply(id, g.player);
      window.step(0.6);
      let pass = id === 'ramal' ? g['ramalHold'] > g.time : main.busy && !wasBusy;
      if (id === 'alarme') pass = pass && g.workers.some((w) => w.botState === 'evacuating');
      out.push(`${id}: ${pass ? 'ok' : 'FALHOU'} (${main.state})`);
      ok = ok && pass;
    }
    const list = (() => {
      window.__day(0);
      return g.distract.interactables().length;
    })();
    // v0.11: tudo liberado desde o 1º dia
    out.push(`no 1º dia: ${list} distrações à mão (esperado: 4)`);
    return { ok: ok && list === 4, evidence: out.join(' · ') };
  },

  minigames: () => {
    const g = window.game;
    window.__day(1);
    const kinds = ['fios', 'revirar', 'fechadura', 'digitar', 'arrastar', 'ritmo', 'sintonizar', 'discar', 'alavanca', 'balcao', 'ponteiros', 'poster', 'comer'];
    const res = [];
    for (const k of kinds) {
      let done = false;
      g.minigame.start({ kind: k, title: k, opts: { code: '1234', found: true }, onDone: () => (done = true) });
      window.step(0.2);
      const open = g.minigame.open && g.pc.lockMove;
      g.minigame.solve();
      window.step(0.1);
      res.push(`${k}:${open && done && !g.minigame.open ? 'ok' : 'X'}`);
    }
    // Q sai sem progresso
    let cancelled = false;
    let done2 = false;
    g.minigame.start({ kind: 'fios', title: 'q', onDone: () => (done2 = true), onCancel: () => (cancelled = true) });
    window.step(0.1);
    window.key('KeyQ');
    window.step(0.1);
    return { ok: res.every((r) => r.endsWith('ok')) && cancelled && !done2, evidence: `${res.join(' ')} · Q cancela=${cancelled}` };
  },

  grampeador: () => {
    const g = window.__day(0, 'grampeador');
    const M = g.missions;
    const ev = [];
    // v0.11: ser visto com o item enche a barra (grave); o caso testa a missão, então o chefe fica fora de cena
    for (const b of g.bosses) b.ball.root.visible = false;
    const steps0 = M.steps().map((x) => x[1]).join(',');
    const wrong = M.cands.find((i) => i !== M.keySpot);
    window.__go(M.spots[wrong].pos);
    M.hostAct(g.player, `m:empty${wrong}`);
    window.__go(M.spots[M.keySpot].pos);
    M.hostAct(g.player, `m:found${M.keySpot}`);
    ev.push(`chave: etapa ${M.step}`);
    window.__go(M['drawer']);
    M.hostAct(g.player, 'm:drawer');
    const opened = M.step === 1 && (M.flags & 16) > 0;
    window.step(0.6);
    const slid = g.office.bossDrawer.k > 0.8 && g.office.bossDrawer.gold.visible;
    M.hostAct(g.player, 'm:grab');
    const it = g.items.get('gramp');
    ev.push(`gaveta: abriu=${opened}, deslizou=${slid}, etapa ${M.step}, item ${it.status}`);
    window.step(0.2);
    const holding = g.pc.holdingMission;
    window.__go(g.player.desk.standPos);
    const fun0 = g.player.fun;
    M.hostAct(g.player, 'm:hide');
    window.step(0.3);
    const gain = g.player.fun - fun0;
    ev.push(`escondeu: feita=${M.done}, +${gain.toFixed(1)} FUN (meta ${g.goal}); subtarefas no começo: ${steps0}`);
    return { ok: M.done && opened && slid && gain >= g.goal * 0.6 && holding && steps0 === 'now,todo,todo', evidence: ev.join(' · ') };
  },

  flagrante: () => {
    const g = window.__day(0, 'grampeador');
    window.step(62);
    const M = g.missions;
    const it = g.items.get('gramp');
    M.step = 2;
    it.status = 'held';
    it.holders = [g.player];
    it.lastHolder = g.player;
    const main = g.bosses[0];
    g.distract.apply('impressora', g.player);
    for (let i = 0; i < 60 && !(main.out && main.state === 'walk'); i++) window.step(0.25);
    const p = main.pos.clone().addScaledVector(main.forward(), 7);
    g.player.ball.setPos(p.x, p.z);
    const seen = main.sees(g.player.ball.pos);
    window.step(0.15);
    const chased = main.state === 'chase' && main.chaseW === g.player;
    for (let i = 0; i < 40 && !g.player.fired; i++) window.step(0.25);
    return { ok: seen && chased && g.player.fired && it.status === 'done' && M.step === 1, evidence: `via=${seen}, perseguindo=${chased}, demitido=${g.player.fired}, item ${it.status}, etapa ${M.step}` };
  },

  passe: () => {
    const g = window.__day(0, 'grampeador');
    const it = g.items.get('gramp');
    g.missions.step = 2;
    it.status = 'held';
    it.holders = [g.player];
    window.tp(10, 12, 180, 0.2);
    document.querySelector('canvas').dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
    window.step(0.8);
    const charging = g.pc.throwing;
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    window.step(0.1);
    const flew = it.status === 'flying';
    window.step(2.5);
    return { ok: charging && flew && it.status === 'rest', evidence: `carregou=${charging}, voou=${flew}, caiu=${it.status === 'rest'}` };
  },

  aquario: () => {
    const g = window.__day(1, 'aquario');
    const M = g.missions;
    const it = g.items.get('aqua');
    g.player.ball.setPos(it.pos.x, it.pos.z + 0.8);
    g.items.apply(g.player, 'pick', 'aqua');
    window.step(0.2);
    const mul = g.items.speedMul(g.player);
    window.__go(M['copaStand']);
    const fun0 = g.player.fun;
    M.hostAct(g.player, 'm:deliver');
    window.step(0.3);
    return { ok: Math.abs(mul - 0.38) < 0.01 && M.done && g.player.fun > fun0, evidence: `sozinho ×${mul}; entregou=${M.done}, +${(g.player.fun - fun0).toFixed(1)} FUN` };
  },

  relogio: () => {
    const g = window.__day(1, 'relogio');
    const M = g.missions;
    const it = g.items.get('banco');
    window.__go(it.pos);
    g.items.apply(g.player, 'pick', 'banco');
    window.step(0.1);
    const s1 = M.step;
    window.__go(M['clockSpot']);
    M.hostAct(g.player, 'm:stool');
    const s2 = M.step;
    const d0 = g.duration;
    M.hostAct(g.player, 'm:clock');
    const d1 = g.duration;
    g.items.apply(g.player, 'pick', 'banco');
    window.__go(M['stoolHome']);
    M.hostAct(g.player, 'm:return');
    window.step(0.2);
    return { ok: s1 === 1 && s2 === 2 && d0 - d1 === 30 && M.done, evidence: `etapas ${s1}→${s2}; expediente ${d0}→${d1} s; feita=${M.done}` };
  },

  salgadinho: () => {
    const g = window.__day(1, 'salgadinho');
    const M = g.missions;
    window.__go(g.player.desk.standPos);
    M.hostAct(g.player, 'm:coins');
    const P = g.office.P;
    window.__go(P.elevator);
    g.rideMidday(true);
    window.step(3);
    const below = g.office.inLobby(g.player.ball.pos) || g.office.inLobbyCabin(g.player.ball.pos);
    const s2 = M.step;
    window.__go(M['counter']);
    M.hostAct(g.player, 'm:buy');
    const held = g.items.heldBy(g.player)?.kind;
    window.__go(P.elevator.clone().setZ(P.elevator.z + -40));
    g.rideMidday(false);
    window.step(3);
    window.__go(g.player.desk.standPos);
    window.step(0.3);
    const s4 = M.step;
    M.hostAct(g.player, 'm:eat');
    window.step(0.2);
    return { ok: below && s2 === 2 && held === 'salgadinho' && s4 === 4 && M.done, evidence: `desceu=${below} (etapa ${s2}); na mão: ${held}; subiu → etapa ${s4}; feita=${M.done}` };
  },

  papel: () => {
    const g = window.__day(1, 'papel');
    const M = g.missions;
    window.__go(M.spots[M.keySpot].pos);
    M.hostAct(g.player, `m:found${M.keySpot}`);
    window.__go(M['bossPc']);
    M.hostAct(g.player, 'm:pc');
    window.step(0.2);
    return { ok: M.done && !!M['meme'], evidence: `senha ${M.code}; feita=${M.done}; meme no monitor=${!!M['meme']}` };
  },

  campeonato: () => {
    const g = window.__day(4, 'lan');
    const M = g.missions;
    const on = !!g.computer.apps.tiro['host'].arena;
    const need = M.lanGoal;
    for (let i = 0; i < need; i++) g.missions.lanKill();
    window.step(0.2);
    return { ok: on && M.done, evidence: `Ball Ops em modo arena=${on}; ${need} abates → feita=${M.done}` };
  },

  posteres: () => {
    const g = window.__day(4, 'posteres');
    const M = g.missions;
    window.__go(g.player.desk.standPos);
    M.hostAct(g.player, 'm:roll');
    // um torto e o chefe acha
    M.hostAct(g.player, 'm:torto0');
    const torto = M.posterState[0];
    M.posters.forEach((i, k) => {
      window.__go(M.posterSpots[i].stand);
      M.hostAct(g.player, `m:poster${k}`);
    });
    window.step(0.2);
    return { ok: torto === 1 && M.done, evidence: `pôster largado no meio ficou torto=${torto === 1}; ${M.posters.length} colados → feita=${M.done}` };
  },

  cota: () => {
    const g = window.__day(1, 'grampeador');
    const pauta = g.tasks.pauta.map((p) => `${p.kind} ${p.goal}`).join(', ');
    g.player.fun = 999;
    g.endDay(false);
    const lost = g['eveningRes']?.lifeLost;
    const g2 = window.__day(1, 'grampeador');
    g2.player.fun = 999;
    g2.tasks.fixed.prog = g2.tasks.fixed.quota;
    for (const p of g2.tasks.pauta) p.prog = p.goal;
    g2.endDay(false);
    const lost2 = g2['eveningRes']?.lifeLost;
    // v0.12: o trabalho é opcional; só a meta de FUN custa vida
    return { ok: lost === '' && lost2 === '', evidence: `pauta: ${pauta}; sem trabalho → "${lost}"; com trabalho → "${lost2}"` };
  },

  rodizio: () => {
    const g = window.__day(1, 'grampeador');
    const T = g.tasks;
    const w0 = g.wallet;
    const n = T.fixed.quota + 5;
    const kinds = new Set();
    let homeOk = true;
    for (let i = 0; i < n; i++) {
      const k = T.fixed.kind;
      kinds.add(k);
      if (g.computer.home !== (k === 'planilha' ? 'planilha' : 'trabalho')) homeOk = false;
      if (k === 'planilha') for (let j = 0; j < 4; j++) g.onAppEvent({ t: 'beat', hit: true, perfect: false });
      else g.onAppEvent({ t: 'task', result: 'done' });
    }
    const paid = g.wallet - w0;
    return {
      // v0.11: cada rodada paga WORK.pay (6) sem upgrades
      ok: T.fixed.prog === n && T.fixedDone && kinds.size === 5 && homeOk && paid === n * 6,
      evidence: `${n} rodadas (cota ${T.fixed.quota}) → prog=${T.fixed.prog}; tipos=${[...kinds].join(',')}; janela certa=${homeOk}; vale +${paid}`,
    };
  },

  papo: () => {
    const g = window.__day(1);
    for (let i = 0; i < 8; i++) g.onAppEvent({ t: 'beat', hit: true, perfect: false });
    const bank = g.talkBank;
    window.step(25);
    const main = g.bosses[0];
    g.distract.apply('impressora', g.player);
    for (let i = 0; i < 60 && !(main.out && main.state === 'walk'); i++) window.step(0.25);
    const p = main.pos.clone().addScaledVector(main.forward(), 1.8);
    g.player.ball.setPos(p.x, p.z);
    g.startTalk(main);
    window.step(1);
    const talking = main.talkW === g.player;
    const pos0 = main.pos.clone();
    window.step(3);
    const still = main.pos.distanceTo(pos0) < 0.3;
    // quem está atrás dele fica livre
    const behind = main.pos.clone().addScaledVector(main.forward(), -4);
    const blindBehind = !main.sees(behind);
    g.player.ball.setPos(p.x + 6, p.z);
    window.step(0.5);
    return { ok: bank === 16 && talking && still && blindBehind && !main.talkW, evidence: `8 acertos → ${bank} s; conversando=${talking}, parado=${still}, atrás livre=${blindBehind}, afastou → papo acabou=${!main.talkW}` };
  },

  vigilancia: () => {
    const g = window.__day(3, 'grampeador');
    const S = g.surv;
    // v0.11: a vigilância é sorteada (dia 3+); o teste liga os três equipamentos
    S.resetDay(3, ['cam', 'sensor', 'lock']);
    const on = `câmera=${S.camsOn} sensor=${S.sensorOn} tranca=${S.lockOn}`;
    // câmera: com o grampeador na mão, dentro do cone, o vermelho dá Suspeita (o verde não)
    const cam = S['cams'][0];
    const it = g.items.get('gramp');
    it.status = 'held';
    it.holders = [g.player];
    const hidden = g.bosses.map((b) => b.ball.root.visible);
    g.bosses.forEach((b) => (b.ball.root.visible = false));
    let sus = 0;
    for (let i = 0; i < 40; i++) {
      window.step(0.25);
      const q = cam.pos.clone();
      q.x += Math.cos(Math.PI / 2 - cam.yaw) * 3;
      q.z += Math.sin(Math.PI / 2 - cam.yaw) * 3;
      g.player.ball.setPos(q.x, q.z);
      const s0 = g.player.sus;
      window.step(0.2);
      sus += Math.max(0, g.player.sus - s0);
    }
    g.bosses.forEach((b, i) => (b.ball.root.visible = hidden[i]));
    // v0.11: a barra exponencial da câmera quase estoura; zera e solta o item (senão o chefe segue vindo ver)
    g.player.sus = 0;
    it.holders = [];
    it.status = 'rest';
    it.pos.copy(it.home);
    it.lastHolder = null;
    g.player.fired = false;
    it.holders = [];
    it.status = 'done';
    g.player.sus = 0;
    // porta trancada segura o jogador
    const v = g.office.P.bossDoor;
    const p = v.clone();
    p.z += 0.0;
    S.collidePlayer(p);
    const blocked = p.distanceTo(v) > 0.2;
    // código errado não abre; certo abre
    S.hostAct(g.player, 'sv:unlock');
    const unlocked = S.unlocked;
    // sensor: entrou com ele ligado e o chefe fora → ele volta (dia novo: a câmera acima deixou o chefe ocupado)
    window.__day(3, 'grampeador');
    S.resetDay(3, ['cam', 'sensor', 'lock']);
    window.step(2);
    const main = g.bosses[0];
    // v0.11: a câmera vermelha com o item faz o chefe vir ver; espera ele voltar para a sala antes de testar o sensor
    for (let i = 0; i < 120 && main.state !== 'office'; i++) window.step(0.5);
    g.distract.apply('impressora', g.player);
    for (let i = 0; i < 80 && !(main.out && main.state !== 'toDoor' && main.state !== 'door'); i++) window.step(0.25);
    window.step(1);
    g.player.ball.setPos(g.office.P.bossDesk.x + 1.2, g.office.P.bossDesk.z + 0.6);
    window.step(0.3);
    const called = main.state === 'return';
    return { ok: S.camsOn && S.sensorOn && S.lockOn && blocked && unlocked && called && sus > 0, evidence: `${on}; porta segura=${blocked}; código abre=${unlocked}; sensor chamou o chefe=${called} (${main.state}); câmera: +${sus.toFixed(1)} Suspeita` };
  },
};

const SHOTS = [
  ['painel-fios', () => {
    window.__day(2);
    window.cam(10, 1.7, 12, 10, 1.6, 4);
    window.game.minigame.start({ kind: 'fios', title: '🖨 Travar a impressora', hint: 'troque os fios: ela vai apitar', onDone: () => {} });
    window.step(0.1);
  }],
  ['painel-poster', () => {
    window.game.minigame.close(true);
    window.game.minigame.start({ kind: 'poster', title: '🖼 Colar o pôster', hint: 'alinhe na moldura e alise as bolhas — difícil!', onDone: () => {} });
    window.step(0.1);
  }],
  ['lista-subtarefas', () => {
    window.game.minigame.close(true);
    window.__day(0, 'grampeador');
    window.tp(4.5, 12.6, 0, 0.1);
  }],
  ['quadro-agenda', () => {
    window.quickstart(1);
    window.skipElevator();
    window.cam(5.4, 1.65, 5.9, 4.9, 1.6, 4.1);
  }],
  ['camera-cone', () => {
    window.__day(3);
    window.step(4);
    window.cam(9, 2.6, 15, 3, 0, 8);
  }],
  ['arquivo-e-cabideiro', () => {
    window.__day(2);
    window.cam(10.5, 1.7, 16.5, 12.6, 1.0, 19.3);
  }],
];

const server0 = await ensureServer();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server0}?debug`);
  await page.waitForFunction(() => !!window.game && !!window.quickstart, null, { timeout: 60000 });
  await page.evaluate(() => window.fakeLock());
  await page.evaluate(HELPERS);
  // prints antes dos casos: avisos e carimbos dos casos ainda estariam na tela
  if (!arg('noshots'))
    for (const [name, fn] of SHOTS) {
      await page.evaluate(fn);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.renderer.render(performance.now() / 1000));
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      await page.evaluate(() => (window.frozen = false));
    }
  await page.evaluate(() => window.game.minigame.close(true));
  const only = arg('only');
  for (const [name, fn] of Object.entries(CASES)) {
    if (only && !only.split(',').includes(name)) continue;
    let r;
    try {
      r = await page.evaluate(fn);
    } catch (e) {
      r = { ok: false, evidence: `erro: ${String(e).split('\n')[0]}` };
    }
    if (!r.ok) failed++;
    console.log(`${r.ok ? '✓' : '✗'} ${name.padEnd(11)} ${r.evidence}`);
  }
  if (errors.length) {
    failed++;
    console.log(`✗ erros na página: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  }
} finally {
  await browser.close();
  server?.kill();
}
console.log(failed ? `\n${failed} falha(s).` : `\nTudo certo. Prints em ${path.relative(ROOT, OUT)}`);
process.exit(failed ? 1 : 0);
