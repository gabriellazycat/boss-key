// Reproduz uma run acelerada com semente e, se um passo travar, pausa o JS pelo CDP e imprime a pilha.
import { chromium } from 'playwright-core';
const [seed = '1000', profile = 'caotico', port = '5181'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
const p = await ctx.newPage();
await p.addInitScript((seed) => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, +seed);
await p.goto(`http://localhost:${port}/?debug`);
await p.waitForFunction(() => window.game && window.step);
await p.addScriptTag({ path: 'tools/playtest/bot.js' });
await p.evaluate((o) => PT.init(o), { profile, accel: true, maxDays: 3, seed: +seed });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Debugger.enable');
const click = (s) => p.evaluate((s) => document.querySelector(s)?.click(), s);
await click('#ui .screen.boot'); await new Promise((r) => setTimeout(r, 1200));
await click('#m-play'); await new Promise((r) => setTimeout(r, 1200));
for (let i = 0; i < 400; i++) {
  const st = await p.evaluate(() => PT.state());
  if (st.screen === 'report') { if (st.results >= 3) break; await click('#b-next'); await new Promise((r) => setTimeout(r, 900)); continue; }
  if (st.screen === 'shop') { await p.evaluate(() => PT.shop()); continue; }
  if (st.screen === 'pause') { await click('#b-res'); continue; }
  if (!st.running) { await new Promise((r) => setTimeout(r, 200)); continue; }
  // mesmos passos do run.mjs: 20 quadros/s com o jogador demitido, 30 no resto
  const pr = p.evaluate((fps) => PT.advance(3, fps), st.fired ? 20 : 30).then(() => 'ok').catch((e) => 'err ' + e.message);
  const res = await Promise.race([pr, new Promise((r) => setTimeout(() => r('HANG'), 8000))]);
  if (res === 'HANG') {
    console.log('HANG at', JSON.stringify(st));
    const paused = new Promise((r) => cdp.once('Debugger.paused', r));
    await cdp.send('Debugger.pause');
    const ev = await paused;
    for (const f of ev.callFrames.slice(0, 14)) console.log('  at', f.functionName || '(anon)', f.url.replace(/^.*\/(src|playtest)\//, '$1/').replace(/\?.*$/, ''), f.location.lineNumber + 1);
    // variáveis locais do quadro do topo
    const top = ev.callFrames[0];
    for (const sc of top.scopeChain.slice(0, 1)) {
      const props = await cdp.send('Runtime.getProperties', { objectId: sc.object.objectId });
      console.log('  locals:', props.result.slice(0, 12).map((x) => `${x.name}=${x.value?.value ?? x.value?.description}`).join(' '));
    }
    break;
  }
  if (i % 20 === 0) console.log(st.day, st.time, st.goal, st.mode, st.sus);
}
await b.close();
