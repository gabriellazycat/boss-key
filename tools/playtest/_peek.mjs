import fs from 'node:fs';
const f = process.argv[2];
const r = JSON.parse(fs.readFileSync(f, 'utf8'));
const runs = r.players ? r.players : [r];
for (const x of runs) {
  const d = x.data;
  console.log('==', x.id, x.stop, 'profile', d.profile, 'errors', JSON.stringify(x.pageErrors).slice(0, 300));
  for (const day of d.days) {
    const res = day.result ?? {};
    const r1 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(+v).toFixed(1)]));
    console.log(`-- dia ${day.day} boss=${day.boss} ev=${day.events} fixed=${day.fixed}(${day.fixedDone}) phone=${day.phone} funToday=${day.funToday}`);
    console.log('   result fun', res.fun, 'sus', res.susStart, '→', res.susEnd && Math.round(res.susEnd), 'next', res.susNext && Math.round(res.susNext), 'fired', res.fired, res.firedReason, 'tasks', res.tasks, 'susLog', JSON.stringify(res.susLog));
    console.log('   funDone', day.funDone, 'funBy', JSON.stringify(r1(day.funBy)));
    console.log('   goals', JSON.stringify(r1(day.goalTime)));
    console.log('   modes', JSON.stringify(r1(day.modeTime)), 'apps', JSON.stringify(r1(day.appTime)));
    console.log('   doors', day.doors, 'checks', day.checks.length, JSON.stringify(day.checks.map(c => [c.warn, c.forbidden, c.seated])), 'idents', day.identifies.length, 'clutch', day.clutches, 'close', day.closeCalls, 'chases', day.chases, 'idle', day.idle.toFixed(1), 'dead', day.deadIdle.toFixed(1), 'wait', day.waitBoss.toFixed(1), 'stuck', day.stuck, 'fallbacks', JSON.stringify(day.fallbacks), 'wrong', day.wrong.length, 'botsFired', day.botsFired.length);
  }
  console.log('bugs', JSON.stringify(d.bugs, null, 0).slice(0, 2500));
  console.log('notes', d.notes, 'errs', d.errors.slice(0, 5));
  const fails = d.events.filter(e => e.type === 'goalFail');
  console.log('goalFails', JSON.stringify(fails).slice(0, 800));
}
