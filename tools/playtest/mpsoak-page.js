// Robô mp-soak (Passo 1 de docs/HANDOFF_MULTIPLAYER.md). Roda dentro de mp-soak.html.
//
// 1 anfitrião + convidados, cada janela dirigida pelo bot.js, jogam dias inteiros (hall → elevador → dia → saída →
// noite → casa → dia seguinte) em passo síncrono: todas as janelas andam 0,1 s de jogo, a rede entrega, repete.
// Um JUIZ confere as regras de sincronia a cada meio segundo de jogo e um DIRETOR provoca, uma vez por dia, as
// situações dos bugs conhecidos (atraso no hall, impressora com o chefe olhando, ramal na ausência e na supervisão,
// café na mão, pegar item andando). Cada violação vira uma linha: regra, janela, dia, hora do jogo, valor.
//
//   mp-soak.html?n=3&days=3&seed=1&auto     ?noprov = sem provocações · ?names=Ana,Jogador,Jogador
//
// Resultado em window.soakResult (o tools/playtest/mpsoak.mjs lê, tira as capturas e grava o relatório).

const qs = new URLSearchParams(location.search);
const N = Math.max(2, Math.min(6, +(qs.get('n') || 3)));
const DAYS = Math.max(1, +(qs.get('days') || 3));
const SEED = +(qs.get('seed') || 1);
// dois convidados com o mesmo nome de propósito: na Steam dois amigos podem ter o mesmo apelido
const NAMES = (qs.get('names') || 'Ana,Jogador,Jogador,Dani,Edu,Fê').split(',');
const PROFILES = ['equilibrado', 'arriscado', 'cauteloso', 'caotico', 'equilibrado', 'arriscado'];
const VARIANTS = ['voce', 'bia', 'caio'];
const PROVOKE = !qs.has('noprov');
/** Depuração: para depois de N s de jogo (?maxsim=30) e anota a posição de cada um a cada segundo (?trace). */
const MAX_SIM = +(qs.get('maxsim') || 0);
const TRACE = qs.has('trace');
const DT = 0.1;
const FPS = 30;
const MAX_SHOTS = 90;
const room = `SK${SEED}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
document.getElementById('code').textContent = room;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
function log(cls, s) {
  logEl.insertAdjacentHTML('beforeend', `<span class="${cls}">${s.replace(/</g, '&lt;')}</span>\n`);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(s);
}

// ------------------------------------------------------------------ janelas
/** @type {{ i: number, label: string, f: HTMLIFrameElement, w: any, g: any, host: boolean }[]} */
const wins = [];
function addWindow(i) {
  const host = i === 0;
  const label = `${NAMES[i]}${host ? ' (host)' : ` #${i}`}`;
  const src = `./index.html?debug&mp=${host ? 'host' : 'join'}&room=${room}&name=${encodeURIComponent(NAMES[i])}&variant=${VARIANTS[i % VARIANTS.length]}&seed=${SEED * 10 + i}`;
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.innerHTML = `<span>${host ? '👑 ' : ''}${label}</span>`;
  const f = document.createElement('iframe');
  f.src = src;
  f.dataset.win = String(i);
  cell.append(f);
  document.getElementById('grid').append(cell);
  wins.push({ i, label, f, w: null, g: null, host });
}
const grid = document.getElementById('grid');
grid.style.gridTemplateColumns = `repeat(${N <= 2 ? N : 2}, 1fr)`;
grid.style.gridTemplateRows = `repeat(${Math.ceil(N / 2)}, 1fr)`;
for (let i = 0; i < N; i++) addWindow(i);

const H = () => wins[0].g;
const byPeer = (id) => wins.find((x) => x.g.net?.self === id) ?? null;
/** Funcionário que representa `owner` na janela `viewer` (o próprio jogador, se for a mesma). */
function workerIn(viewer, owner) {
  if (viewer === owner) return viewer.g.player;
  return viewer.g.net?.remotes.get(owner.g.net.self)?.w ?? null;
}
function clockTxt(g) {
  const m = 9 * 60 + Math.floor((g.time / g.duration) * 540);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** Fase como o jogador vê: a do jogo, ou a tela em que está ('casa' = relatório do dia). */
function phaseOf(x) {
  const g = x.g;
  if (g.running) return g.phase;
  const s = x.w.PT?.ui.screen();
  return s === 'report' ? 'casa' : s ?? 'fora';
}
const SYNC_PHASES = ['lobby', 'elevator', 'play', 'leaving'];
const xz = (p) => `${(p.x + 10).toFixed(1)},${(p.z + 12).toFixed(1)}`;

// ------------------------------------------------------------------ violações
let simT = 0;
const rules = new Map();
const events = [];
function violate(rule, who, detail) {
  const h = H();
  const v = { rule, who, day: h.dayIndex, phase: phaseOf(wins[0]), clock: clockTxt(h), simT: +simT.toFixed(1), detail };
  let r = rules.get(rule);
  if (!r) rules.set(rule, (r = { n: 0, list: [] }));
  r.n++;
  if (r.list.length < 12) r.list.push(v);
  if (r.n === 1) want(`viol-${rule}`);
  if (r.n <= 3) log('fail', `✘ [${rule}] dia ${v.day + 1} ${v.clock} (${v.phase}) · ${who}: ${detail}`);
}
/** Condição ruim que precisa durar `tol` s de jogo para virar violação (absorve a latência da rede). */
const pending = new Map();
function cond(rule, key, bad, tol, who, detail) {
  const k = `${rule}|${key}`;
  const p = pending.get(k);
  if (!bad) {
    pending.delete(k);
    return;
  }
  if (!p) pending.set(k, { since: simT, fired: false });
  else if (!p.fired && simT - p.since >= tol) {
    p.fired = true;
    violate(rule, who, typeof detail === 'function' ? detail() : detail);
  }
}
function note(s) {
  events.push({ simT: +simT.toFixed(1), day: H()?.dayIndex ?? -1, s });
  log('info', `· ${s}`);
}

// ------------------------------------------------------------------ capturas (o mpsoak.mjs tira: uma por janela)
const shotQueue = [];
const shots = [];
const shotOnce = new Set();
function want(name) {
  if (shotOnce.has(name) || shots.length + shotQueue.length >= MAX_SHOTS) return;
  shotOnce.add(name);
  shotQueue.push(name);
}
async function flushShots() {
  while (shotQueue.length) {
    const name = shotQueue.shift();
    if (typeof window.soakShot !== 'function') continue;
    for (const x of wins) x.w.step(0, FPS, true);
    await raf();
    await raf();
    try {
      await window.soakShot(name, wins.map((x) => x.i));
      shots.push(name);
    } catch {}
  }
}

// ------------------------------------------------------------------ ganchos nas janelas
const popups = wins.map(() => []);
const readyAt = wins.map(() => -1);
const phaseSince = wins.map(() => ({ key: '', t: 0 }));
/** Quando cada janela entrou em cada fase (`dia:fase` → s de jogo), anotado a cada passo. */
const enteredAt = wins.map(() => ({}));
const lastPh = wins.map(() => '');
/** Última vez (s de jogo) em que cada jogador teve cada atividade: a "cadeira" liga e desliga com a velocidade mais rápido que o juiz amostra. */
const actSeen = wins.map(() => new Map());
function trackPhases() {
  for (const x of wins) actSeen[x.i].set(x.g.player.act ?? null, simT);
  for (const x of wins) {
    const key = `${x.g.dayIndex}:${x.g.running ? x.g.phase : 'fora'}`;
    if (key === lastPh[x.i]) continue;
    lastPh[x.i] = key;
    enteredAt[x.i][key] = simT;
  }
}
const pickReq = [];
const supEnds = [];

function hook(x) {
  const g = x.g;
  const w = x.w;
  w.addEventListener('error', (e) => violate('erro-na-pagina', x.label, `${e.message} (${String(e.filename).replace(/^.*\/src\//, 'src/')}:${e.lineno})`));
  w.addEventListener('unhandledrejection', (e) => violate('erro-na-pagina', x.label, String(e.reason).slice(0, 200)));
  const wrap = (obj, name, fn) => {
    const orig = obj[name];
    obj[name] = function (...a) {
      return fn.call(this, orig.bind(this), ...a);
    };
  };
  wrap(g.hud, 'popup', (orig, kind, text, sub) => {
    popups[x.i].push({ simT, text: `${text} ${sub ?? ''}` });
    if (popups[x.i].length > 60) popups[x.i].shift();
    return orig(kind, text, sub);
  });
  wrap(g.net, 'setReady', (orig, v) => {
    if (v) readyAt[x.i] = simT;
    return orig(v);
  });
  // cabine do térreo: só sobe com todo mundo dentro (na visão desta janela)
  wrap(g, 'rideUp', (orig) => {
    const out = [];
    if (!g.office.inLobbyCabin(g.player.ball.pos)) out.push(`${x.label} (você, em ${xz(g.player.ball.pos)})`);
    for (const o of wins)
      if (o !== x) {
        const rw = workerIn(x, o);
        if (rw && !rw.fired && !g.office.inLobbyCabin(rw.ball.pos)) out.push(`${o.label} (${phaseOf(o)} na janela dele, visto em ${xz(rw.ball.pos)})`);
      }
    if (out.length) violate('cabine-com-todos', x.label, `a cabine subiu sem: ${out.join(' · ')}`);
    else note(`${x.label}: cabine subiu com todos`);
    want(`d${g.dayIndex + 1}-cabine-subindo-${x.i}`);
    return orig();
  });
  if (x.host) {
    // contagem do elevador: todos no elevador, dentro da cabine, com o "pronto" de hoje
    wrap(g, 'onCountdown', (orig, s) => {
      if (s > 0) {
        const bad = [];
        for (const o of wins) {
          if (o.g.dayIndex !== g.dayIndex || phaseOf(o) !== 'elevator') bad.push(`${o.label} está em ${phaseOf(o)} (dia ${o.g.dayIndex + 1})`);
          const rw = workerIn(x, o);
          if (rw && !g.office.inElevator(rw.ball.pos)) bad.push(`${o.label} fora da cabine (visto em ${xz(rw.ball.pos)})`);
          const entered = enteredAt[o.i][`${o.g.dayIndex}:elevator`];
          if (entered === undefined || readyAt[o.i] < entered) bad.push(`${o.label} com "pronto" de antes de entrar no elevador hoje`);
        }
        if (bad.length) violate('contagem-com-todos', x.label, bad.join(' · '));
        else note('contagem começou com todos na cabine');
      }
      return orig(s);
    });
    // supervisão: quando o host larga a supervisão, o alvo tem que ter recebido o veredito
    wrap(g, 'updateSupervision', (orig, dt) => {
      const s = g.sup;
      const b = g.bosses[0];
      const snap = s && { w: s.w, phase: s.phase, t: +s.t.toFixed(1), bossState: b?.state, cur: b?.cur ? (b.cur.kind === 'desk' ? `mesa(${b.cur.mode})` : b.cur.why) : '-' };
      const r = orig(dt);
      if (snap && !g.sup && !snap.w.fired) supEnds.push({ simT, snap, day: g.dayIndex, peer: g.net.peerOf(snap.w) });
      return r;
    });
    // "passeando à toa" para quem tem álibi na própria tela
    wrap(g, 'seeing', (orig, w, b, tier, reason, dt, at) => {
      if (reason === 'passeando à toa' && w.remote) {
        const o = byPeer(w.remote);
        const why = o && alibiOf(o);
        if (why) cond('passeando-com-alibi', `${o.label}|${g.dayIndex}`, true, 0.5, o.label, `o chefe (${b?.kind}) julgou "passeando à toa" enquanto ${why}`);
      }
      return orig(w, b, tier, reason, dt, at);
    });
  } else {
    // pedido de pegar item: o host tem que aceitar (o prompt de E prometeu)
    wrap(g.items, 'request', (orig, a, id, ...rest) => {
      if (a === 'pick') pickReq.push({ simT, x, id, mine: xz(g.player.ball.pos) });
      return orig(a, id, ...rest);
    });
  }
}

/** Álibi que o jogador tem na própria tela (as regras do solo): item na mão, tarefa do chefe, prancheta, trabalho aberto. */
function alibiOf(o) {
  const g = o.g;
  // a regra do jogo, se ele já a tiver num lugar só; senão a do solo (antes da correção)
  if (g.hasAlibi && !g.hasAlibi(g.player)) return '';
  if (g.pc.carrying) return `segurava ${g.pc.carrying}`;
  if (g.tasks.active.length) return `fazia a tarefa "${g.tasks.active[0].title ?? g.tasks.active[0].kind}"`;
  if (g.shop.has('prancheta')) return 'tinha a prancheta';
  if (g.minigame.open && (g.pc.workPanel || ['fios', 'disjuntor'].includes(g.minigame.kind))) return `estava no painel de trabalho "${g.minigame.kind}"`;
  return '';
}

// ------------------------------------------------------------------ juiz (a cada 0,5 s de jogo)
function judge() {
  const h = H();
  const hw = wins[0];
  const ph = wins.map(phaseOf);

  // 1) dia: ninguém joga um dia à frente de quem ainda está num anterior
  {
    const running = wins.filter((x) => x.g.running);
    const maxRun = Math.max(-1, ...running.map((x) => x.g.dayIndex));
    const behind = wins.filter((x) => x.g.dayIndex < maxRun);
    cond('dia-sincronizado', 'all', behind.length > 0, 3, 'sala', () => wins.map((x, i) => `${x.label}: dia ${x.g.dayIndex + 1} (${ph[i]})`).join(' · '));
  }
  // 2) fases sincronizadas (hall, elevador, expediente e saída são da sala inteira)
  for (const x of wins) {
    if (x.host || !x.g.running || x.g.dayIndex !== h.dayIndex) continue;
    const i = x.i;
    const syncPh = SYNC_PHASES.includes(ph[0]) || SYNC_PHASES.includes(ph[i]);
    cond('fase-sincronizada', x.label, syncPh && ph[i] !== ph[0], 2.5, x.label, () => `${x.label} em "${ph[i]}" e o host em "${ph[0]}" (dia ${h.dayIndex + 1})`);
  }
  // 3) portas iguais em todas as janelas
  for (const x of wins) {
    if (x.host || x.g.dayIndex !== h.dayIndex || ph[x.i] !== ph[0]) continue;
    if (ph[0] === 'lobby') {
      const a = h.office.lobby.open;
      const b = x.g.office.lobby.open;
      cond('porta-igual', `lobby|${x.label}`, Math.abs(a - b) > 0.5, 1.5, x.label, `porta da cabine do térreo: host ${a ? 'aberta' : 'fechada'}, ${x.label} ${b ? 'aberta' : 'fechada'}`);
    }
    if (['elevator', 'play', 'leaving'].includes(ph[0])) {
      const a = h.office.elevatorOpen;
      const b = x.g.office.elevatorOpen;
      cond('porta-igual', `elev|${x.label}`, Math.abs(a - b) > 0.5, 2, x.label, `porta do elevador (${ph[0]}): host ${a.toFixed(1)}, ${x.label} ${b.toFixed(1)}`);
    }
  }
  // 4) fala do chefe no elevador no mesmo passo
  for (const x of wins) {
    if (x.host || ph[0] !== 'elevator' || ph[x.i] !== 'elevator' || x.g.dayIndex !== h.dayIndex) continue;
    cond('fala-do-elevador', x.label, x.g.elevTalkIdx !== h.elevTalkIdx, 1.5, x.label, () => `fala nº ${x.g.elevTalkIdx} na janela de ${x.label} e nº ${h.elevTalkIdx} no host`);
  }
  // 5) a Suspeita não sobe fora do expediente (hall, elevador, saída, noite)
  for (const x of wins) {
    const s = x.g.player.sus;
    const off = x.g.running && ['lobby', 'elevator', 'leaving', 'evening'].includes(ph[x.i]);
    if (off && s > lastSus[x.i] + 0.5) violate('suspeita-fora-do-expediente', x.label, `Suspeita ${lastSus[x.i].toFixed(0)} → ${s.toFixed(0)} em "${ph[x.i]}"`);
    lastSus[x.i] = s;
  }
  // 6) fim do expediente: o que estava na agenda até ~17:30 tem que ter acontecido
  if (lastHostPh === 'play' && ph[0] !== 'play') {
    // adiada não é feita: se às 18h ele ainda não julgou, a supervisão do dia se perdeu
    // (já na mesa, olhando, quando o expediente acaba = ele apareceu: não é o "não veio")
    if (h.sup && !h.sup.w.fired && h.sup.phase === 'go') violate('supervisao-perdida', 'host', `às 18h a supervisão de ${h.sup.w.name} ainda estava pendente (fase "${h.sup.phase}", chefe em "${h.bosses[0]?.state}")`);
    for (const it of h.agenda.items) {
      if (it.done || it.at > h.duration - 25) continue;
      const at = clockTxt({ time: it.at, duration: h.duration });
      if (it.kind === 'supervisao') violate('supervisao-perdida', 'host', `a supervisão das ${at} (${it.who}) nunca começou`);
      else {
        const b = h.bosses[0];
        violate('agenda-nao-cumprida', 'host', `"${it.kind}" das ${at} nunca começou (${b?.kind} em "${b?.state}"${b?.patrolling ? ', ronda longa' : ''}, fila ${b?.queue.length ?? 0}; eventos ${h.dayEvents.join('+') || 'nenhum'})`);
      }
    }
  }
  lastHostPh = ph[0];
  if (ph[0] === 'play') judgePlay(h, hw, ph);
  judgeStalls(ph);
}
const lastSus = wins.map(() => 0);
let lastHostPh = '';
/** Desde quando cada chefia está fora do andar (`dia:tipo` → s de jogo). */
const awaySince = new Map();

function judgePlay(h, hw, ph) {
  // 5) chefias: visíveis fora de "away" e iguais em todas as janelas
  for (const b of h.bosses) {
    cond('chefe-sumido', b.kind, !b.ball.root.visible && !b.away, 3, 'host', () => `${b.kind} invisível fora do elevador: estado "${b.state}", alvo ${b.cur ? (b.cur.kind === 'desk' ? 'mesa' : b.cur.why) : 'nenhum'}, em ${xz(b.pos)}`);
    // fora do andar (almoço fora, reunião no 11º) tem hora para voltar: a da agenda
    const ak = `${h.dayIndex}:${b.kind}`;
    if (b.away && !awaySince.has(ak)) awaySince.set(ak, simT);
    if (!b.away) awaySince.delete(ak);
    const gone = awaySince.has(ak) ? simT - awaySince.get(ak) : 0;
    const dur = h.agenda.longItem?.dur ?? 80;
    cond('chefe-sumido', `${ak}|away`, gone > dur + 20, 0, 'host', () => `${b.kind} fora do andar há ${gone | 0} s (a agenda diz ${dur | 0} s) — não voltou`);
    for (const x of wins) {
      if (x.host || ph[x.i] !== 'play' || x.g.dayIndex !== h.dayIndex) continue;
      const gb = x.g[b.kind];
      const vis = gb.ball.root.visible;
      cond('chefe-igual', `${b.kind}|vis|${x.label}`, vis !== b.ball.root.visible, 1.5, x.label, `${b.kind}: ${b.ball.root.visible ? 'visível' : 'invisível'} no host, ${vis ? 'visível' : 'invisível'} para ${x.label}`);
      const d = vis && b.ball.root.visible ? gb.ball.pos.distanceTo(b.ball.pos) : 0;
      cond('chefe-igual', `${b.kind}|pos|${x.label}`, d > 2, 1.5, x.label, `${b.kind} ${d.toFixed(1)} m longe de onde o host o tem`);
    }
  }
  // meta do dia (do time), eventos e clima iguais para todos
  for (const x of wins) {
    if (x.host || ph[x.i] !== 'play' || x.g.dayIndex !== h.dayIndex) continue;
    cond('meta-igual', x.label, x.g.goal !== h.goal, 2, x.label, () => `meta de hoje: ${h.goal} FUN no host, ${x.g.goal} FUN para ${x.label}`);
    const a = `${h.dayEvents.join('+') || 'nenhum'} / ${h.weather}`;
    const b = `${x.g.dayEvents.join('+') || 'nenhum'} / ${x.g.weather}`;
    cond('eventos-iguais', x.label, a !== b, 2, x.label, `eventos/clima do dia: host "${a}", ${x.label} "${b}"`);
  }
  // 6) agenda: "SUA mesa" só na janela de quem vai ser supervisionado
  const sups = h.agenda.items.filter((it) => it.kind === 'supervisao');
  sups.forEach((it, k) => {
    const target = it.w ? h.net.peerOf(it.w) : '';
    for (const x of wins) {
      if (ph[x.i] !== 'play' || x.g.dayIndex !== h.dayIndex) continue;
      const mine = x.g.agenda.items.filter((y) => y.kind === 'supervisao')[k];
      if (!mine) continue;
      const shows = mine.who === 'SUA mesa';
      const is = x.g.net.self === target;
      cond('sua-mesa', `${k}|${x.label}`, shows !== is, 2, x.label, `supervisão de ${it.w?.name} (${byPeer(target)?.label}): ${x.label} ${shows ? 'vê "SUA mesa"' : `vê "${mine.who}"`}`);
    }
  });
  // 7) cada um vê os outros onde eles estão, sentados/deitados/segurando o que seguram, e a tela deles
  for (const o of wins) {
    if (ph[o.i] !== 'play' || o.g.player.fired || o.g.dayIndex !== h.dayIndex) continue;
    const og = o.g;
    const mode = og.pc.mode;
    for (const v of wins) {
      if (v === o || ph[v.i] !== 'play' || v.g.dayIndex !== h.dayIndex) continue;
      const rw = workerIn(v, o);
      if (!rw) {
        cond('remoto-no-lugar', `${o.label}>${v.label}|bind`, true, 2, v.label, `${v.label} não tem ${o.label} na sala`);
        continue;
      }
      const key = `${o.label}>${v.label}`;
      if (!og.player.hidden && mode !== 'ghost') {
        const d = rw.ball.pos.distanceTo(og.player.ball.pos);
        cond('remoto-no-lugar', key, d > 1.5 || !rw.ball.root.visible, 1.5, v.label, () => `${o.label} aparece ${rw.ball.root.visible ? `${d.toFixed(1)} m longe` : 'INVISÍVEL'} para ${v.label} (de verdade em ${xz(og.player.ball.pos)}, ${mode})`);
      }
      cond('pose-remota', `${key}|sentado`, (mode === 'seated') !== rw.seated, 1, v.label, `${o.label} ${mode === 'seated' ? 'sentado' : `em pé (${mode})`}, ${v.label} vê ${rw.seated ? 'sentado' : 'em pé'}`);
      cond('pose-remota', `${key}|deitado`, (mode === 'nap') !== rw.ball.lying > 0.5, 1, v.label, `${o.label} ${mode === 'nap' ? 'cochilando' : 'acordado'}, ${v.label} vê ${rw.ball.lying > 0.5 ? 'deitado' : 'de pé/sentado'}`);
      const carry = og.pc.carrying;
      const shown = rw.ball.propKind ?? null;
      cond('pose-remota', `${key}|carrega`, !!carry !== !!shown, 1, v.label, `${o.label} segura ${carry ?? 'nada'}, ${v.label} vê ${shown ?? 'nada'} na mão`);
      // o que o outro vê vale se o dono fez isso no último segundo (a rede chega ~0,3 s depois, passando pelo host)
      const seenAct = actSeen[o.i].get(rw.act ?? null) ?? -99;
      cond('pose-remota', `${key}|atividade`, simT - seenAct > 1, 1.5, v.label, `${o.label} faz "${og.player.act ?? 'nada'}", ${v.label} vê "${rw.act ?? 'nada'}"`);
      if (mode === 'seated') {
        const app = og.computer.active;
        const want = ['tiro', 'video', 'pesca'].includes(app) ? app : 'planilha';
        const drawn = v.g.deskScreen(rw);
        cond('tela-remota', key, drawn !== want, 1.5, v.label, `${o.label} está com "${app}" aberto, a mesa dele mostra "${drawn}" para ${v.label}`);
      }
    }
  }
  // 8) HUD de cada janela
  for (const x of wins) {
    if (ph[x.i] !== 'play' || x.g.player.fired) continue;
    const g = x.g;
    const hud = g.hud;
    if (g.pc.mode === 'walk') {
      const txt = `${hud.controlsEl.innerText} ${hud.promptEl.classList.contains('on') ? hud.promptEl.innerText : ''}`;
      const hint = /btn dir|botão direito|arremess/i.exec(txt);
      const holding = g.pc.paperHeld > 0 || !!g.items.heldBy(g.player);
      cond('hud-arremesso', x.label, !!hint && !holding, 0.5, x.label, () => `dica de arremesso sem nada na mão: "${txt.replace(/\s+/g, ' ').trim().slice(0, 120)}"`);
    }
    const ban = hud.banner.classList.contains('on') ? hud.banner.textContent : '';
    if (/SAIU DA SALA|ESTÁ ANDANDO/.test(ban)) {
      const out = h.bosses.filter((b) => !['office', 'toDoor', 'return', 'leave', 'wait'].includes(b.state));
      cond('aviso-chefe', x.label, out.length === 0, 1, x.label, () => `faixa "${ban.slice(0, 40)}" com as chefias em ${h.bosses.map((b) => `${b.kind}:${b.state}${b.patrolling ? '(ronda longa)' : ''}`).join(', ')}`);
    } else cond('aviso-chefe', x.label, false, 1, x.label, '');
    const all = x.w.document.getElementById('ui').innerText;
    const mul = /[^\n]{0,30}×\s?\d[^\n]{0,20}/.exec(all);
    cond('hud-multiplicador', `${x.label}|${g.dayIndex}`, !!mul, 0.5, x.label, () => `"${mul[0].trim()}"`);
  }
}

/** Fase parada tempo demais (a sala travou esperando alguém). */
const STALL = { lobby: 90, elevator: 120, play: 420, leaving: 90, evening: 150, casa: 120 };
function judgeStalls(ph) {
  for (const x of wins) {
    const key = `${x.g.dayIndex}:${ph[x.i]}`;
    const ps = phaseSince[x.i];
    if (ps.key !== key) {
      ps.key = key;
      ps.t = simT;
      ps.stalled = false;
      continue;
    }
    const lim = STALL[ph[x.i]];
    if (lim && simT - ps.t > lim && !ps.stalled) {
      ps.stalled = true;
      violate('travou', x.label, `${simT - ps.t | 0} s parado em "${ph[x.i]}" no dia ${x.g.dayIndex + 1}`);
      // destrava para o teste seguir (o achado já foi registrado)
      if (ph[x.i] === 'lobby' || ph[x.i] === 'elevator' || ph[x.i] === 'leaving') x.w.skipElevator();
      if (ph[x.i] === 'evening') x.g.goHome();
    }
  }
}

/** Pedidos e fins de supervisão: confere depois que a rede teve tempo de responder. */
function judgeLater() {
  const h = H();
  for (let k = pickReq.length - 1; k >= 0; k--) {
    const r = pickReq[k];
    if (simT - r.simT < 1.5) continue;
    pickReq.splice(k, 1);
    const it = h.items.list.find((y) => y.id === r.id);
    const hw = h.net.remotes.get(r.x.g.net.self)?.w;
    if (!it || !hw) continue;
    if (!it.holders.includes(hw)) violate('pegada-recusada', r.x.label, `E em "${r.id}" (o prompt ofereceu) e o host não deu: item ${it.status} a ${hw.ball.pos.distanceTo(it.pos).toFixed(2)} m (3D) do jogador visto pelo host; ${r.x.label} estava em ${r.mine}, o host o via em ${xz(hw.ball.pos)}${h.items.heldBy(hw) ? '; o host acha que ele já segura algo' : ''}`);
  }
  for (let k = supEnds.length - 1; k >= 0; k--) {
    const e = supEnds[k];
    if (simT - e.simT < 2) continue;
    supEnds.splice(k, 1);
    const o = byPeer(e.peer);
    if (!o) continue;
    const got = popups[o.i].some((p) => p.simT >= e.simT - 1 && /APROVADO|REPROVADO|FALTOU/.test(p.text));
    if (!got) violate('supervisao-perdida', o.label, `o chefe largou a supervisão de ${o.label} sem veredito (fase "${e.snap.phase}" após ${e.snap.t} s; chefe em "${e.snap.bossState}", alvo ${e.snap.cur})`);
  }
}

// ------------------------------------------------------------------ diretor: provoca os bugs conhecidos, uma vez por dia
const prov = { day: -1, done: new Set(), log: [] };
const once = (k) => {
  if (prov.done.has(k)) return false;
  prov.done.add(k);
  return true;
};
function V3(x, p) {
  const C = x.g.player.ball.pos.constructor;
  return new C(p.x, p.y ?? 0, p.z);
}
/** Recado em passos dentro da janela `x` (o robô dela espera). Cada passo devolve 'next', 'run' ou 'abort'. */
function errand(x, name, steps) {
  let i = 0;
  let t = 0;
  note(`diretor: ${x.label} → ${name}`);
  prov.log.push({ day: x.g.dayIndex, who: x.label, name, simT: +simT.toFixed(1) });
  x.w.PT.drive((dt, api) => {
    t += dt;
    const s = steps[i];
    if (!s) return 'done';
    const r = s(dt, api, t);
    if (r === 'next') {
      i++;
      t = 0;
    } else if (r === 'abort' || t > 45) {
      note(`diretor: ${x.label} largou "${name}" no passo ${i + 1}`);
      return 'done';
    }
    return 'run';
  });
}
/** Levanta (sentado, cadeira, soneca, banheiro): E segurado 0,6 s, que também levanta digitando no e-mail. */
const stand = (x) => (dt, api, t) => {
  if (x.g.pc.mode === 'walk') {
    api.keyUp('KeyE');
    return 'next';
  }
  if (x.g.minigame.open) x.g.minigame.close(true);
  if (t % 1.2 < 0.6) api.keyDown('KeyE');
  else api.keyUp('KeyE');
  return t > 6 ? 'abort' : 'run';
};
const walk = (x, p, r = 0.5) => (dt, api) => {
  const res = api.walkTo(V3(x, p), r, dt);
  return res === 'arrived' ? 'next' : res === 'stuck' ? 'abort' : 'run';
};
const promptHas = (x, re) => x.g.hud.promptEl.classList.contains('on') && re.test(x.g.hud.promptEl.innerText);
const press = (x, re, look) => (dt, api, t) => {
  if (look) api.face(V3(x, look));
  if (promptHas(x, re)) {
    api.tap('KeyE');
    return 'next';
  }
  return t > 4 ? 'abort' : 'run';
};
const wait = (secs, until) => (dt, api, t) => (t >= secs || until?.() ? 'next' : 'run');

function director() {
  if (!PROVOKE) return;
  const h = H();
  if (h.dayIndex !== prov.day) {
    prov.day = h.dayIndex;
    prov.done.clear();
  }
  const A = wins[1];
  const Bw = wins[N - 1];
  const free = (x) => x.g.running && x.g.phase === 'play' && !x.g.player.fired && !x.w.PT.driving;
  // (bug 6/5) atraso no hall: o último convidado fica parado 12 s na entrada
  if (phaseOf(Bw) === 'lobby' && Bw.g.dayIndex === h.dayIndex && !Bw.w.PT.driving && once('hall')) errand(Bw, 'demora 12 s no hall', [wait(12)]);
  if (phaseOf(wins[0]) !== 'play') return;
  const P = h.office.P;
  const main = h.bosses[0];
  // (bug 4) impressora: trava aos 40 s; o convidado A desatola enquanto o alarme chama o chefe
  if (h.time > 40 && free(A) && once('impressora')) {
    h.jamPrinter('teste do robô: destrave');
    const front = { x: P.printer.x, z: P.printer.z - 0.8 };
    errand(A, 'desatolar a impressora com o chefe vindo', [
      stand(A),
      walk(A, front, 0.4),
      press(A, /Destravar/i, { x: P.printer.x, y: 1, z: P.printer.z }),
      // segura o painel aberto até o chefe chegar na impressora (ou 25 s)
      wait(25, () => main.state === 'stay' && main.cur?.kind === 'point' && main.cur.why === 'printer'),
      wait(4),
      () => {
        if (A.g.minigame.open) A.g.minigame.solve();
        return 'next';
      },
    ]);
  }
  // (bug 10/4) café na mão: o convidado A pega um café e passeia com ele
  if (h.time > 110 && free(A) && once('cafe')) {
    errand(A, 'pegar café e passear', [
      stand(A),
      walk(A, { x: P.coffee.x, z: P.coffee.z - 1.0 }, 0.5),
      press(A, /café/i, { x: P.coffee.x, y: 1, z: P.coffee.z }),
      wait(1),
      () => {
        if (!A.g.pc.carrying) {
          note('diretor: a cafeteira não deu café (esquentando?): café entregue direto');
          A.g.pc.carry('coffee');
        }
        return 'next';
      },
      walk(A, { x: 0, z: 0 }, 1.5),
      wait(5),
    ]);
  }
  // (bug 2) ramal enquanto o chefe está fora do andar
  if (main?.away && free(Bw) && once('ramal-fora')) {
    Bw.g.ramalLeft = Math.max(1, Bw.g.ramalLeft);
    note(`diretor: ${Bw.label} liga o ramal com ${main.kind} fora do andar`);
    Bw.g.useRamal();
  }
  // (bug 1) ramal com o chefe a caminho da supervisão
  if (h.sup && h.sup.phase === 'go' && main?.state === 'walk' && once('ramal-super')) {
    const caller = wins.find((x) => !x.host && free(x) && x.g.net.self !== h.net.peerOf(h.sup.w));
    if (caller) {
      caller.g.ramalLeft = Math.max(1, caller.g.ramalLeft);
      note(`diretor: ${caller.label} liga o ramal com o chefe indo supervisionar ${h.sup.w.name}`);
      caller.g.useRamal();
    } else prov.done.delete('ramal-super');
  }
  // (bug 8) pegar o item de missão andando (o host vê o jogador ~0,2 s atrás)
  const item = h.items.list.find((y) => y.status === 'rest');
  if (item && h.time > 70 && free(A) && once('pegar')) {
    const p = item.pos;
    errand(A, `pegar "${item.id}" andando`, [
      stand(A),
      walk(A, { x: p.x + 4.5, z: p.z }, 1.2),
      (dt, api, t) => {
        api.face(V3(A, { x: p.x, y: 0.3, z: p.z }));
        api.keyDown('KeyW');
        if (promptHas(A, /Pegar o|Segurar o/i)) {
          api.tap('KeyE');
          return 'next';
        }
        return t > 5 ? 'abort' : 'run';
      },
      wait(0.4),
      (dt, api) => {
        api.keyUp('KeyW');
        return 'next';
      },
      wait(2),
      (dt, api) => {
        if (A.g.items.heldBy(A.g.player)) api.tap('KeyQ');
        return 'next';
      },
    ]);
  }
}

// ------------------------------------------------------------------ momentos para capturar
const seen = { phase: '', bossState: '', bossVis: true, day: -1, playAt: -1, leaveAt: -1 };
function moments() {
  const h = H();
  const d = h.dayIndex + 1;
  const ph = phaseOf(wins[0]);
  if (ph !== seen.phase) {
    if (ph === 'play') seen.playAt = simT;
    if (ph === 'leaving') seen.leaveAt = simT;
    if (ph === 'evening') want(`d${d}-noite`);
    seen.phase = ph;
  }
  if (seen.playAt >= 0 && simT - seen.playAt > 1.5) {
    want(`d${d}-chegada`);
    seen.playAt = -1;
  }
  if (seen.leaveAt >= 0 && simT - seen.leaveAt > 2) {
    want(`d${d}-fim-do-dia`);
    seen.leaveAt = -1;
  }
  for (const x of wins) if (x.g.running && x.g.phase === 'lobby' && x.g.lobbyRide >= 0) want(`d${x.g.dayIndex + 1}-cabine-fechando-${x.i}`);
  const b = h.bosses[0];
  if (b && ph === 'play') {
    if (b.state === 'return' && seen.bossState !== 'return') want(`d${d}-chefe-voltando`);
    if (b.ball.root.visible && !seen.bossVis) want(`d${d}-chefe-voltou-do-elevador`);
    seen.bossState = b.state;
    seen.bossVis = b.ball.root.visible;
  }
}

// ------------------------------------------------------------------ telas entre os dias
const clickAt = wins.map(() => -1);
function screens() {
  for (const x of wins) {
    const s = x.w.PT.ui.screen();
    if (s === 'report' && x.g.results.length < DAYS) {
      // o host clica logo; os convidados leem o relatório mais devagar (um depois do outro)
      if (clickAt[x.i] < 0) clickAt[x.i] = simT + (x.host ? 1.5 : 3 + x.i * 2.5);
      else if (simT >= clickAt[x.i]) {
        clickAt[x.i] = -1;
        x.w.PT.ui.click('#b-next');
      }
    } else if (s !== 'report') clickAt[x.i] = -1;
    if (s === 'notice') {
      note(`${x.label}: aviso "${x.w.PT.ui.text().slice(0, 80)}"`);
      x.w.PT.ui.click('#n-ok');
    }
    if (s === 'pause') x.w.PT.ui.click('#b-res');
  }
}

// ------------------------------------------------------------------ laço
async function boot() {
  log('info', `sala ${room} · ${N} janelas · ${DAYS} dias · semente ${SEED}${PROVOKE ? '' : ' · sem provocações'}`);
  const t0 = performance.now();
  for (;;) {
    for (const x of wins) {
      x.w = x.f.contentWindow;
      x.g = x.w?.game ?? null;
    }
    if (wins.every((x) => x.g && x.w.step && x.g.net && x.g.net.members.length === N && x.g.running)) break;
    if (performance.now() - t0 > 90000) throw new Error(`as janelas não entraram na sala (${wins.map((x) => x.g?.net?.members.length ?? '-').join('/')})`);
    await sleep(300);
  }
  for (const x of wins) {
    await new Promise((res, rej) => {
      const s = x.w.document.createElement('script');
      s.src = '/tools/playtest/bot.js';
      s.onload = res;
      s.onerror = () => rej(new Error('bot.js não carregou'));
      x.w.document.head.append(s);
    });
    x.w.PT.init({ profile: PROFILES[x.i % PROFILES.length], accel: true, mp: true });
    // quem desenha é o passo; o relógio da interpolação passa a ser o da simulação
    x.w.frozen = 'off';
    x.w.simClock();
    hook(x);
  }
  log('info', `janelas prontas em ${((performance.now() - t0) / 1000).toFixed(0)} s: ${wins.map((x) => `${x.label} (${PROFILES[x.i % PROFILES.length]})`).join(', ')}`);
}

async function run() {
  const t0 = performance.now();
  let stop = 'terminou os dias';
  try {
    await boot();
    for (let k = 0; ; k++) {
      for (const x of wins) x.w.step(DT, FPS, false);
      simT += DT;
      // deixa o BroadcastChannel entregar o que cada janela mandou neste passo
      await sleep(1);
      trackPhases();
      moments();
      if (k % 5 === 0) {
        judge();
        judgeLater();
        director();
        screens();
        const h = H();
        statusEl.textContent = `dia ${h.dayIndex + 1} · ${phaseOf(wins[0])} ${clockTxt(h)} · jogo ${simT.toFixed(0)} s · real ${((performance.now() - t0) / 1000).toFixed(0)} s · violações ${[...rules.values()].reduce((a, r) => a + r.n, 0)}`;
        if (TRACE && k % 10 === 0) note(`trace ${wins.map((x) => `${x.label} ${phaseOf(x)} ${xz(x.g.player.ball.pos)}${x.w.PT.driving ? ' (dirigido)' : ''}`).join(' | ')}`);
        if (MAX_SIM && simT >= MAX_SIM) {
          stop = `parado em ${MAX_SIM} s (?maxsim)`;
          break;
        }
        if (wins.every((x) => x.g.results.length >= DAYS && !x.g.running)) break;
        if (wins.some((x) => x.w.PT.ui.screen() === 'final')) {
          stop = 'fim da run (sem vidas)';
          break;
        }
        if (simT > DAYS * 720 + 120) {
          stop = 'tempo de jogo esgotado (a sala não terminou os dias)';
          violate('travou', 'sala', stop);
          break;
        }
      }
      if (shotQueue.length) await flushShots();
    }
  } catch (e) {
    stop = `erro do robô: ${e.message}`;
    log('fail', `✘ ${stop}`);
  }
  want('final');
  await flushShots();
  const list = [...rules].map(([rule, r]) => ({ rule, n: r.n, list: r.list })).sort((a, b) => b.n - a.n);
  const total = list.reduce((a, r) => a + r.n, 0);
  log(total ? 'fail' : 'pass', `\n${stop} · ${simT.toFixed(0)} s de jogo em ${((performance.now() - t0) / 1000).toFixed(0)} s · ${total} violação(ões) em ${list.length} regra(s)`);
  window.soakResult = {
    ok: total === 0 && !stop.startsWith('erro'),
    stop, seed: SEED, n: N, days: DAYS, provoke: PROVOKE, simT: +simT.toFixed(1), realSec: Math.round((performance.now() - t0) / 1000),
    rules: list, events, provocations: prov.log, shots,
    players: wins.map((x) => ({ label: x.label, profile: PROFILES[x.i % PROFILES.length], days: x.g.results.length, fired: x.g.results.map((r) => r.fired), bot: x.w.PT.data.bugs.slice(0, 20), errors: x.w.PT.data.errors.slice(0, 10) })),
  };
}

// depuração no console: soak.wins[i].g é o jogo da janela i
window.soak = { wins, rules, events, get simT() { return simT; } };
document.getElementById('run').onclick = () => run();
if (qs.has('auto')) run();
