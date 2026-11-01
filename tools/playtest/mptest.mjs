#!/usr/bin/env node
// Roda a checagem do multiplayer local (mp-test.html: uma janela por jogador na mesma aba) sem abrir nada na tela.
//
//   npm run mptest                   (3 jogadores; sobe o servidor de desenvolvimento na porta 5182)
//   npm run mptest -- --n 2 --url http://localhost:5181/
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const up = async (u) => {
  try {
    return (await fetch(u)).ok;
  } catch {
    return false;
  }
};
let server = null;
let url = arg('url');
if (!url) {
  url = 'http://localhost:5182/';
  if (!(await up(url))) {
    server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5182', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 80 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
let ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));
  await page.goto(`${url}mp-test.html?n=${arg('n', 3)}&auto`);
  await page.waitForFunction(() => window.mpResult, null, { timeout: Number(arg('timeout', 240)) * 1000 });
  const r = await page.evaluate(() => window.mpResult);
  for (const x of r.results) console.log(`${x.ok ? '✔' : '✘'} ${x.label}`);
  const bad = r.results.filter((x) => !x.ok).length;
  console.log(`\n${r.results.length - bad}/${r.results.length} ok`);
  if (bad) console.log((await page.locator('#log').innerText()).split('\n').filter((l) => l.startsWith('✘')).join('\n'));
  ok = r.ok;
} finally {
  await browser.close();
  server?.kill();
}
process.exit(ok ? 0 : 1);
