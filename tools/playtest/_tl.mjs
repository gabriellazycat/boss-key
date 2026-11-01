import fs from 'node:fs';
const [f, dayS, from = 0, to = 999] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(f, 'utf8'));
const d = (r.players ? r.players[0] : r).data;
const day = +dayS;
const ev = d.events.filter((e) => e.day === day && e.t >= from && e.t <= to && e.type !== 'chaos');
const sm = d.samples.filter((s) => s[0] === day && s[1] >= from && s[1] <= to);
let prev = null;
for (const s of sm) {
  const line = `${String(s[1]).padStart(3)} sus=${String(s[2]).padStart(5)} fun=${String(s[3]).padStart(5)} ${s[4]}/${s[5]} @${s[6]},${s[7]} ${s[8]}`;
  const evs = ev.filter((e) => e.t >= s[1] && e.t < s[1] + 1).map((e) => `${e.type}${e.id ? ':' + e.id : ''}${e.goal ? ':' + e.goal : ''}${e.why ? ':' + e.why : ''}${e.kind ? ':' + e.kind : ''}${e.reason ? ':' + e.reason : ''}${e.mode ? ':' + e.mode : ''}`);
  if (!prev || prev[2] !== s[2] || evs.length || prev[4] !== s[4] || prev[5] !== s[5]) console.log(line, evs.length ? ' <<' + evs.join(', ') : '');
  prev = s;
}
