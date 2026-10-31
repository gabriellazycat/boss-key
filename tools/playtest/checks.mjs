#!/usr/bin/env node
// Verificações estáticas do mundo, sem robô jogando (≈ 1 min):
//   alcance  — de algum ponto livre e ligado ao início, cada objeto com E fica ao alcance (inclui os pombos e o hall)
//   E        — parado no melhor ponto e olhando para o objeto, o E escolhe ele (e não um vizinho)
//   visão    — de cada cadeira, olhando o monitor, a porta do chefe aparece sem nada na frente (raycast de verdade)
//   dias     — o mesmo para os dias 1–6 com sementes diferentes (diversões, eventos e tarefas mudam o que existe)
//
//   npm run checks                 (sobe o servidor de desenvolvimento sozinho na porta 5182)
//   npm run checks -- --url http://localhost:5181/
//
// Sai com código 1 se alguma verificação falhar.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const DAYS = Number(arg('days', 6));
const SEEDS = Number(arg('seeds', 3));

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

/** Roda dentro da página. `seed` fixa o Math.random para o sorteio do dia ser reproduzível. */
async function inPage({ day, seed }) {
  let s = seed >>> 0;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = window.game;
  const o = g.office;
  const V = g.player.ball.pos.constructor;
  const fails = [];
  const warns = [];
  const fail = (kind, msg, extra) => fails.push({ kind, msg, ...extra });

  window.fakeLock();
  window.quickstart(day);
  window.skipElevator();
  window.step(0.5);

  // ---- visão das mesas primeiro, antes de o jogador andar pelo mapa (o layout não muda por dia)
  let vision = null;
  if (day === 0) {
    vision = window.visionTest(16 / 9);
    for (const row of vision)
      for (const [k, val] of Object.entries(row))
        if (k !== 'mesa' && val !== 'ok') {
          // a porta é o aviso que importa; o caminho logo depois dela, se o próprio monitor tapar, é só um aviso
          if (k.startsWith('caminho')) warns.push(`visão: mesa ${row.mesa}: ${k} → ${val}`);
          else fail('visão', `mesa ${row.mesa}: ${k} → ${val}`);
        }
  }
  const ball = g.player.ball;
  const start = ball.pos.clone();
  const free = (p) => {
    const q = p.clone();
    o.collide(q, 0.36);
    return Math.hypot(q.x - p.x, q.z - p.z) < 0.02;
  };
  const MOVE = (p) => {
    ball.setPos(p.x, p.z);
    g.pc.camPos.set(p.x, 1.5, p.z);
  };

  /** Varre uma área: para cada ponto livre (e ligado ao início pela navegação), lista o que o E alcança dali. */
  function sweep(x0, x1, z0, z1, connected) {
    const seen = new Map(); // id → { label, best: {p, d} }
    for (let x = x0; x <= x1; x += 0.5)
      for (let z = z0; z <= z1; z += 0.5) {
        const p = new V(x, 0, z);
        if (!free(p) || !connected(p)) continue;
        MOVE(p);
        let list = [];
        try {
          list = g.pc.interactables();
        } catch (e) {
          fail('erro', `interactables() lançou: ${e.message}`);
          return seen;
        }
        for (const it of list) {
          const d = Math.hypot(it.pos.x - x, it.pos.z - z);
          if (d > it.r) continue;
          const cur = seen.get(it.id);
          const obj = it.obj?.[0] ? it.obj[0].getWorldPosition(new V()) : it.pos.clone();
          if (!cur || d < cur.d) seen.set(it.id, { label: String(it.label).replace(/<[^>]+>/g, ''), p: p.clone(), d, pos: it.pos.clone(), obj, r: it.r });
        }
      }
    return seen;
  }

  // ---- escritório: liga ao início pela grade da navegação
  // dentro das paredes do escritório (fora delas não há colisor e tudo pareceria "livre")
  const inside = (p) => Math.abs(p.x) < 9.9 && Math.abs(p.z) < 11.9;
  const conn = (p) => {
    if (!inside(p)) return false;
    const path = g.nav.find(start, p);
    const end = path?.[path.length - 1];
    return !!end && Math.hypot(end.x - p.x, end.z - p.z) < 0.6;
  };
  const office = sweep(-9.75, 9.75, -11.75, 11.75, conn);

  // ---- pombos: cada um precisa de um ponto livre e ligado a menos de 2,2 m (o alcance do "bater no vidro")
  const pigeons = o.outside.pigeons.map((pg, i) => {
    const w = pg.g.getWorldPosition(new V());
    let best = Infinity;
    for (let x = w.x - 2.5; x <= w.x + 2.5; x += 0.25)
      for (let z = w.z - 2.5; z <= w.z + 2.5; z += 0.25) {
        const p = new V(x, 0, z);
        const d = Math.hypot(x - w.x, z - w.z);
        if (d < best && free(p) && conn(p)) best = d;
      }
    if (!(best < 2.1)) fail('alcance', `pombo #${i} em (${(w.x + 10).toFixed(1)}, ${(w.z + 12).toFixed(1)}) fora de alcance: o ponto livre mais perto fica a ${best === Infinity ? '∞' : best.toFixed(2)} m (alcance 2,2)`);
    return +best.toFixed(2);
  });

  // ---- diversões do dia: cada uma precisa de um objeto alcançável (as que se fazem sentado ou arremessando ficam de fora)
  // (fofoca depende de um colega parado perto: fica para os robôs)
  const needs = { soneca: ['sofa'], cadeira: ['chair'], maquina: ['vend'] };
  for (const f of g.funTasks) {
    const pre = needs[f.id];
    if (!pre?.length) continue;
    if (![...office.keys()].some((id) => pre.some((p) => id.startsWith(p)))) fail('alcance', `diversão do dia "${f.id}" sem objeto alcançável (${pre.join('/')})`);
  }

  // ---- E: no melhor ponto, olhando o objeto, o E escolhe ele
  const eWrong = [];
  const promptEl = () => document.querySelector('.hud .prompt.on');
  for (const [id, v] of office) {
    // dependem de alguém parado ali (o papo segue o chefe andando)
    if (id === 'elevBtn' || id.startsWith('gossip') || id === 'visita' || id.startsWith('papo-')) continue;
    // dentro da sala do chefe o teste do E pode ser demitido (sensor, chefe voltando): o alcance já foi conferido
    if (g.office.inBossRoom(v.p)) continue;
    if (g.player.fired) break;
    MOVE(v.p);
    g.pc.camYaw = Math.atan2(-(v.obj.x - v.p.x), -(v.obj.z - v.p.z));
    g.pc.camPitch = 0.25;
    window.step(0.2);
    // o jogador pode ter sido empurrado por um colega: só conta se ficou no ponto
    if (Math.hypot(ball.pos.x - v.p.x, ball.pos.z - v.p.z) > 0.3) continue;
    // v0.10: o aviso não mostra "(segure)" (segurar E acabou) e marca os minigames com 🎮
    const norm = (s) => s.replace(/ \(segure\)/g, '').replace(/ 🎮/g, '').trim();
    const txt = norm(promptEl()?.textContent ?? '');
    const want = norm(v.label);
    if (want && !txt.includes(want.slice(0, 14))) eWrong.push({ id, want: want.slice(0, 40), got: txt.slice(0, 40) || '(nenhum aviso)', at: `${(v.p.x + 10).toFixed(1)},${(v.p.z + 12).toFixed(1)}` });
  }
  for (const e of eWrong) fail('E', `no ponto de "${e.id}" (${e.at}) o E mostra "${e.got}" em vez de "${e.want}"`);

  // ---- noite no hall: as vendinhas e a porta da rua ao alcance
  MOVE(start);
  g.time = g.duration - 0.5;
  window.step(3);
  // às 18h o jogador anda até o elevador e desce junto com o time (aqui: pula a caminhada)
  if (g.phase !== 'leaving') fail('fluxo', `o fim do dia não abriu a saída pelo elevador (fase ${g.phase})`);
  window.skipElevator();
  window.step(1);
  let lobby = null;
  if (g.phase === 'evening') {
    window.step(2.5);
    const lstart = ball.pos.clone();
    const lobbyConn = (p) => o.inLobby(p);
    const all = sweep(-15, 17, lstart.z - 6, lstart.z + 22, lobbyConn);
    lobby = [...all.keys()];
    const shops = lobby.filter((id) => /^buy/.test(id));
    if (!shops.length) fail('alcance', `noite: nenhuma vendinha ao alcance no hall (achei: ${lobby.join(', ') || 'nada'})`);
    if (!lobby.some((id) => /^home$/.test(id))) fail('alcance', `noite: porta da rua fora de alcance (achei: ${lobby.join(', ')})`);
  } else fail('fluxo', `o dia não foi para a noite (fase ${g.phase})`);

  return {
    day,
    seed,
    fun: g.funTasks.map((f) => f.id),
    events: g.dayEvents ?? null,
    ids: [...office.keys()].sort(),
    lobby,
    pigeons,
    vision: vision ? vision.length : null,
    fails,
    warns,
  };
}

const url = await ensureServer();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
let failed = 0;
try {
  const runs = [];
  for (let seed = 1; seed <= SEEDS; seed++)
    for (let day = 0; day < DAYS; day++) {
      if (seed > 1 && day === 0) continue;
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`${url}?debug`);
      await page.waitForFunction(() => window.game && window.step && window.quickstart, null, { timeout: 60000 });
      const r = await page.evaluate(inPage, { day, seed: seed * 7919 + day });
      for (const e of errs) r.fails.push({ kind: 'erro', msg: `erro na página: ${e}` });
      runs.push(r);
      await page.close();
      const mark = r.fails.length ? `✗ ${r.fails.length}` : '✓';
      console.log(`${mark} dia ${day + 1} semente ${seed} · diversões ${r.fun.join(',')} · ${r.ids.length} objetos no escritório · hall: ${r.lobby?.length ?? 0} · pombos ${r.pigeons.join(' ')} m`);
      for (const f of r.fails) console.log(`    [${f.kind}] ${f.msg}`);
      for (const w of r.warns ?? []) console.log(`    (aviso) ${w}`);
    }
  // falhas iguais em várias rodadas contam uma vez
  const uniq = new Map();
  for (const r of runs) for (const f of r.fails) uniq.set(`${f.kind}|${f.msg}`, f);
  failed = uniq.size;
  const out = path.join(HERE, 'out', 'checks.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(runs, null, 1));
  console.log(failed ? `\n${failed} problema(s) diferente(s). Detalhes: ${path.relative(ROOT, out)}` : `\nTudo certo (${runs.length} rodadas). Detalhes: ${path.relative(ROOT, out)}`);
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
