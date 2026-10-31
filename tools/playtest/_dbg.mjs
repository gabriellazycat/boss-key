import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--mute-audio'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto('http://localhost:5173/?debug');
await p.waitForFunction(() => window.game && window.step);
await p.addScriptTag({ path: 'tools/playtest/bot.js' });
console.log(await p.evaluate(() => ({ s: PT.ui.screen(), html: document.querySelector('#ui').innerHTML.slice(0, 600) })));
try { await p.click('#ui .screen.boot', { timeout: 3000 }); console.log('clicked boot'); } catch (e) { console.log('ERR', e.message.split('\n').slice(0, 12).join('\n')); }
await b.close();
