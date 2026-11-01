#!/usr/bin/env node
// Robô mp-soak: 1 anfitrião + convidados jogam dias inteiros na mesma aba (mp-soak.html) e um juiz confere a sincronia.
// Um Chrome por semente. Saída: tools/playtest/out/mpsoak-<data-hora>/ (report.md, s<semente>/result.json, capturas).
//
//   npm run mpsoak                              (3 jogadores, 3 dias, semente 1)
//   npm run mpsoak -- --seeds 1,2,3 --days 3 --n 3
//   npm run mpsoak -- --noprov                  (sem as provocações do diretor)
//   npm run mpsoak -- --headed --seeds 7        (abre o Chrome na tela)
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
const flag = (k) => args.includes(`--${k}`);
const seeds = String(arg('seeds', arg('seed', '1'))).split(',').map(Number);
const days = Number(arg('days', 3));
const n = Number(arg('n', 3));
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');
const OUT = path.join(HERE, 'out', arg('out', `mpsoak-${stamp}`));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

// bugs relatados pelo usuário (docs/HANDOFF_MULTIPLAYER.md §1) → regras do juiz que os pegam
const BUGS = [
  [1, 'chefe não apareceu às 11h (supervisão)', ['supervisao-perdida', 'sua-mesa', 'agenda-nao-cumprida']],
  [2, 'chefe sumiu e não voltou', ['chefe-sumido', 'chefe-igual']],
  [3, 'ver a tela dos outros', ['tela-remota']],
  [4, 'demitido desatolando a impressora', ['passeando-com-alibi']],
  [5, 'elevador: um não vê o outro, porta só para um', ['cabine-com-todos', 'porta-igual', 'fase-sincronizada']],
  [6, 'dia 2: elevador sem os outros', ['contagem-com-todos']],
  [7, 'um troca de dia sem os outros', ['dia-sincronizado']],
  [8, '"E para pegar" e não pega', ['pegada-recusada']],
  [9, 'HUD poluída (M2, chefe fora, multiplicadores)', ['hud-arremesso', 'aviso-chefe', 'hud-multiplicador']],
  [10, 'animação dos outros fora de sincronia', ['pose-remota', 'fala-do-elevador', 'remoto-no-lugar']],
  ['+', 'achados novos do robô', ['meta-igual', 'eventos-iguais', 'suspeita-fora-do-expediente', 'agenda-nao-cumprida', 'travou', 'erro-na-pagina']],
];

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
  // --root <pasta>: serve uma cópia congelada do jogo (ex.: o "antes" das correções) enquanto o código de verdade muda
  const port = arg('port', arg('root') ? '5184' : '5183');
  url = `http://localhost:${port}/`;
  if (!(await up(url))) {
    let errOut = '';
    server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), ...(arg('root') ? [path.resolve(arg('root'))] : []), '--port', port, '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    server.stderr.on('data', (d) => (errOut += d));
    for (let i = 0; i < 80 && !(await up(url)) && server.exitCode === null; i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await up(url))) {
      console.error(`o servidor do Vite não subiu em ${url}${errOut ? `:\n${errOut.trim().split('\n').slice(0, 6).join('\n')}` : ''}`);
      server.kill();
      process.exit(2);
    }
  }
}

async function soak(seed) {
  const dir = path.join(OUT, `s${seed}`);
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  // um Chrome por run: abas jogando sem parar no mesmo Chrome travavam as seguintes (docs/PLAYTEST.md)
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !flag('headed'),
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    // aleatório com semente em cada janela (a semente vem na URL de cada uma)
    await page.addInitScript(() => {
      const s = new URLSearchParams(location.search).get('seed');
      if (!s) return;
      let a = Number(s) >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errs.push(m.text().slice(0, 300)));
    // recurso que falta: anota QUAL (o console só diz "Failed to load resource")
    page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errs.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`));
    await page.exposeFunction('soakShot', async (name, idxs) => {
      for (const i of idxs) {
        const file = path.join(dir, 'shots', `${name}-j${i}.jpg`);
        await page.locator(`iframe[data-win="${i}"]`).screenshot({ path: file, type: 'jpeg', quality: 70, timeout: 15000 }).catch(() => {});
      }
    });
    const q = `?n=${n}&days=${days}&seed=${seed}${flag('noprov') ? '&noprov' : ''}${flag('trace') ? '&trace' : ''}${arg('maxsim') ? `&maxsim=${arg('maxsim')}` : ''}${arg('names') ? `&names=${encodeURIComponent(arg('names'))}` : ''}&auto`;
    await page.goto(`${url}mp-soak.html${q}`, { timeout: 90000 });
    let last = '';
    const t0 = Date.now();
    const budget = Number(arg('timeout', days * 15 + 10)) * 60000;
    for (;;) {
      const done = await page.evaluate(() => !!window.soakResult).catch(() => false);
      if (done) break;
      if (Date.now() - t0 > budget) throw new Error(`tempo esgotado (${Math.round(budget / 60000)} min)`);
      const st = await page.locator('#status').innerText().catch(() => '');
      if (st && st !== last && Date.now() % 30000 < 5000) log(`  s${seed}: ${st}`);
      last = st;
      await new Promise((r) => setTimeout(r, 5000));
    }
    const res = await page.evaluate(() => window.soakResult);
    res.pageErrors = [...new Set(errs)].slice(0, 30);
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(res, null, 1));
    return res;
  } finally {
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 20000))]);
  }
}

function report(runs) {
  const L = [`# mp-soak — ${new Date().toLocaleString('pt-BR')}`, '', `${n} jogadores · ${days} dias · sementes ${seeds.join(', ')}${flag('noprov') ? ' · sem provocações' : ''}`, ''];
  L.push('| semente | resultado | jogo | real | violações |', '|---|---|---|---|---|');
  for (const r of runs) L.push(`| ${r.seed} | ${r.stop} | ${r.simT ?? '-'} s | ${r.realSec ?? '-'} s | ${r.rules ? r.rules.reduce((a, x) => a + x.n, 0) : 'erro'} |`);
  L.push('', '## Bugs do usuário → regras', '', '| # | bug | regra | ' + runs.map((r) => `s${r.seed}`).join(' | ') + ' |', '|---|---|---|' + runs.map(() => '---|').join(''));
  for (const [id, name, rs] of BUGS)
    for (const rule of rs) L.push(`| ${id} | ${name} | \`${rule}\` | ${runs.map((r) => r.rules?.find((x) => x.rule === rule)?.n ?? 0).join(' | ')} |`);
  const known = new Set(BUGS.flatMap((b) => b[2]));
  const extra = [...new Set(runs.flatMap((r) => (r.rules ?? []).map((x) => x.rule)))].filter((x) => !known.has(x));
  if (extra.length) L.push('', `Outras regras com violação: ${extra.map((x) => `\`${x}\``).join(', ')}`);
  for (const r of runs) {
    L.push('', `## Semente ${r.seed}`, '');
    if (r.error) {
      L.push(`Erro: ${r.error}`);
      continue;
    }
    for (const x of r.rules) {
      L.push(`### \`${x.rule}\` — ${x.n}×`, '');
      for (const v of x.list.slice(0, 6)) L.push(`- dia ${v.day + 1} ${v.clock} (${v.phase}, ${v.simT} s) · **${v.who}**: ${v.detail}`);
      L.push('');
    }
    if (r.provocations?.length) L.push('Provocações do diretor: ' + r.provocations.map((p) => `dia ${p.day + 1} ${p.who} → ${p.name}`).join(' · '), '');
    for (const p of r.players) if (p.bot.length || p.errors.length) L.push(`- ${p.label} (${p.profile}): ${p.bot.map((b) => b.msg).slice(0, 5).join(' · ')}${p.errors.length ? ` · erros: ${p.errors.map((e) => e.msg).join(' · ')}` : ''}`);
    if (r.pageErrors?.length) L.push('', 'Erros de página: ' + r.pageErrors.join(' · '));
    L.push('', `Capturas: \`s${r.seed}/shots/\` (${r.shots.length} momentos × ${r.n} janelas)`);
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n'));
}

const runs = [];
try {
  for (const seed of seeds) {
    log(`mp-soak semente ${seed}: ${n} jogadores, ${days} dias…`);
    let r;
    try {
      r = await soak(seed);
    } catch (e) {
      r = { seed, stop: `erro: ${e.message.split('\n')[0]}`, error: e.message.split('\n')[0] };
    }
    runs.push(r);
    const total = r.rules ? r.rules.reduce((a, x) => a + x.n, 0) : -1;
    log(`  s${seed}: ${r.stop} · ${total < 0 ? 'sem resultado' : `${total} violação(ões)`}${r.rules?.length ? `: ${r.rules.map((x) => `${x.rule} ${x.n}`).join(', ')}` : ''}`);
    report(runs);
  }
} finally {
  server?.kill();
}
log(`relatório: ${path.relative(ROOT, path.join(OUT, 'report.md'))}`);
process.exit(runs.every((r) => r.ok) ? 0 : 1);
