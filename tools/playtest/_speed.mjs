import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5181/?debug');
await p.waitForFunction(() => window.game && window.step);
await p.addScriptTag({ path: 'tools/playtest/bot.js' });
const mode = process.argv[2] ?? 'bot';
console.log(await p.evaluate((mode) => {
  PT.init({ profile: 'equilibrado', accel: true, passive: mode === 'passive' });
  quickstart(2); skipElevator();
  const prof = {};
  const g = game;
  // tempo por subsistema: envolve métodos do Game
  for (const k of ['updateScreens', 'updateAudio', 'updateHUD', 'updateWorkers', 'updateDirector']) {
    const o = g[k].bind(g); g[k] = (...a) => { const t = performance.now(); const r = o(...a); prof[k] = (prof[k] ?? 0) + performance.now() - t; return r; };
  }
  for (const [n, obj, k] of [['office.update', g.office, 'update'], ['pc.update', g.pc, 'update'], ['bots.update', g.bots, 'update'], ['juice.update', g.juice, 'update'], ['bot.tick', PT.bot, 'tick']]) {
    const o = obj[k].bind(obj); obj[k] = (...a) => { const t = performance.now(); const r = o(...a); prof[n] = (prof[n] ?? 0) + performance.now() - t; return r; };
  }
  const t0 = performance.now(); PT.advance(30); const ms = performance.now() - t0;
  return { msPerSimSec: +(ms / 30).toFixed(1), prof: Object.fromEntries(Object.entries(prof).map(([k, v]) => [k, +(v / 30).toFixed(2)])) };
}, mode));
await b.close();
