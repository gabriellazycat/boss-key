// Transforma os registros das partidas (bot.js) em métricas, achados e uma nota de diversão por critério.
// A nota é um indicador (proxy) feito de comportamento de robôs: aponta onde olhar, não substitui gente jogando.

const PROFILE_ORDER = ['cauteloso', 'equilibrado', 'arriscado', 'caotico'];
const SUS_NAMES = { tarefa: 'tarefa do chefe esperando', chefe: 'chefe viu/ouviu', erro: 'trabalho errado', fixa: 'cota de ontem (cobrada de manhã)' };

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const f1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toLocaleString('pt-BR') : '—');
const median = (a) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const clamp10 = (x) => Math.max(0, Math.min(10, x));

/** Uma linha por jogador-run (solo e cada jogador do multi). */
function players(runs) {
  const out = [];
  for (const r of runs) {
    if (r.failed) continue;
    if (r.kind === 'mp') for (const p of r.players ?? []) out.push({ ...p, kind: 'mp', run: r.id, n: r.n });
    else out.push({ ...r, run: r.id });
  }
  return out.filter((p) => p.data && p.data.days);
}

/** Um registro por dia jogado. */
function dayRows(ps) {
  const rows = [];
  for (const p of ps)
    for (const d of p.data.days) {
      if (!d.result) continue;
      const ghost = (d.modeTime.ghost ?? 0) + (d.modeTime.cinematic ?? 0);
      const playT = Math.max(1, sum(Object.values(d.modeTime)) - ghost);
      rows.push({ ...d, run: p.run, kind: p.kind, profile: p.profile ?? p.data.profile, ghost, playT, fired: !!d.result.fired, fun: d.result.fun, susLog: Object.fromEntries(d.result.susLog ?? []) });
    }
  return rows;
}

export function analyze(runs, cfg = {}) {
  const ps = players(runs);
  const days = dayRows(ps);
  const solo = ps.filter((p) => p.kind === 'solo');
  const soloDays = days.filter((d) => d.kind === 'solo');
  const byProfile = {};
  for (const prof of PROFILE_ORDER) {
    const runsP = solo.filter((p) => p.profile === prof);
    if (!runsP.length) continue;
    const ds = soloDays.filter((d) => d.profile === prof);
    const firstFire = runsP.map((p) => {
      const i = p.data.days.findIndex((d) => d.result?.fired);
      return i < 0 ? p.data.days.length : i;
    });
    byProfile[prof] = {
      runs: runsP.length,
      daysPlayed: mean(runsP.map((p) => p.data.days.filter((d) => d.result).length)),
      runOver: runsP.filter((p) => /fim da run/.test(p.stop)).length,
      firstFireDay: mean(firstFire),
      firedRate: mean(ds.map((d) => (d.fired ? 1 : 0))),
      // o último dia com resultado (a run que acaba deixa um "dia" vazio na tela final)
      score: mean(runsP.map((p) => p.data.days.findLast((d) => d.result)?.result?.total ?? 0)),
      funPerDay: mean(ds.filter((d) => !d.fired).map((d) => d.fun)),
      funDoneRate: mean(ds.filter((d) => !d.fired).map((d) => d.funDone.length / Math.max(1, d.funToday.length))),
      fixedRate: mean(ds.filter((d) => !d.fired).map((d) => (d.fixedDone ? 1 : 0))),
      clutches: mean(ds.map((d) => d.clutches)),
      closeCalls: mean(ds.map((d) => d.closeCalls)),
      chases: mean(ds.map((d) => d.chases)),
      deadShare: mean(ds.map((d) => d.deadIdle / d.playT)),
      waitShare: mean(ds.map((d) => d.waitBoss / d.playT)),
      // v0.8: meta de FUN do dia e por que cada vida foi perdida
      goalRate: mean(ds.filter((d) => d.result.goal).map((d) => (d.result.goalFun >= d.result.goal ? 1 : 0))),
      goalShare: mean(ds.filter((d) => d.result.goal).map((d) => d.result.goalFun / d.result.goal)),
      livesLost: { demitido: ds.filter((d) => d.result.lifeLost === 'demitido').length, tedio: ds.filter((d) => d.result.lifeLost === 'tedio').length },
      // assalto (tentativas, sucessos, demissões dentro da sala) e ramal falso, por dia
      heistTries: mean(ds.map((d) => d.heistTries ?? 0)),
      heists: mean(ds.map((d) => d.heists ?? 0)),
      heistFired: sum(ds.map((d) => d.heistFired ?? 0)),
      ramal: mean(ds.map((d) => d.ramal ?? 0)),
      seen: mean(ds.map((d) => d.seenEp ?? 0)),
    };
  }

  // fontes da Suspeita
  const susTotals = {};
  for (const d of soloDays) for (const [k, v] of Object.entries(d.susLog)) susTotals[k] = (susTotals[k] ?? 0) + v;
  const susAll = sum(Object.values(susTotals)) || 1;

  // curva por dia da run
  const curve = [];
  for (let i = 0; i < 14; i++) {
    const ds = soloDays.filter((d) => d.day === i);
    if (ds.length < 2) continue;
    curve.push({ day: i, n: ds.length, fired: mean(ds.map((d) => (d.fired ? 1 : 0))), susStart: mean(ds.map((d) => d.result.susStart)), fun: mean(ds.filter((d) => !d.fired).map((d) => d.fun)), doors: mean(ds.map((d) => d.doors)) });
  }

  // demissões
  const fireReasons = {};
  for (const d of days) if (d.fired) fireReasons[d.result.firedReason] = (fireReasons[d.result.firedReason] ?? 0) + 1;
  const firedAtStart = soloDays.filter((d) => d.fired && d.result.susStart >= 85).length;
  const highStart = soloDays.filter((d) => d.result.susStart >= 85).length;

  // dia 1 (X9): chefia ausente?
  const d0 = soloDays.filter((d) => d.day === 0);
  const d0NoBoss = d0.filter((d) => d.doors === 0 && d.checks.length === 0);
  const d0Ronda = d0.filter((d) => d.events.includes('ronda'));

  // eventos do dia
  const eventStats = {};
  for (const d of soloDays)
    for (const e of new Set(d.events)) {
      const s = (eventStats[e] ??= { n: 0, fired: 0, fun: [], susDelta: [] });
      s.n++;
      if (d.fired) s.fired++;
      else s.fun.push(d.fun);
      s.susDelta.push(d.result.susEnd - d.result.susStart);
    }

  // tarefas do telefone: quanto custam
  const taskStats = {};
  for (const d of soloDays) {
    for (const k of d.phone) {
      const s = (taskStats[k] ??= { n: 0, done: 0, took: [], ramp: [] });
      s.n++;
    }
  }
  for (const p of solo)
    for (const e of p.data.events)
      if (e.type === 'taskDone' && taskStats[e.kind]) {
        taskStats[e.kind].done++;
        taskStats[e.kind].took.push(e.took);
        const d = p.data.days.find((x) => x.day === e.day);
        if (d?.result) taskStats[e.kind].ramp.push((Object.fromEntries(d.result.susLog ?? []).tarefa ?? 0));
      }

  // aviso antes da conferência (GDD: ≥ 6-8 s)
  const warns = days.flatMap((d) => d.checks.filter((c) => c.warn < 200).map((c) => c.warn));
  const shortWarn = warns.filter((w) => w < 6).length;

  // variedade: fontes de FUN distintas por dia
  const variety = soloDays.filter((d) => !d.fired).map((d) => Object.keys(d.funBy).length);
  const firstFun = soloDays.filter((d) => d.firstFun !== null).map((d) => d.firstFun);
  const funPerMin = soloDays.filter((d) => !d.fired).map((d) => d.fun / (d.playT / 60));
  // v0.8: "ele me viu/ouviu" (episódios de Suspeita vinda do chefe) também é um susto
  const tension = days.map((d) => (d.closeCalls + d.clutches + d.chases + d.flaggedSeen + d.escapes + (d.seenEp ?? 0)) / (d.playT / 60));
  const deadShare = mean(days.map((d) => d.deadIdle / d.playT));
  const waitShare = mean(days.map((d) => d.waitBoss / d.playT));
  const ghostShare = mean(days.map((d) => d.ghost / (d.ghost + d.playT)));

  // achados (bugs) agregados
  const bugs = {};
  const add = (key, msg, where, n = 1, ex) => {
    const b = (bugs[key] ??= { key, msg, runs: new Set(), n: 0, ex: [] });
    b.runs.add(where);
    b.n += n;
    if (ex && b.ex.length < 3) b.ex.push(ex);
  };
  for (const p of ps) {
    for (const b of p.data.bugs ?? []) add(b.key, b.msg, p.run, b.n, { day: b.day, t: b.t, at: b.at, to: b.to, shown: b.shown, goal: b.goal });
    for (const e of p.pageErrors ?? []) add(`page:${e.msg.slice(0, 80)}`, `erro na página: ${e.msg}`, p.run);
    for (const e of p.data.errors ?? []) add(`js:${String(e.msg).slice(0, 80)}`, `exceção JS: ${e.msg} ${e.at ?? ''}`, p.run);
  }
  for (const r of runs) if (r.stop && /travou|erro|esgotado|nem todos|morreu/.test(r.stop)) add(`stop:${r.stop.slice(0, 40)}`, `partida interrompida: ${r.stop}`, r.id);
  // bug estrutural: X9 parado no dia 1
  if (d0NoBoss.length) add('x9-idle-day1', `no dia 1 o X9 não fez nenhuma ronda em ${d0NoBoss.length} de ${d0.length} partidas (só sai do elevador se o evento sorteado for "Ronda do X9")`, 'solo', d0NoBoss.length);
  const bugList = Object.values(bugs).map((b) => ({ ...b, runs: b.runs.size })).sort((a, b) => b.runs - a.runs || b.n - a.n);

  // desempenho (tempo real)
  const fps = days.filter((d) => d.fps).map((d) => ({ run: d.run, avg: d.fps.avg, low: d.fps.low }));

  // multiplayer
  const mp = runs.filter((r) => r.kind === 'mp' && !r.failed).map((r) => {
    const n = r.net ?? {};
    const sync = n.sync ?? [];
    return {
      id: r.id, n: r.n, stop: r.stop, realSec: r.realSec, joinSec: n.joinSec,
      days: Math.max(0, ...(r.players ?? []).map((p) => p.data?.days?.length ?? 0)),
      timeGapMax: Math.max(0, ...sync.map((s) => s.timeGap)), posGapMed: median(sync.map((s) => s.posGap)), posGapMax: Math.max(0, ...sync.map((s) => s.posGap)), bossGapMax: Math.max(0, ...sync.map((s) => s.bossGap)),
      samples: sync.length, eventsMismatch: n.eventsMismatch, dayMismatch: n.dayMismatch, firedMismatch: (n.firedMismatch ?? []).length,
      drop: n.dropTest ? { seenAfter: n.dropTest.seenAfter } : null, hostLeft: n.hostLeftTest ? n.hostLeftTest.saw : undefined,
      fired: (r.players ?? []).map((p) => (p.data?.days ?? []).filter((d) => d.result?.fired).length),
      errors: (r.players ?? []).reduce((a, p) => a + (p.pageErrors?.length ?? 0) + (p.data?.errors?.length ?? 0), 0),
    };
  });

  // ------------------------------------------------------------------ notas (0-10)
  const profs = Object.entries(byProfile);
  const cau = byProfile.cauteloso;
  const cha = byProfile.caotico;
  const bal = byProfile.equilibrado;
  const scores = [];
  const tens = median(tension);
  scores.push({ k: 'Tensão (sustos por minuto)', v: clamp10(tens <= 0 ? 0 : tens < 0.3 ? tens * 20 : tens <= 2 ? 6 + (tens - 0.3) * 2.4 : 10 - (tens - 2) * 2), why: `${f1(tens)} momentos de perigo por minuto (quase-flagra, clutch, perseguição, "ele viu"). Alvo: 0,5-2/min.` });
  const fair = warns.length ? 1 - shortWarn / warns.length : 1;
  const clearFires = sum(Object.entries(fireReasons).map(([k, v]) => (/no máximo/.test(k) ? 0 : v)));
  const allFires = sum(Object.values(fireReasons)) || 1;
  scores.push({ k: 'Justiça (aviso e derrota legível)', v: clamp10(fair * 6 + (firedAtStart && highStart ? 4 * (1 - firedAtStart / highStart) : 4) * 0.5 + (clearFires / allFires) * 2), why: `${pct(fair)} das conferências com ≥ 6 s de aviso; ${pct(1 - clearFires / allFires)} das demissões por "Suspeita no máximo"; ${firedAtStart}/${highStart} dias que começaram com ≥ 85 de Suspeita terminaram em demissão.` });
  const varM = mean(variety);
  const funDone = mean(soloDays.filter((d) => !d.fired).map((d) => d.funDone.length / Math.max(1, d.funToday.length)));
  scores.push({ k: 'Variedade e agência', v: clamp10(varM * 2 + funDone * 4), why: `${f1(varM)} fontes de FUN diferentes por dia; ${pct(funDone)} das diversões sorteadas concluídas.` });
  scores.push({ k: 'Ritmo (sem tempo morto)', v: clamp10(10 - deadShare * 25 - ghostShare * 8 - Math.max(0, waitShare - 0.25) * 10), why: `${pct(deadShare)} do expediente sem nada útil para fazer; ${pct(waitShare)} esperando o chefe voltar; ${pct(ghostShare)} do tempo como fantasma (demitido).` });
  const fpm = median(funPerMin);
  const ff = median(firstFun);
  scores.push({ k: 'Recompensa', v: clamp10(Math.min(6, fpm * 0.4) + (ff <= 30 ? 4 : ff <= 60 ? 2.5 : 1)), why: `${f1(fpm)} FUN por minuto jogado (dias sem demissão); primeiro FUN aos ${f1(ff)} s do expediente (mediana).` });
  const curveCliff = curve.length > 2 ? Math.max(...curve.slice(1).map((c, i) => c.fired - curve[i].fired)) : 0;
  const balDays = bal?.firstFireDay ?? 0;
  scores.push({ k: 'Curva de dificuldade', v: clamp10(10 - (d0.length ? (d0NoBoss.length / d0.length) * 3 : 0) - Math.max(0, curveCliff - 0.25) * 8 - (balDays < 2 ? 3 : 0) - (bal && bal.runOver === 0 && bal.daysPlayed >= (cfg.maxDays ?? 12) ? 3 : 0)), why: `1º dia sem chefia em ${d0NoBoss.length}/${d0.length}; maior salto de demissões de um dia para o outro: ${pct(Math.max(0, curveCliff))}; o equilibrado é demitido pela 1ª vez no dia ${f1(balDays + 1)} em média.` });
  const skill = cau && cha ? Math.abs(cau.score - cha.score) / Math.max(1, cau.score, cha.score) + Math.abs(cau.firstFireDay - cha.firstFireDay) / Math.max(1, cau.firstFireDay, cha.firstFireDay) : 0;
  scores.push({ k: 'Escolhas importam (perfis diferentes, resultados diferentes)', v: clamp10(skill * 10), why: profs.length > 1 ? profs.map(([k, v]) => `${k}: ${f1(v.score)} pts, 1ª demissão no dia ${f1(v.firstFireDay + 1)}`).join(' · ') : 'só um perfil rodou' });
  const errRuns = bugList.filter((b) => /^page:|^js:|^stop:/.test(b.key)).reduce((a, b) => a + b.runs, 0);
  scores.push({ k: 'Estabilidade técnica', v: clamp10(10 - errRuns * 1.5 - bugList.filter((b) => !/^page:|^js:|^stop:|^interact|^stuck/.test(b.key)).length * 0.5), why: `${errRuns} partida(s) com erro de página/exceção/interrupção; ${bugList.length} tipos de achado ao todo.` });
  const overall = mean(scores.map((s) => s.v));

  return {
    when: new Date().toISOString(), cfg, counts: { runs: runs.length, playerRuns: ps.length, days: days.length, soloRuns: solo.length, mpRuns: mp.length },
    byProfile, curve, susTotals, susAll, fireReasons, firedAtStart, highStart, d0: { n: d0.length, noBoss: d0NoBoss.length, ronda: d0Ronda.length },
    eventStats: Object.fromEntries(Object.entries(eventStats).map(([k, s]) => [k, { n: s.n, fired: s.fired / s.n, fun: mean(s.fun), susDelta: mean(s.susDelta) }])),
    taskStats: Object.fromEntries(Object.entries(taskStats).map(([k, s]) => [k, { n: s.n, done: s.done, took: mean(s.took), ramp: mean(s.ramp) }])),
    warns: { n: warns.length, short: shortWarn, median: median(warns) },
    variety: varM, funDone, firstFun: ff, funPerMin: fpm, tension: tens, deadShare, waitShare, ghostShare,
    bugs: bugList.map((b) => ({ key: b.key, msg: b.msg, runs: b.runs, n: b.n, ex: b.ex })), fps, mp, scores, overall,
    stops: runs.map((r) => ({ id: r.id, stop: r.stop, realSec: r.realSec })),
  };
}

export function renderReport(s) {
  const L = [];
  L.push(`# Playtest automático — ${new Date(s.when).toLocaleString('pt-BR')}`, '');
  L.push(`${s.counts.runs} sessões · ${s.counts.playerRuns} jogadores-run · ${s.counts.days} dias jogados (${s.counts.soloRuns} runs solo, ${s.counts.mpRuns} salas multiplayer).`, '');
  L.push('> A nota de diversão vem do comportamento de robôs com perfis diferentes. Ela aponta onde olhar; diversão de verdade se confirma com gente jogando.', '');
  L.push(`## Nota de diversão (indicador): **${f1(s.overall)}/10**`, '', '| Critério | Nota | Por quê |', '|---|---|---|');
  for (const x of s.scores) L.push(`| ${x.k} | ${f1(x.v)} | ${x.why} |`);
  L.push('', '## Perfis (solo)', '', '| Perfil | Runs | Dias jogados | 1ª demissão (dia) | Demitido/dia | Placar (FUN total) | FUN/dia | Diversões do dia | Fixa feita | Clutch/dia | Quase-flagra/dia | Perseguições/dia | Tempo morto | Esperando o chefe |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(s.byProfile)) L.push(`| ${k} | ${v.runs} | ${f1(v.daysPlayed)} | ${f1(v.firstFireDay + 1)} | ${pct(v.firedRate)} | ${f1(v.score)} | ${f1(v.funPerDay)} | ${pct(v.funDoneRate)} | ${pct(v.fixedRate)} | ${f1(v.clutches)} | ${f1(v.closeCalls)} | ${f1(v.chases)} | ${pct(v.deadShare)} | ${pct(v.waitShare)} |`);
  L.push('', '## Meta, vidas e assalto (v0.8)', '', '| Perfil | Meta batida | FUN/meta | Vidas perdidas: demissão | Vidas perdidas: tédio | "Ele viu"/dia | Assaltos tentados/dia | Assaltos feitos/dia | Demitidos na sala | Ramal/dia |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(s.byProfile)) L.push(`| ${k} | ${pct(v.goalRate)} | ${pct(v.goalShare)} | ${v.livesLost.demitido} | ${v.livesLost.tedio} | ${f1(v.seen)} | ${f1(v.heistTries)} | ${f1(v.heists)} | ${v.heistFired} | ${f1(v.ramal)} |`);
  L.push('', '## Curva da run (solo, todos os perfis)', '', '| Dia | Amostras | Demitidos | Suspeita ao chegar | FUN (não demitidos) | Rondas |', '|---|---|---|---|---|---|');
  for (const c of s.curve) L.push(`| ${c.day + 1} | ${c.n} | ${pct(c.fired)} | ${f1(c.susStart)} | ${f1(c.fun)} | ${f1(c.doors)} |`);
  L.push('', '## De onde vem a Suspeita (solo)', '', '| Fonte | Total | Parcela |', '|---|---|---|');
  for (const [k, v] of Object.entries(s.susTotals).sort((a, b) => b[1] - a[1])) L.push(`| ${SUS_NAMES[k] ?? k} | ${f1(v)} | ${pct(v / s.susAll)} |`);
  L.push('', '## Motivos das demissões', '', ...Object.entries(s.fireReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`));
  L.push(`- Dias que começaram com Suspeita ≥ 85: ${s.highStart}, e ${s.firedAtStart} acabaram em demissão.`);
  L.push('', '## Eventos do dia', '', '| Evento | Dias | Demitidos | FUN médio | Suspeita (fim − início) |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(s.eventStats).sort((a, b) => b[1].fired - a[1].fired)) L.push(`| ${k} | ${v.n} | ${pct(v.fired)} | ${f1(v.fun)} | ${f1(v.susDelta)} |`);
  L.push('', '## Tarefas do telefone', '', '| Tarefa | Sorteada | Entregue | Tempo até entregar (s) | Suspeita da rampa no dia |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(s.taskStats)) L.push(`| ${k} | ${v.n} | ${v.done} | ${f1(v.took)} | ${f1(v.ramp)} |`);
  L.push('', `Aviso antes de o chefe conferir a mesa: mediana ${f1(s.warns.median)} s; ${s.warns.short} de ${s.warns.n} conferências com menos de 6 s.`);
  L.push(`1º dia (X9): ${s.d0.noBoss} de ${s.d0.n} sem nenhuma ronda; evento "Ronda do X9" sorteado em ${s.d0.ronda}.`);
  L.push('', '## Achados (bugs e problemas)', '');
  if (!s.bugs.length) L.push('Nenhum.');
  for (const b of s.bugs) L.push(`- **${b.msg}** — ${b.runs} partida(s), ${b.n} ocorrência(s)${b.ex?.length ? `. Ex.: ${b.ex.map((e) => JSON.stringify(e)).join(' ; ')}` : ''}`);
  if (s.mp.length) {
    L.push('', '## Multiplayer', '', '| Sala | Jogadores | Fim | Dias | Entrar (s) | Relógio (máx) | Posição (mediana/máx m) | Chefia (máx m) | Eventos diferentes | Demissões por jogador | Queda de convidado | Anfitrião saiu | Erros |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const m of s.mp) L.push(`| ${m.id} | ${m.n} | ${m.stop} | ${m.days} | ${m.joinSec ?? '—'} | ${f1(m.timeGapMax)} s | ${f1(m.posGapMed)} / ${f1(m.posGapMax)} | ${f1(m.bossGapMax)} | ${m.eventsMismatch}/${m.dayMismatch} | ${m.fired.join(', ')} | ${m.drop ? (m.drop.seenAfter ? `percebida em ${m.drop.seenAfter} s` : 'NÃO percebida') : '—'} | ${m.hostLeft === undefined ? '—' : m.hostLeft ? `aviso em ${m.hostLeft.sec} s` : 'SEM aviso'} | ${m.errors} |`);
  }
  if (s.fps.length) {
    L.push('', '## Desempenho (tempo real, headless com GPU)', '', '| Partida | FPS médio | FPS 5% piores |', '|---|---|---|');
    const by = {};
    for (const x of s.fps) (by[x.run] ??= []).push(x);
    for (const [k, v] of Object.entries(by)) L.push(`| ${k} | ${f1(mean(v.map((x) => x.avg)))} | ${f1(mean(v.map((x) => x.low)))} |`);
  }
  L.push('', '## Sessões', '', ...s.stops.map((x) => `- ${x.id}: ${x.stop} (${x.realSec ?? '?'} s)`), '');
  return L.join('\n');
}
