#!/usr/bin/env node
// Tour visual: fotografa os momentos principais do jogo num Chrome de verdade (com GPU) e confere que a tela não está
// em branco nem com erro. Serve para revisar o visual depois de mudanças e para comparar antes/depois.
//
//   npm run tour                         (sobe o servidor de desenvolvimento na porta 5182)
//   npm run tour -- --url http://localhost:5181/ --out antes
//
// Saída: tools/playtest/out/tour/<pasta>/NN-nome.png + tour.json (métricas de cada print).
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
const OUT = path.join(HERE, 'out', 'tour', arg('out', 'atual'));
fs.mkdirSync(OUT, { recursive: true });
const W = Number(arg('w', 1280));
const H = Number(arg('h', 720));

let server = null;
const up = async (u) => {
  try {
    return (await fetch(u)).ok;
  } catch {
    return false;
  }
};
async function ensureServer() {
  if (arg('url')) return arg('url');
  const url = 'http://localhost:5182/';
  if (await up(url)) return url;
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5182', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await up(url)) return url;
  }
  throw new Error('o servidor não subiu');
}

// Cada parada: o que fazer na página antes do print. Coordenadas da planta (como `tp`/`cam` do ?debug).
const STOPS = [
  ['menu', async (p) => { await p.waitForTimeout(1500); }],
  ['elevador', (p) => p.evaluate(() => { fakeLock(); quickstart(0); step(3); })],
  ['mesa-sentado', (p) => p.evaluate(() => { skipElevator(); step(1); const d = game.player.desk; game.pc.setMode('seated'); step(1.5); })],
  ['mesa-jogando', (p) => p.evaluate(() => { game.computer.open?.('tiro'); step(1.5); })],
  ['salao-em-pe', (p) => p.evaluate(() => { game.pc.setMode('walk'); tp(10, 16, 180, 0.15); step(1); })],
  ['chefe-saindo', (p) => p.evaluate(() => { const m = game.bosses[0]; m.startRonda([{ kind: 'desk', w: game.player, mode: 'check' }], 'tour'); step(5); tp(4, 14, 20, 0.1); step(0.5); })],
  ['copa', (p) => p.evaluate(() => { tp(6, 19, 180, 0.2); step(1); })],
  ['sala-descompressao', (p) => p.evaluate(() => { tp(14, 16, 160, 0.15); step(1); })],
  ['visao-geral', (p) => p.evaluate(() => { cam(10, 2.9, 5.6, 10, 0.9, 16); })],
  ['banheiro', (p) => p.evaluate(() => { window.frozen = false; const b = game.office.baths[0]; tp(b.out.x + 10, b.out.z + 12 - 0.3, 0, 0.1); step(1); })],
  ['noite-hall', async (p) => { await p.evaluate(() => { game.time = game.duration - 0.5; step(3); }); await p.waitForTimeout(2200); await p.evaluate(() => step(3)); }],
  ['vendinha', (p) => p.evaluate(() => { const it = game.pc.interactables().find((i) => i.id === 'buy0'); if (it) { tp(it.pos.x + 10 + 1.2, it.pos.z + 12, 90, 0.1); step(1); } })],
  ['demitido', (p) => p.evaluate(() => { quickstart(2); skipElevator(); step(1); game.fire(game.player, game.bosses[0], 'Suspeita no máximo (flagrante)'); step(2.5); })],
];

const url = await ensureServer();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const report = [];
let bad = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(`${url}?debug`);
  await page.waitForFunction(() => window.game && window.step, null, { timeout: 60000 });
  let n = 0;
  for (const [name, act] of STOPS) {
    n++;
    const before = errs.length;
    try {
      await act(page);
    } catch (e) {
      errs.push(`${name}: ${e.message.split('\n')[0]}`);
    }
    await page.evaluate(() => window.renderer?.render(performance.now() / 1000));
    const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    // métricas do print: brilho médio e variedade (tela preta/branca/lisa = suspeita)
    const m = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data;
      let sum = 0;
      let sq = 0;
      const buckets = new Set();
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        sum += l;
        sq += l * l;
        buckets.add((d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5));
      }
      const k = d.length / 4;
      const mean = sum / k;
      return { mean: Math.round(mean), sd: Math.round(Math.sqrt(sq / k - mean * mean)), colors: buckets.size };
    }, `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`);
    const text = await page.evaluate(() => [...document.querySelectorAll('.hud .on, .popup.on, .screen')].map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)).filter(Boolean).slice(0, 6));
    const flat = m.sd < 6 || m.colors < 6;
    const newErrs = errs.slice(before);
    if (flat || newErrs.length) bad++;
    report.push({ n, name, file: path.relative(ROOT, file), ...m, flat, errors: newErrs, text });
    console.log(`${flat || newErrs.length ? '✗' : '✓'} ${String(n).padStart(2, '0')} ${name.padEnd(20)} brilho ${String(m.mean).padStart(3)} contraste ${String(m.sd).padStart(3)} cores ${String(m.colors).padStart(3)}${newErrs.length ? ` · ERROS: ${newErrs.join(' | ').slice(0, 160)}` : ''}`);
  }
  fs.writeFileSync(path.join(OUT, 'tour.json'), JSON.stringify(report, null, 1));
  console.log(`\n${bad ? `${bad} print(s) com problema` : 'todos os prints ok'} · ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
  server?.kill();
}
process.exit(bad ? 1 : 0);
