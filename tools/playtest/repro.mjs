#!/usr/bin/env node
// Reproduções isoladas dos bugs achados pelo playtest. Cada uma monta a situação direto no jogo (?debug)
// e responde "presente" (o bug ainda acontece) ou "corrigido". Uso: npm run playtest:repro [-- nome1,nome2]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PORT = 5182;

// Cada caso roda dentro da página. `present` = true quando o bug aparece.
const CASES = {
  // (antes "Dia 1: o X9 fica no elevador"; desde 29/10 o dia 1 é do chefe e o X9 vem no evento sorteado "Ronda do X9")
  'x9-parado-dia1': {
    title: 'Dia de X9 (evento "Ronda do X9"): o X9 fica parado no elevador e ninguém ronda',
    run: () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      let tries = 0;
      do {
        window.quickstart(2);
        tries++;
      } while (!g.dayEvents.includes('ronda') && tries < 60);
      if (!g.dayEvents.includes('ronda')) return { present: true, evidence: `"Ronda do X9" não saiu em ${tries} sorteios do dia 3` };
      const day1 = (() => {
        window.quickstart(0);
        return `dia 1: chefia ${g.bosses[0].kind}, eventos ${g.dayEvents.join('+')}`;
      })();
      tries = 0;
      do {
        window.quickstart(2);
        tries++;
      } while (!g.dayEvents.includes('ronda') && tries < 60);
      window.skipElevator();
      const states = new Set();
      let doors = 0;
      const onDoor = g.onDoor.bind(g);
      g.onDoor = (b) => {
        doors++;
        return onDoor(b);
      };
      for (let i = 0; i < 150 * 30; i++) {
        g.update(1 / 30);
        g.input.endFrame();
        states.add(g.x9.state);
      }
      g.onDoor = onDoor;
      const stuck = doors === 0 && [...states].every((s) => s === 'wait');
      return { present: stuck || g.bosses[0] !== g.x9, evidence: `${day1}; dia 3 com ${g.dayEvents.join('+')}: chefia ${g.bosses[0].kind}, estados do X9 em 150 s: ${[...states].join(', ')}; portas: ${doors}` };
    },
  },
  'cafe-do-chefe-inalcancavel': {
    title: 'Tarefa "café do chefe": o E na máquina pega café comum; "Fazer o café do chefe" nunca é escolhido',
    run: () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      window.quickstart(2);
      window.skipElevator();
      const td = g.tasks;
      td.kinds = ['cafe'];
      td.slots = [{ kind: 'cafe', state: 'wait', t: 0 }];
      window.step(0.2);
      // v0.7+: o telefone só toca sozinho durante uma diversão; aqui ele toca na marra
      td['startRing'](td.slots[0]);
      td.answer();
      if (!td.active.some((t) => t.kind === 'cafe')) throw new Error('instrumento: a tarefa do café não ficou ativa');
      const P = g.office.P;
      const s = P.coffee.clone().setZ(P.coffee.z - 1.2);
      g.player.ball.setPos(s.x, s.z);
      g.pc.camYaw = Math.atan2(-(P.coffee.x - s.x), -(P.coffee.z - s.z));
      g.pc.camPitch = 0.3;
      window.step(0.3);
      const prompt = (document.querySelector('#ui .prompt')?.innerText ?? '').split('\n')[0];
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      window.step(1.6);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
      window.step(0.1);
      return { present: !td.picker && !(g.pc.carrying === 'coffee' && g.pc.bossCoffee), evidence: `aviso na tela: "${prompt}"; painel do café do chefe aberto: ${!!td.picker}; na mão: ${g.pc.carrying ?? 'nada'} (do chefe: ${g.pc.bossCoffee})` };
    },
  },
  'painel-cafe-preso-na-noite': {
    title: 'Painel do café do chefe aberto no fim do dia vai junto para o hall e prende o jogador (achado 30/10, run travada)',
    run: async () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      window.quickstart(2);
      window.skipElevator();
      const td = g.tasks;
      td.kinds = ['cafe'];
      td.slots = [{ kind: 'cafe', state: 'wait', t: 0 }];
      window.step(0.2);
      td['startRing'](td.slots[0]);
      td.answer();
      td['openPicker']();
      if (!td.picker) throw new Error('instrumento: o painel do café não abriu');
      g.time = g.duration - 0.2;
      window.step(1);
      // às 18h o jogador precisa andar até o elevador: o painel não pode ficar aberto prendendo o movimento
      const stuckLeaving = g.phase === 'leaving' && (!!td.picker || g.pc.lockMove);
      window.skipElevator();
      window.step(1);
      const panel = document.querySelector('#ui .picker.on, #ui .picker:not(:empty)');
      const stuckEvening = g.phase === 'evening' && (!!td.picker || g.pc.lockMove);
      return { present: stuckLeaving || stuckEvening || (g.phase !== 'evening'), evidence: `fase ${g.phase}; preso na saída: ${stuckLeaving}; painel aberto: ${!!td.picker}; movimento travado: ${g.pc.lockMove}; painel na tela: ${!!panel}` };
    },
  },
  'reuniao-perfeita-sobe-suspeita': {
    title: 'Tarefa "reunião relâmpago" feita sem erro termina com mais Suspeita do que começou',
    run: () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      window.quickstart(2);
      window.skipElevator();
      const td = g.tasks;
      td.kinds = ['reuniao'];
      td.slots = [{ kind: 'reuniao', state: 'wait', t: 0 }];
      window.step(0.2);
      td['startRing'](td.slots[0]);
      td.answer();
      if (!td.active.some((t) => t.kind === 'reuniao')) throw new Error('instrumento: a tarefa da reunião não ficou ativa');
      // o tempo de ir até a mesa de reunião (~4 s) também conta na rampa
      window.step(4);
      const sus0 = g.player.sus;
      td.joinMeeting();
      // v0.8: sem ritmo — o chefe olha (👀, `idle` > 0) e é só assentir (F) dentro da folga
      let presses = 0;
      const log0 = { ...g.susLog };
      for (let i = 0; i < 30 * 40 && td.meeting; i++) {
        const m = td.meeting;
        const nod = m.idle > 0 && m.idle < 1.2;
        if (nod) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
          presses++;
        }
        g.update(1 / 30);
        g.input.endFrame();
        if (nod) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
      }
      const delta = g.player.sus - sus0;
      const gained = Object.entries(g.susLog).map(([k, v]) => [k, v - (log0[k] ?? 0)]).filter(([, v]) => v > 0.05).map(([k, v]) => `${k} +${v.toFixed(1)}`).join(', ') || 'nada';
      // na v0.8 nada sobe sozinho com o tempo: reunião sem cochilo não pode deixar Suspeita
      return { present: delta > 0.05, evidence: `dia 3, ${presses} acenos quando ele olhou; Suspeita ${sus0.toFixed(1)} → ${g.player.sus.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}, já com o alívio da entrega); subidas: ${gained}` };
    },
  },
  'fantasma-enter-trava': {
    title: 'Demitido + ENTER (acelerar ×6): as molas dos rostos explodem e a Telinha trava a aba',
    run: () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      window.quickstart(1);
      window.skipElevator();
      g.fire(g.player, g.chefe, 'teste');
      window.step(3.5, 60);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
      window.step(0.05, 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter' }));
      const faces = () => g.workers.flatMap((w) => w.ball.ch?.faces ?? []);
      let max = 0;
      // 6 s de jogo a 60 fps, como um jogador de verdade
      for (let i = 0; i < 6 * 60; i++) {
        g.update(1 / 60);
        g.input.endFrame();
        for (const f of faces()) max = Math.max(max, Math.abs(f.cur.size));
      }
      return { present: !(max < 5), evidence: `acelerado: ${g.pc.fastForward}; ${faces().length} rostos; maior "tamanho do olho" em 6 s a 60 fps: ${max.toPrecision(3)} (normal ≈ 1)` };
    },
  },
  'esbarrao-ao-levantar': {
    title: 'Levantar da cadeira com o chefe conferindo a tela por trás dá esbarrão automático (+8 × curva)',
    run: () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      window.quickstart(2);
      window.skipElevator();
      g.pc.setMode('seated');
      window.step(1);
      const b = g.chefe;
      b.startRonda([{ kind: 'desk', w: g.player, mode: 'check' }], 'teste');
      for (let i = 0; i < 30 * 40 && b.state !== 'check'; i++) window.step(1 / 30);
      const sus0 = g.player.sus;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      window.step(0.1);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
      window.step(0.6);
      const d = g.player.sus - sus0;
      return { present: d >= 7, evidence: `chefe em "${b.state}" a ${b.pos.distanceTo(g.player.desk.seat).toFixed(2)} m da cadeira; Suspeita +${d.toFixed(1)} ao apertar E` };
    },
  },
  'perseguido-com-maos-ocupadas': {
    title: 'Perseguido carregando algo: não dá para sentar nem se esconder, e não há tecla para largar',
    run: () => {
      const g = window.game;
      window.PT.init({ profile: 'equilibrado', accel: true, passive: true });
      window.quickstart(2);
      window.skipElevator();
      g.pc.setMode('walk');
      g.pc.carry('report');
      const d = g.player.desk;
      g.player.ball.setPos(d.standPos.x, d.standPos.z);
      const c = d.click[0].getWorldPosition(d.standPos.clone());
      g.pc.camYaw = Math.atan2(-(c.x - d.standPos.x), -(c.z - d.standPos.z));
      g.pc.camPitch = 0.4;
      window.step(0.3);
      const prompt = (document.querySelector('#ui .prompt')?.innerText ?? '').split('\n')[0];
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      window.step(0.1);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
      window.step(0.3);
      return { present: g.pc.mode !== 'seated', evidence: `com um relatório na mão, na frente do PC: aviso "${prompt}", modo depois do E: ${g.pc.mode}` };
    },
  },
};

const only = process.argv[2]?.split(',');
const url = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
  let present = 0;
  for (const [name, c] of Object.entries(CASES)) {
    if (only && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.goto(`${url}?debug`);
    await page.waitForFunction(() => window.game && window.step, null, { timeout: 30000 });
    await page.addScriptTag({ path: path.join(HERE, 'bot.js') });
    let r;
    try {
      r = await Promise.race([page.evaluate(`(${c.run})()`), new Promise((_, rej) => setTimeout(() => rej(new Error('travou (>60 s)')), 60000))]);
    } catch (e) {
      r = { present: true, evidence: `erro: ${e.message.split('\n')[0]}` };
    }
    if (r.present) present++;
    console.log(`${r.present ? '✘ PRESENTE ' : '✔ corrigido'}  ${name} — ${c.title}\n             ${r.evidence}`);
    await page.close();
  }
  console.log(`\n${present} bug(s) presente(s).`);
  process.exitCode = present ? 1 : 0;
} finally {
  await browser?.close();
  server.kill();
}
