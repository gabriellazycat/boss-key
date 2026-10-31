#!/usr/bin/env node
// Playtest automático do BOSS KEY: jogadores-robô jogam runs solo (aceleradas e em tempo real) e salas
// multiplayer locais (uma aba do Chrome por jogador), e o resultado vira um relatório com bugs e notas de diversão.
//
//   npm run playtest                       → suíte completa (~60-90 min)
//   npm run playtest -- --suite smoke      → conferência rápida (~3 min)
//   npm run playtest -- --suite solo --solo-runs 3 --profiles arriscado
//
// Saída: tools/playtest/out/<data-hora>/ (runs/*.json, report.md, vídeos e prints das partidas em tempo real).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, renderReport } from './analyze.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BOT = path.join(HERE, 'bot.js');

// ------------------------------------------------------------------ opções
const SUITES = {
  full: { solo: true, real: true, mp: true },
  solo: { solo: true },
  real: { real: true },
  mp: { mp: true },
  smoke: { solo: true, mp: true, soloRuns: 1, maxDays: 2, profiles: ['equilibrado', 'caotico'], mpPlayers: [2], mpRuns: 1, mpDays: 1, video: false },
};
const opt = parseArgs(process.argv.slice(2));
const suite = SUITES[opt.suite ?? 'full'];
if (!suite) die(`suíte desconhecida: ${opt.suite} (use ${Object.keys(SUITES).join(', ')})`);
const cfg = {
  solo: suite.solo, real: suite.real, mp: suite.mp,
  profiles: list(opt.profiles) ?? suite.profiles ?? ['cauteloso', 'equilibrado', 'arriscado', 'caotico'],
  soloRuns: num(opt['solo-runs']) ?? suite.soloRuns ?? 8,
  maxDays: num(opt['max-days']) ?? suite.maxDays ?? 12,
  realRuns: num(opt['real-runs']) ?? 2,
  realDays: num(opt['real-days']) ?? 3,
  mpPlayers: (list(opt['mp-players']) ?? suite.mpPlayers ?? [2, 3, 4]).map(Number),
  mpRuns: num(opt['mp-runs']) ?? suite.mpRuns ?? 2,
  mpDays: num(opt['mp-days']) ?? suite.mpDays ?? 3,
  parallel: num(opt.parallel) ?? 4,
  // sessões em tempo real uma de cada vez: abas WebGL em paralelo disputam a GPU e o relógio do jogo descola do real
  mpParallel: num(opt['mp-parallel']) ?? 1,
  seed: num(opt.seed) ?? 1000,
  trace: !!opt.trace,
  ghostFF: !!opt['ghost-ff'],
  headed: !!opt.headed,
  video: opt.video === undefined ? suite.video ?? true : opt.video !== 'false',
  port: num(opt.port) ?? 5180,
  url: opt.url,
  server: opt.server ?? 'build',
};
const OUT = path.join(HERE, 'out', opt.out ?? stamp());
fs.mkdirSync(path.join(OUT, 'runs'), { recursive: true });
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

// ------------------------------------------------------------------ servidor do jogo
let server = null;
async function ensureServer() {
  if (cfg.url) return cfg.url;
  const url = `http://localhost:${cfg.port}/`;
  if (await ok(url)) return url;
  const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js');
  let args = ['--port', String(cfg.port), '--strictPort'];
  if (cfg.server === 'build') {
    // build de produção numa pasta própria (não mexe em dist/): abre mais rápido e testa o que vai para o jogador
    const outDir = path.join(HERE, 'out', '_build');
    log('compilando o jogo (vite build)…');
    // VITE_PLAYTEST=1 libera o ?debug neste build (no build do jogador ele fica desligado)
    const b = spawn(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_PLAYTEST: '1' } });
    const code = await new Promise((r) => b.on('exit', r));
    if (code !== 0) die(`vite build falhou (código ${code})`);
    args = ['preview', '--outDir', outDir, ...args];
  }
  server = spawn(process.execPath, [vite, ...args], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await ok(url)) return url;
  }
  die('o servidor do Vite não subiu');
}

// ------------------------------------------------------------------ navegador
// Um Chrome por run (ou por sala multiplayer): com várias abas jogando sem parar no mesmo Chrome, abas novas
// não terminavam de carregar (page.goto estourava o tempo), com ou sem uma aba travada.
const browsers = new Set();
async function launch() {
  const b = await chromium.launch({
    channel: 'chrome',
    headless: !cfg.headed,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio'],
  });
  browsers.add(b);
  return b;
}
async function closeBrowser(b) {
  browsers.delete(b);
  await Promise.race([b.close().catch(() => {}), sleep(20000)]);
}
async function newContext(browser, video) {
  return browser.newContext({ viewport: { width: 960, height: 540 }, recordVideo: video ? { dir: path.join(OUT, 'videos'), size: { width: 640, height: 360 } } : undefined });
}
/** Abre o jogo numa aba nova, injeta o robô e liga os registros de erro. */
async function openGame(ctx, url, query, botOpts, tag) {
  const page = await ctx.newPage();
  // aleatório com semente: a mesma semente repete a mesma partida no modo acelerado
  if (botOpts.seed !== undefined)
    await page.addInitScript((seed) => {
      let a = seed >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, botOpts.seed);
  const errs = [];
  page.on('pageerror', (e) => errs.push({ kind: 'pageerror', msg: String(e.message ?? e).slice(0, 400) }));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push({ kind: 'console', msg: m.text().slice(0, 400) });
  });
  // depois de um travamento o próprio evalT derruba a aba: esse crash não conta de novo
  page.on('crash', () => page._pt?.hung || errs.push({ kind: 'crash', msg: 'a aba travou (crash)' }));
  await page.goto(`${url}?debug${query}`, { timeout: 90000 });
  await page.waitForFunction(() => window.game && window.step, null, { timeout: 30000 });
  await page.addScriptTag({ path: BOT });
  await page.evaluate((o) => window.PT.init(o), botOpts);
  const gpu = await page.evaluate(() => {
    const gl = document.getElementById('gl').getContext('webgl2') ?? document.getElementById('gl').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : String(gl?.getParameter(gl.RENDERER));
  }).catch(() => '?');
  // depurador ligado desde já: com a aba presa num laço, o Debugger.enable não responde mais, só o Debugger.pause
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Debugger.enable');
  page._pt = { errs, tag, gpu, cdp };
  return page;
}
/** Promessa com tempo limite (resolve com `fallback` se não voltar a tempo). */
function within(pr, ms, fallback = null) {
  return Promise.race([pr.catch(() => fallback), sleep(ms).then(() => fallback)]);
}
/** page.evaluate com tempo limite; se travar, pausa o JS pelo DevTools, guarda a pilha e derruba a aba. */
async function evalT(page, fn, arg, ms = 60000) {
  if (page._pt?.hung) throw Object.assign(new Error('a página já tinha travado'), { hang: page._pt.hung });
  let timer;
  const hang = new Promise((_, rej) => (timer = setTimeout(() => rej(new Error('HANG')), ms)));
  try {
    return await Promise.race([page.evaluate(fn, arg), hang]);
  } catch (e) {
    if (e.message !== 'HANG') throw e;
    let stack = [];
    const cdp = page._pt?.cdp;
    if (cdp) {
      const paused = new Promise((r) => cdp.once('Debugger.paused', r));
      await within(cdp.send('Debugger.pause'), 5000);
      const evp = await within(paused, 5000);
      stack = (evp?.callFrames ?? []).slice(0, 10).map((f) => `${f.functionName || '(anônima)'} ${f.url.replace(/^.*\/(src|assets|playtest)\//, '$1/').replace(/\?.*$/, '')}:${f.location.lineNumber + 1}`);
      // a aba não volta mais: derruba o processo dela (Page.crash não responde, só derruba)
      cdp.send('Page.crash').catch(() => {});
    }
    if (page._pt) page._pt.hung = stack;
    const err = new Error(`a página travou (passo de jogo sem voltar por ${ms / 1000} s)`);
    err.hang = stack;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
async function collect(page, extra) {
  let data = null;
  try {
    data = await evalT(page, () => window.PT.data, undefined, 15000);
  } catch (e) {
    // aba travada: fica com a última cópia tirada no fim de um dia
    data = page._pt.snap ?? { lost: String(e.message), days: [], events: [], bugs: [], errors: [], samples: [] };
  }
  return { ...extra, gpu: page._pt.gpu, seed: page._pt.seed, pageErrors: page._pt.errs, data };
}
/** Clique direto no DOM (os botões do menu têm animação contínua e o clique do Playwright esperaria parar). */
async function domClick(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, sel).catch(() => false);
}
async function shot(page, dir, name) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${name}.jpg`), type: 'jpeg', quality: 60 });
  } catch {}
}

// ------------------------------------------------------------------ run solo
async function soloRun(url, job) {
  const id = `${job.accel ? 'solo' : 'real'}-${job.profile}-${job.idx}`;
  const browser = await launch();
  try {
    return await soloPlay(browser, url, job, id);
  } finally {
    await closeBrowser(browser);
  }
}
async function soloPlay(browser, url, job, id) {
  const { profile, accel, maxDays, seed } = job;
  const ctx = await newContext(browser, !accel && cfg.video);
  const page = await openGame(ctx, url, '', { profile, accel, maxDays, seed, ghostFF: cfg.ghostFF }, id);
  page._pt.seed = seed;
  // orçamento de tempo real: acelerado ~45 s por dia; tempo real ~4 min por dia
  const budget = (accel ? 45 : 240) * maxDays * 1000 + 90000;
  let retry = null;
  let hangStack = null;
  const t0 = Date.now();
  let stop = 'runOver';
  let started = false;
  let lastKey = '';
  let sameSince = Date.now();
  let nextShot = 0;
  const shots = path.join(OUT, 'shots', id);
  try {
    for (;;) {
      let st = await evalT(page, () => window.PT.state(), undefined, 30000);
      const key = `${st.screen}|${st.day}|${st.time}|${st.phase}|${st.running}`;
      if (Date.now() - t0 > budget) {
        stop = `tempo esgotado (${key})`;
        await shot(page, shots, 'esgotado');
        break;
      }
      if (cfg.trace) log(`  ${id} ${key} goal=${st.goal} mode=${st.mode} sus=${st.sus}`);
      if (key !== lastKey) {
        lastKey = key;
        sameSince = Date.now();
      } else if (Date.now() - sameSince > 45000) {
        stop = `travou (${key})`;
        await shot(page, shots, 'travou');
        break;
      }
      if (st.screen === 'boot') {
        await domClick(page, '#ui .screen.boot');
        await sleep(1200);
      } else if (st.screen === 'menu') {
        if (started) {
          stop = 'voltou ao menu';
          break;
        }
        started = true;
        await domClick(page, '#m-play');
        await sleep(1200);
      } else if (st.screen === 'shop') await page.evaluate(() => window.PT.shop());
      else if (st.screen === 'report') {
        page._pt.snap = await evalT(page, () => window.PT.data, undefined, 15000).catch(() => page._pt.snap);
        if (st.results >= maxDays) {
          stop = 'limite de dias';
          break;
        }
        await sleep(accel ? 150 : 2500);
        await domClick(page, '#b-next');
        await sleep(500);
      } else if (st.screen === 'final') {
        stop = 'fim da run';
        await shot(page, shots, 'final');
        // o caminho de "tentar de novo" tem que devolver o jogo
        await domClick(page, '#b-again');
        await sleep(2500);
        const after = await page.evaluate(() => window.PT.state()).catch(() => null);
        retry = { ok: !!after && after.running && after.day === 0, state: after && { screen: after.screen, day: after.day, phase: after.phase, running: after.running } };
        break;
      } else if (st.screen === 'notice') await domClick(page, '#n-ok');
      else if (st.screen === 'pause') {
        // o caótico apertou P: volta ao trabalho
        await sleep(300);
        await domClick(page, '#b-res');
      } else if (st.running && !st.paused) {
        // demitido, o resto do dia é só esperar: passos maiores (20 quadros/s em vez de 30)
        if (accel) st = await evalT(page, (fps) => window.PT.advance(3, fps), st.fired ? 20 : 30);
        else {
          if (Date.now() > nextShot && st.phase === 'play') {
            nextShot = Date.now() + 20000;
            await shot(page, shots, `d${st.day}-t${String(Math.round(st.time)).padStart(3, '0')}-${st.mode}-${st.goal}`);
          }
          await sleep(1000);
        }
      } else await sleep(200);
    }
  } catch (e) {
    // a 1ª linha diz o erro; as seguintes trazem a pilha do jogo (legível com --server dev)
    stop = e.hang ? `${e.message}${e.hang.length ? ` em ${e.hang.slice(0, 3).join(' < ')}` : ''}` : `erro do orquestrador: ${e.message.split('\n').slice(0, 5).join(' | ')}`;
    if (e.hang) hangStack = e.hang;
  }
  const res = await collect(page, { id, kind: accel ? 'solo' : 'real', profile, stop, retry, hang: hangStack, realSec: Math.round((Date.now() - t0) / 1000) });
  await within(ctx.close(), 20000);
  save(res);
  const days = res.data?.days?.length ?? 0;
  log(`✔ ${id}: ${days} dia(s), ${stop}, ${res.realSec}s, ${res.data?.bugs?.length ?? 0} achado(s), ${res.pageErrors.length} erro(s) de página`);
  return res;
}

// ------------------------------------------------------------------ run multiplayer
const NAMES = ['Ana', 'Beto', 'Caio', 'Dani', 'Edu', 'Fê'];
const VARIANTS = ['voce', 'bia', 'caio'];
async function mpRun(url, job) {
  const id = `mp${job.n}-${job.idx}`;
  const browser = await launch();
  try {
    return await mpPlay(browser, url, job, id);
  } finally {
    await closeBrowser(browser);
  }
}
async function mpPlay(browser, url, job, id) {
  const { n, idx, days, last } = job;
  const room = `PT${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  // a sala local usa BroadcastChannel: todas as janelas no mesmo contexto
  const ctx = await newContext(browser, cfg.video);
  const profs = ['equilibrado', 'arriscado', 'cauteloso', 'caotico', 'equilibrado', 'arriscado'];
  const pages = [];
  for (let i = 0; i < n; i++) {
    const q = `&mp=${i ? 'join' : 'host'}&room=${room}&name=${NAMES[i]}&variant=${VARIANTS[i % VARIANTS.length]}`;
    pages.push(await openGame(ctx, url, q, { profile: profs[(i + idx) % profs.length], accel: false, mp: true, seed: job.seed + i }, `${id}-${NAMES[i]}`));
  }
  const t0 = Date.now();
  const net = { joinedAll: false, joinSec: null, sync: [], timeGap: [], posGap: [], bossGap: [], eventsMismatch: 0, dayMismatch: 0, firedMismatch: [], dropTest: null, hostLeftTest: null, reports: [] };
  let stop = 'limite de dias';
  let alive = [...pages];
  let syncT = 0;
  const shots = path.join(OUT, 'shots', id);
  let nextShot = 0;
  const clicked = new Set();
  try {
    for (let loop = 0; ; loop++) {
      const states = await Promise.all(alive.map((p) => evalT(p, () => window.PT.state(), undefined, 30000).catch((e) => ({ dead: String(e.message).split('\n')[0], hang: e.hang }))));
      if (!net.joinedAll && states.every((s) => s.net?.members === alive.length)) {
        net.joinedAll = true;
        net.joinSec = Math.round((Date.now() - t0) / 1000);
      }
      if (Date.now() - t0 > 60000 && !net.joinedAll) {
        stop = `nem todos entraram na sala (${states.map((s) => s.net?.members).join('/')})`;
        break;
      }
      const host = states[0];
      if (host.dead) {
        stop = `aba do anfitrião morreu: ${host.dead}`;
        break;
      }
      const deadGuest = states.findIndex((s) => s.dead);
      if (deadGuest > 0) {
        stop = `aba de ${NAMES[deadGuest]} morreu: ${states[deadGuest].dead}${states[deadGuest].hang?.length ? ` (${states[deadGuest].hang.slice(0, 3).join(' < ')})` : ''}`;
        break;
      }
      // fim do dia: cada janela clica "próximo dia" quando o relatório aparece
      for (const [i, s] of states.entries()) {
        const k = `${i}:${s.results}`;
        if (s.screen === 'report' && !clicked.has(k) && s.results < days) {
          clicked.add(k);
          net.reports.push({ who: i, day: s.day, at: Math.round((Date.now() - t0) / 1000) });
          setTimeout(() => alive[i] && domClick(alive[i], '#b-next'), 1500 + Math.random() * 2500);
        }
        if (s.screen === 'notice') await domClick(alive[i], '#n-ok');
      }
      if (states.every((s) => s.results >= days && (s.screen === 'report' || s.screen === 'final'))) break;
      // todos demitidos no mesmo dia: a run acaba antes do limite de dias (GDD §0.1)
      if (states.every((s) => s.screen === 'final')) {
        stop = 'fim da run';
        await Promise.all(alive.map((p, i) => shot(p, shots, `${NAMES[i]}-final`)));
        break;
      }
      // teste de queda: no último run de 3+ jogadores, um convidado fecha a aba no meio do 2º dia
      if (last && n >= 3 && !net.dropTest && host.day === Math.min(1, days - 1) && host.phase === 'play' && host.time > 50) {
        const gone = alive.pop();
        const goneIdx = alive.length;
        const before = host.net.members;
        const res = await collect(gone, { id: `${id}-${NAMES[goneIdx]}`, kind: 'mp', profile: profs[(goneIdx + idx) % profs.length], stop: 'caiu de propósito' });
        await gone.close();
        net.dropTest = { at: host.day, before, seenAfter: null, res };
        const tDrop = Date.now();
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          const m = await alive[0].evaluate(() => window.PT.state().net?.members);
          if (m === before - 1) {
            net.dropTest.seenAfter = +((Date.now() - tDrop) / 1000).toFixed(1);
            break;
          }
        }
        log(`  ${id}: convidado caiu; anfitrião percebeu em ${net.dropTest.seenAfter ?? 'NUNCA'} s`);
        continue;
      }
      // sincronia (a cada ~4 s, só com todos jogando)
      if ((syncT -= 1) <= 0 && states.every((s) => s.phase === 'play' && s.running)) {
        syncT = 4;
        await syncCheck(alive, net);
      }
      if (Date.now() > nextShot && host.phase === 'play') {
        nextShot = Date.now() + 30000;
        await Promise.all(alive.map((p, i) => shot(p, shots, `${NAMES[i]}-d${states[i].day}-t${String(Math.round(states[i].time ?? 0)).padStart(3, '0')}`)));
      }
      // v0.9: dia de 5 min + hall, elevador, saída e lojinha ≈ 7-8 min em tempo real
      if (Date.now() - t0 > (days * 480 + 120) * 1000) {
        stop = 'tempo esgotado (a sala não terminou os dias)';
        break;
      }
      await sleep(1000);
    }
  } catch (e) {
    stop = `erro do orquestrador: ${e.message.split('\n')[0]}`;
  }
  // teste de saída do anfitrião (último run de 2 jogadores)
  if (last && n === 2 && alive.length === 2) {
    const guest = alive[1];
    const hostRes = await collect(alive[0], { id: `${id}-${NAMES[0]}`, kind: 'mp', profile: '' });
    await alive[0].close();
    alive = [guest];
    const tq = Date.now();
    let saw = null;
    for (let i = 0; i < 30 && saw === null; i++) {
      await sleep(500);
      const s = await guest.evaluate(() => ({ screen: window.PT.state().screen, text: window.PT.ui.text() }));
      if (s.screen === 'notice') saw = { sec: +((Date.now() - tq) / 1000).toFixed(1), text: s.text.slice(0, 120) };
    }
    net.hostLeftTest = { saw, hostRes };
    log(`  ${id}: anfitrião saiu; convidado ${saw ? `viu o aviso em ${saw.sec} s` : 'NÃO viu aviso'}`);
  }
  const players = [];
  if (net.hostLeftTest?.hostRes) players.push({ ...net.hostLeftTest.hostRes, profile: profs[idx % profs.length] });
  for (const [i, p] of alive.entries()) {
    const k = net.hostLeftTest ? i + 1 : i;
    players.push(await collect(p, { id: `${id}-${NAMES[k]}`, kind: 'mp', profile: profs[(k + idx) % profs.length] }));
  }
  if (net.dropTest?.res) players.push(net.dropTest.res);
  const res = { id, kind: 'mp', n, stop, realSec: Math.round((Date.now() - t0) / 1000), net, players };
  await within(ctx.close(), 20000);
  save(res);
  log(`✔ ${id}: ${stop}, ${res.realSec}s, sync ${net.sync.length} amostras`);
  return res;
}

/** Compara o que cada janela vê: relógio, eventos, posições dos outros jogadores e das chefias. */
async function syncCheck(pages, net) {
  const snaps = await Promise.all(pages.map((p) => p.evaluate(() => window.PT.netSnap()).catch(() => null)));
  if (snaps.some((s) => !s)) return;
  const [h] = snaps;
  const byId = new Map(snaps.map((s) => [s.self, s]));
  const row = { t: h.time, timeGap: 0, posGap: 0, bossGap: 0 };
  for (const s of snaps.slice(1)) {
    row.timeGap = Math.max(row.timeGap, Math.abs(s.time - h.time));
    if (s.day !== h.day) net.dayMismatch++;
    if (s.events !== h.events) net.eventsMismatch++;
    for (const b of h.bosses) {
      const o = s.bosses.find((x) => x.kind === b.kind);
      if (o && b.vis && o.vis) row.bossGap = Math.max(row.bossGap, Math.hypot(b.x - o.x, b.z - o.z));
    }
  }
  // cada um se vê em X; os outros o veem em Y
  for (const s of snaps)
    for (const r of s.remotes) {
      const truth = byId.get(r.id);
      if (!truth) continue;
      row.posGap = Math.max(row.posGap, Math.hypot(truth.me.x - r.x, truth.me.z - r.z));
      if (truth.me.fired !== r.fired) net.firedMismatch.push({ who: r.id, seenBy: s.self, t: s.time });
    }
  net.sync.push(row);
}

// ------------------------------------------------------------------ fila com paralelismo
async function pool(jobs, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (i < jobs.length) {
        const j = jobs[i++];
        try {
          out.push(await fn(j));
        } catch (e) {
          log(`✘ ${JSON.stringify(j)}: ${e.message}`);
          out.push({ id: JSON.stringify(j), failed: String(e.message) });
        }
      }
    }),
  );
  return out;
}

// ------------------------------------------------------------------ principal
function save(res) {
  fs.writeFileSync(path.join(OUT, 'runs', `${res.id}.json`), JSON.stringify(res));
}
async function main() {
  const url = await ensureServer();
  log(`playtest → ${OUT}`);
  log(`jogo em ${url} · perfis ${cfg.profiles.join(', ')}`);
  const all = [];
  if (cfg.solo) {
    const jobs = [];
    for (let k = 0; k < cfg.soloRuns; k++) for (const [pi, profile] of cfg.profiles.entries()) jobs.push({ profile, idx: k, accel: true, maxDays: cfg.maxDays, seed: cfg.seed + k * 10 + pi });
    log(`solo acelerado: ${jobs.length} runs (até ${cfg.maxDays} dias), ${cfg.parallel} em paralelo`);
    all.push(...(await pool(jobs, cfg.parallel, (j) => soloRun(url, j))));
  }
  const live = [];
  if (cfg.real) for (let k = 0; k < cfg.realRuns; k++) live.push({ type: 'real', profile: k % 2 ? 'cauteloso' : 'equilibrado', idx: k, accel: false, maxDays: cfg.realDays, seed: cfg.seed + 500 + k });
  if (cfg.mp) {
    for (const n of cfg.mpPlayers) for (let k = 0; k < cfg.mpRuns; k++) live.push({ type: 'mp', n, idx: k, days: cfg.mpDays, last: k === cfg.mpRuns - 1, seed: cfg.seed + 700 + n * 10 + k });
  }
  if (live.length) {
    log(`tempo real: ${live.length} sessões (${cfg.mpParallel} por vez)`);
    all.push(...(await pool(live, cfg.mpParallel, (j) => (j.type === 'real' ? soloRun(url, j) : mpRun(url, j)))));
  }
  const summary = analyze(all, cfg);
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  fs.writeFileSync(path.join(OUT, 'report.md'), renderReport(summary, cfg));
  log(`relatório: ${path.join(OUT, 'report.md')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([...browsers].map(closeBrowser));
    server?.kill();
  });

// ------------------------------------------------------------------ utilidades
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    o[k] = v;
  }
  return o;
}
function list(v) {
  return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}
function num(v) {
  return v === undefined || v === true ? undefined : Number(v);
}
function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function ok(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
function die(m) {
  console.error(m);
  process.exit(1);
}
