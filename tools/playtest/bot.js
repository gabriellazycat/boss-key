// Jogador-robô do BOSS KEY: roda DENTRO da página (precisa de ?debug, que expõe window.game).
// Joga com as teclas de verdade (WASD/E/ESPAÇO/F/G/T...), mas usa atalhos internos para o que um humano
// faz com o mouse: girar a câmera, mirar no monitor e arremessar bolinhas. Registra tudo em PT.data.
(() => {
  if (window.PT) return;
  const g = window.game;
  const V3 = g.player.ball.pos.constructor;
  const inp = g.input;
  const rnd = Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (m, s) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const range = ([a, b]) => a + rnd() * (b - a);
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ------------------------------------------------------------------ perfis de jogador
  // react: quando esconde o jogo (door = ao ouvir a porta; near = chefe a dangerDist m; late = em cima da hora, caçando clutch)
  const PROFILES = {
    // heist = chance de tentar o assalto a cada saída do chefe; ramal = chance de ligar o ramal falso antes de sair da mesa
    cauteloso: { react: 'door', reactDelay: [0.5, 1.1], dangerDist: 14, reopenDist: 16, playWhileOut: false, susTol: 45, beatSigma: 0.07, typeErr: 0.02, typeRate: [0.16, 0.28], aimErr: 0.08, throwErr: 0.12, closeBeforeStand: 1, cleanCrumbs: 1, physicalWhileOut: false, feastMax: 1, farm: 0.6, headphones: 0, skipElevator: 0.3, shop: 0.8, coffeeRelief: 0.9, hero: 0.9, chaos: 0, heist: 0.05, ramal: 0.9 },
    equilibrado: { react: 'near', reactDelay: [0.5, 1.3], dangerDist: 8, reopenDist: 11, playWhileOut: true, susTol: 65, beatSigma: 0.09, typeErr: 0.04, typeRate: [0.13, 0.24], aimErr: 0.12, throwErr: 0.18, closeBeforeStand: 0.9, cleanCrumbs: 0.7, physicalWhileOut: false, feastMax: 2, farm: 0.85, headphones: 0.3, skipElevator: 0.6, shop: 0.6, coffeeRelief: 0.6, hero: 0.6, chaos: 0, heist: 0.35, ramal: 0.8 },
    arriscado: { react: 'late', reactDelay: [0.12, 0.45], dangerDist: 3.2, reopenDist: 6, playWhileOut: true, susTol: 85, beatSigma: 0.12, typeErr: 0.06, typeRate: [0.1, 0.2], aimErr: 0.18, throwErr: 0.25, closeBeforeStand: 0.6, cleanCrumbs: 0.3, physicalWhileOut: true, feastMax: 4, farm: 1, headphones: 0.7, skipElevator: 0.9, shop: 0.4, coffeeRelief: 0.3, hero: 0.3, chaos: 0, heist: 0.8, ramal: 0.6, clutchGreed: 0.5 },
    caotico: { react: 'random', reactDelay: [0.1, 2.5], dangerDist: 6, reopenDist: 5, playWhileOut: true, susTol: 95, beatSigma: 0.25, typeErr: 0.15, typeRate: [0.06, 0.3], aimErr: 0.3, throwErr: 0.5, closeBeforeStand: 0.4, cleanCrumbs: 0.2, physicalWhileOut: true, feastMax: 6, farm: 0.7, headphones: 0.5, skipElevator: 0.5, shop: 0.5, coffeeRelief: 0.2, hero: 0.2, chaos: 1, heist: 0.5, ramal: 0.4, clutchGreed: 0.3 },
  };

  // ------------------------------------------------------------------ registro
  const data = { profile: null, opts: null, days: [], events: [], samples: [], errors: [], bugs: [], notes: [], fps: [] };
  let day = null;
  const bugSeen = new Set();
  function ev(type, x = {}) {
    data.events.push({ type, day: g.dayIndex, t: +g.time.toFixed(2), ...x });
  }
  function bug(key, msg, x = {}) {
    // cada tipo de problema entra uma vez por dia (o resumo conta as repetições)
    const k = `${g.dayIndex}:${key}`;
    if (bugSeen.has(k)) {
      const b = data.bugs.find((b) => b.k === k);
      if (b) b.n++;
      return;
    }
    bugSeen.add(k);
    data.bugs.push({ k, key, msg, day: g.dayIndex, t: +g.time.toFixed(1), n: 1, ...x });
  }
  window.addEventListener('error', (e) => data.errors.push({ day: g.dayIndex, t: g.time, msg: String(e.message), at: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => data.errors.push({ day: g.dayIndex, t: g.time, msg: String(e.reason) }));

  function newDay() {
    day = {
      day: g.dayIndex, events: [...g.dayEvents], fixed: g.tasks.fixed.kind, phone: [...g.tasks.kinds],
      funToday: g.funTasks.map((f) => f.id), boss: g.bosses[0]?.kind,
      goalTime: {}, modeTime: {}, appTime: {}, funBy: {}, switches: 0, idle: 0, deadIdle: 0, waitBoss: 0,
      doors: 0, checks: [], identifies: [], clutches: 0, closeCalls: 0, chases: 0, escapes: 0, hides: 0, flaggedSeen: 0,
      fired: null, answered: 0, tasksDone: 0, wrong: [], fixedDone: false, funDone: [], popups: {}, stuck: 0, fallbacks: {},
      firstFun: null, lastDoor: -99, peakSus: 0, susStart: g.player.sus, elevatorReal: 0, startReal: performance.now(),
      botsFired: [], fps: [], chefeBy: {},
      seenEp: 0, lastSeenT: -99, heists: 0, heistTries: 0, heistFired: 0, ramal: 0,
    };
    data.days.push(day);
  }

  // ------------------------------------------------------------------ ganchos no jogo
  function wrap(obj, name, { before, after } = {}) {
    const orig = obj[name];
    if (typeof orig !== 'function') return data.notes.push(`gancho ausente: ${name}`);
    obj[name] = function (...a) {
      const pre = before?.apply(this, a);
      const r = orig.apply(this, a);
      after?.call(this, r, pre, ...a);
      return r;
    };
  }
  const P = () => g.player;
  wrap(g, 'startDay', { after: () => { newDay(); bot.onNewDay(); } });
  wrap(g, 'onDoor', { after: (_, __, b) => { if (!day) return; day.doors++; day.lastDoor = g.time; ev('door', { boss: b.kind, why: b.rondaReason }); bot.onDoor(b); } });
  wrap(g, 'onCheckStart', {
    before: (b, w) => {
      if (w !== P() || !day) return;
      const c = { t: g.time, boss: b.kind, seated: w.seated, forbidden: g.isForbidden(w), warn: +(g.time - day.lastDoor).toFixed(2), sus: Math.round(w.sus) };
      day.checks.push(c);
    },
  });
  wrap(g, 'onIdentify', {
    before: (b, w, mode) => {
      if (w !== P() || !day) return;
      const since = g.time - g.computer.lastSafeSwitch;
      const x = { t: +g.time.toFixed(2), boss: b.kind, mode, seated: w.seated, forbidden: g.isForbidden(w), since: +since.toFixed(2), sus: Math.round(w.sus) };
      day.identifies.push(x);
      if (!x.forbidden && x.seated && since < 1.5) day.closeCalls++;
      if (x.forbidden && x.seated) day.flaggedSeen++;
      ev('identify', x);
    },
  });
  wrap(g, 'clutch', { after: () => { if (day) { day.clutches++; ev('clutch'); } } });
  wrap(g, 'fire', {
    before: (w, b, reason) => {
      if (w.fired || !day) return;
      if (w === P()) {
        const p = w.ball.pos;
        day.fired = { t: +g.time.toFixed(1), reason, by: b.kind, sus: Math.round(w.sus), lastDoor: +(g.time - day.lastDoor).toFixed(1), at: `${(p.x + 10).toFixed(1)},${(p.z + 12).toFixed(1)}`, goal: bot.goal?.name, goalId: bot.goal?.id ?? bot.goal?.kind, mode: g.pc.mode, boss: `${(b.pos.x + 10).toFixed(1)},${(b.pos.z + 12).toFixed(1)}` };
        ev('fired', day.fired);
      } else day.botsFired.push({ name: w.name, reason, t: +g.time.toFixed(1) });
    },
  });
  wrap(g, 'onPhoneAnswered', { after: (_, __, inst) => { if (day) { day.answered++; ev('answer', { kind: inst.kind }); } } });
  wrap(g, 'onTaskDone', { after: (_, __, t) => { if (day) { day.tasksDone++; ev('taskDone', { kind: t.kind, took: +t.t.toFixed(1) }); } } });
  wrap(g, 'onTaskWrong', { after: (_, __, why) => { if (day) { day.wrong.push(why); ev('wrong', { why }); } } });
  wrap(g, 'onFixedDone', { after: () => { if (day) { day.fixedDone = true; ev('fixedDone'); } } });
  wrap(g, 'onLostInBathroom', { after: () => day && day.escapes++ });
  wrap(g, 'funProgress', {
    before: (id) => g.funTasks.find((f) => f.id === id)?.done,
    after: (_, was, id) => {
      const f = g.funTasks.find((x) => x.id === id);
      if (day && f && f.done && !was) {
        day.funDone.push(id);
        ev('funDone', { id });
      }
    },
  });
  wrap(g, 'addFun', {
    before: (w) => (w === P() ? w.fun : null),
    after: (_, before, w, v, label) => {
      if (before === null || !day) return;
      const got = w.fun - before;
      if (got <= 0) return;
      const src = label === 'CLUTCH' ? 'clutch' : g.pc.mode === 'seated' && g.computer.app.forbidden ? g.computer.active : label ? String(label).toLowerCase() : g.pc.mode === 'walk' ? (bot.goal?.name ?? 'walk') : g.pc.mode;
      day.funBy[src] = (day.funBy[src] ?? 0) + got;
      if (day.firstFun === null) day.firstFun = +g.time.toFixed(1);
    },
  });
  // de onde vem a Suspeita "o chefe viu/ouviu": quem chamou addSus
  wrap(g, 'addSus', {
    before: (w, v, why = 'chefe') => {
      if (w !== P() || why !== 'chefe' || v <= 0 || !day || w.fired) return;
      // v0.8: "ele me viu/ouviu" é o susto da vez; subidas seguidas (menos de 4 s) contam como um episódio só
      if (g.time - day.lastSeenT > 4) day.seenEp++;
      day.lastSeenT = g.time;
      const frames = new Error().stack.split(/\r?\n/).slice(2, 8);
      const names = frames.map((l) => (l.match(/at (?:Game\.|Object\.|Player\.|Boss\.|obj\.)?([\w.<>]+)/) || [])[1]).filter((n) => n && !/^(before|obj|wrap|bossSus|addSus|anonymous|<computed>)$/.test(n));
      const k = names[0] ?? '?';
      day.chefeBy[k] = (day.chefeBy[k] ?? 0) + v;
    },
  });
  wrap(g, 'endDay', {
    after: () => {
      const r = g.results[g.results.length - 1];
      if (!day || !r) return;
      day.npc = g.workers.filter((w) => !w.isPlayer && !w.remote).map((w) => ({ n: w.name, sus: Math.round(w.sus), fired: w.fired }));
      Object.assign(day, { result: JSON.parse(JSON.stringify(r)), realMs: performance.now() - day.startReal });
      if (/sala do chefe/i.test(r.firedReason ?? '')) day.heistFired++;
      day.fps = summarizeFps();
    },
  });
  wrap(g.hud, 'popup', { after: (_, __, kind, title) => { if (day) day.popups[`${kind}:${title}`] = (day.popups[`${kind}:${title}`] ?? 0) + 1; } });
  for (const b of [g.chefe, g.x9, g.dono]) {
    wrap(b, 'startChase', { after: (_, __, w) => { if (w === P() && day) { day.chases++; ev('chase', { boss: b.kind }); } } });
  }

  // ------------------------------------------------------------------ teclado (eventos reais no window → Input do jogo)
  const held = new Set();
  const releaseAt = new Map();
  function keyDown(code) {
    if (held.has(code)) return;
    held.add(code);
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  }
  function keyUp(code) {
    if (!held.has(code)) return;
    held.delete(code);
    releaseAt.delete(code);
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  }
  /** Toque curto: aperta agora, solta dois quadros depois. */
  function tap(code) {
    if (held.has(code)) keyUp(code);
    keyDown(code);
    releaseAt.set(code, 2);
  }
  function releaseAll(except = []) {
    for (const c of [...held]) if (!except.includes(c)) keyUp(c);
  }
  function tickKeys() {
    for (const [c, n] of [...releaseAt]) {
      if (n <= 1) keyUp(c);
      else releaseAt.set(c, n - 1);
    }
  }

  // ------------------------------------------------------------------ cursor do monitor (atalho: no jogo é a mira da cabeça)
  let cursor = null;
  const origCompUpdate = g.computer.update.bind(g.computer);
  g.computer.update = (dt, time, sInp) => {
    if (cursor) {
      sInp = { ...sInp, x: cursor.x, y: cursor.y, down: cursor.down, pressed: cursor.pressed, released: cursor.released };
      cursor.pressed = false;
      cursor.released = false;
    }
    return origCompUpdate(dt, time, sInp);
  };
  function aim(x, y) {
    cursor ??= { x: 512, y: 320, down: false, pressed: false, released: false };
    cursor.x = clamp(x, 0, 1023);
    cursor.y = clamp(y, 0, 639);
  }
  function click(x, y) {
    aim(x, y);
    cursor.down = true;
    cursor.pressed = true;
    cursor.upIn = 2;
  }
  function tickCursor() {
    if (cursor?.upIn > 0 && --cursor.upIn === 0) {
      cursor.down = false;
      cursor.released = true;
    }
  }

  // ------------------------------------------------------------------ andar (nav do jogo + W segurado + câmera apontada)
  const nav = { path: [], goal: null, lastPos: null, still: 0, replans: 0, fails: 0 };
  function eye() {
    return g.r.camera.position;
  }
  function face(p, pitchFrom = 1.5) {
    const b = P().ball.pos;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    if (Math.hypot(dx, dz) > 0.05) g.pc.camYaw = Math.atan2(-dx, -dz);
    g.pc.camPitch = clamp(Math.atan2(pitchFrom - (p.y ?? 1), Math.max(0.3, Math.hypot(dx, dz))), -1.1, 1.1);
  }
  function stopWalk() {
    keyUp('KeyW');
    keyUp('ShiftLeft');
    nav.path = [];
    nav.goal = null;
  }
  /** Anda até `target`; 'arrived' | 'moving' | 'stuck'. */
  function walkTo(target, arriveR = 0.6, dt = 1 / 30, maxR = arriveR) {
    const p = P().ball.pos;
    // o alvo pode estar dentro de um móvel: vale chegar ao fim do caminho se já estiver ao alcance
    const end = nav.path.length <= 1 && nav.goal && d2(nav.goal, target) < 0.3;
    if (d2(p, target) < arriveR || (end && d2(p, target) < maxR && (!nav.path[0] || d2(p, nav.path[0]) < 0.5))) {
      stopWalk();
      return 'arrived';
    }
    if (!nav.goal || d2(nav.goal, target) > 0.3 || !nav.path.length) {
      nav.goal = new V3(target.x, 0, target.z);
      // hall do térreo (v0.8): fora da grade da navegação; o hall é aberto, só a porta da cabine do elevador é passagem
      if (g.office.inLobby(p)) {
        const door = new V3(5, 0, -45.2);
        const inCab = p.z < -46.5;
        const toCab = target.z < -46.5;
        nav.path = inCab !== toCab ? [door, nav.goal] : [nav.goal];
      } else nav.path = g.nav.find(new V3(p.x, 0, p.z), nav.goal) ?? [];
      nav.still = 0;
      nav.lastPos = p.clone();
    }
    while (nav.path.length > 1 && d2(p, nav.path[0]) < 0.45) nav.path.shift();
    const wp = nav.path[0] ?? target;
    const dx = wp.x - p.x;
    const dz = wp.z - p.z;
    g.pc.camYaw = Math.atan2(-dx, -dz);
    g.pc.camPitch = 0.12;
    const careful = g.pc.carrying === 'coffee';
    if (careful) keyDown('ShiftLeft');
    else keyUp('ShiftLeft');
    keyDown('KeyW');
    // preso? (o jogo cuida da colisão; aqui só medimos se avança)
    nav.still += dt;
    if (nav.still > 1.5) {
      const moved = d2(p, nav.lastPos);
      nav.lastPos = p.clone();
      nav.still = 0;
      if (moved < 0.25 && !g.pc.lockMove) {
        nav.replans++;
        nav.path = [];
        if (nav.replans >= 3) {
          nav.replans = 0;
          day && day.stuck++;
          bug('stuck', 'jogador-robô preso andando (colisão ou caminho da navegação passando por obstáculo)', { at: `${(p.x + 10).toFixed(1)},${(p.z + 12).toFixed(1)}`, to: `${(target.x + 10).toFixed(1)},${(target.z + 12).toFixed(1)}`, goal: bot.goal?.name });
          return 'stuck';
        }
      } else nav.replans = 0;
    }
    return 'moving';
  }

  // ------------------------------------------------------------------ interações (E de verdade; se o jogo escolher outra coisa, cai no atalho e anota)
  function its() {
    try {
      return g.pc.interactables();
    } catch (e) {
      bug('interactables-throw', `pc.interactables() lançou erro: ${e.message}`);
      return [];
    }
  }
  function findIt(test) {
    return its().find((it) => (typeof test === 'string' ? it.id === test : test(it)));
  }
  function objPos(it) {
    const o = it.obj?.[0];
    return o ? o.getWorldPosition(new V3()) : it.pos.clone().setY(1);
  }
  /**
   * Usa um interagível: anda até ele, encara, aperta/segura E até `done()` ficar verdadeiro.
   * Devolve 'done' | 'run' | 'fail'.
   */
  const blocked = {};
  const isBlocked = (id) => (blocked[id] ?? -1) > g.time;
  function use(st, test, done, dt) {
    const it = findIt(test);
    if (it && isBlocked(it.id)) return 'fail';
    if (done()) {
      keyUp('KeyE');
      return 'done';
    }
    if (!it) {
      keyUp('KeyE');
      return 'fail';
    }
    const target = it.pos;
    // "já cheguei" velho: se o alvo ficou longe, volta a andar
    if (st.phase === 'act' && d2(P().ball.pos, target) > it.r + 0.3) st.phase = null;
    if (st.phase !== 'act') {
      const r = walkTo(target, it.needView ? 0.45 : Math.min(it.r * 0.55, 1.1), dt, it.needView ? 0.8 : it.r - 0.15);
      if (r === 'stuck') return 'fail';
      if (r !== 'arrived') return 'run';
      st.phase = 'act';
      st.actT = 0;
    }
    face(objPos(it));
    st.actT += dt;
    if (!it.ok()) {
      keyUp('KeyE');
      return st.actT > 3 ? 'fail' : 'run';
    }
    if (it.hold > 0) keyDown('KeyE');
    else if (st.actT < dt * 1.5 || (st.actT > 0.5 && Math.floor(st.actT / 0.5) !== Math.floor((st.actT - dt) / 0.5))) tap('KeyE');
    if (st.actT > it.hold + 1.6) {
      // o E não pegou: o jogo mostrou outra ação (ou nenhuma). Anota o que apareceu na tela e desiste por um tempo
      keyUp('KeyE');
      const label = String(it.label).replace(/<[^>]+>/g, '').replace(/^E/, '');
      const shown = (document.querySelector('#ui .prompt')?.innerText ?? '').split('\n')[0].replace(/^E/, '') || '(nenhum aviso)';
      const k = it.id.replace(/\d+$/, '');
      day && (day.fallbacks[k] = (day.fallbacks[k] ?? 0) + 1);
      bug(`interact-${k}`, `E não acionou "${label}" com o jogador ao lado; a tela mostrava "${shown}"`, { mode: g.pc.mode, shown });
      if (data.opts?.fallback) {
        it.act();
        st.actT = 0;
        return done() ? 'done' : 'run';
      }
      blocked[it.id] = g.time + 20;
      return 'fail';
    }
    return 'run';
  }

  // ------------------------------------------------------------------ percepção do perigo
  const deskPos = () => P().desk.seat;
  function bossInfo() {
    const out = [];
    for (const b of g.bosses) {
      if (!b.ball.root.visible) continue;
      const atHome = b.state === 'office' || b.state === 'wait' || b.state === 'leave';
      out.push({ b, kind: b.kind, st: b.state, out: !atHome, dDesk: d2(b.pos, deskPos()), dMe: d2(b.pos, P().ball.pos), chasingMe: b.chaseW === P(), toMe: b.cur?.kind === 'desk' && b.cur.w === P() });
    }
    return out;
  }
  function anyOut() {
    return bossInfo().some((x) => x.out);
  }

  // ------------------------------------------------------------------ o robô
  const STATE_GOALS = ['lobby', 'leaving', 'evening', 'elevator', 'ghost', 'wait', 'flee', 'nap', 'chair', 'hideStall', 'meetingCall', 'phone', 'task', 'sit'];
  const bot = {
    prof: null,
    profName: '',
    goal: null,
    thinkT: 0,
    hideAt: -1,
    hidden: false,
    reopenT: 0,
    lastForbidden: null,
    elevPlan: null,
    chaosT: 3,
    sampleT: 0,
    prevFun: 0,
    lastMode: null,
    modeSince: 0,
    beat: { off: 0, prev: 0 },
    typeT: 0,
    tiro: { moveT: 0 },
    pesca: { biteT: -1 },
    feastEaten: 0,
    failedFun: {},
    dayPlan: {},
    pauseSeen: 0,

    onNewDay() {
      if (!this.prof) return;
      this.goal = null;
      this.hideAt = -1;
      this.hidden = false;
      this.reopenT = 0;
      this.feastEaten = 0;
      this.failedFun = {};
      this.prevFun = 0;
      this.elevPlan = { skip: rnd() < this.prof.skipElevator, shop: rnd() < this.prof.shop, shopDone: false, readyAt: range([1, 4]) };
      this.dayPlan = { coffeeLeft: 4 };
      releaseAll();
      stopWalk();
      cursor = null;
      if (this.prof.headphones > rnd() && g.headphones) g.toggleHeadphones();
    },

    onDoor(b) {
      if (!this.prof) return;
      // cauteloso esconde ao ouvir a porta (depois do tempo de reação)
      if (this.prof.react === 'door' && g.computer.forbiddenOpen && g.pc.mode === 'seated') this.scheduleHide();
    },

    scheduleHide(fast = false) {
      if (this.hideAt >= 0) return;
      let [a, b] = this.prof.reactDelay;
      if (g.headphones) [a, b] = [a * 1.5, b * 1.5];
      this.hideAt = g.time + (fast ? Math.min(0.35, a) : range([a, b]));
    },

    /** Reflexo, roda todo quadro: esconder o jogo / reabrir. */
    reflex(dt) {
      if (g.pc.mode !== 'seated') {
        this.hideAt = -1;
        return;
      }
      const forbidden = g.computer.forbiddenOpen;
      const bi = bossInfo();
      const near = bi.filter((x) => x.out).sort((a, b) => a.dDesk - b.dDesk)[0];
      const checkingMe = bi.some((x) => x.st === 'check' && x.dDesk < 3);
      if (forbidden) {
        this.lastForbidden = g.computer.active;
        if (checkingMe) this.scheduleHide(true); // "ELE VIU!": fecha na hora
        else if (near) {
          const r = this.prof.react;
          const lim = r === 'random' ? (this.chaosDanger ??= range([1.5, 9])) : this.prof.dangerDist;
          // clutch de propósito: deixa o chefe chegar e só fecha quando ele começa a conferir (o batimento)
          this.greedy ??= rnd() < (this.prof.clutchGreed ?? 0);
          if (!this.greedy && (r === 'door' || near.dDesk < lim || (near.toMe && near.dDesk < lim * 1.6))) this.scheduleHide();
        }
        if (!near) this.greedy = null;
        if (this.hideAt >= 0 && g.time >= this.hideAt) {
          // caótico às vezes "esquece" de esconder
          if (this.prof.chaos && rnd() < 0.12 && !checkingMe) this.hideAt = g.time + 1.5;
          else {
            tap('Space');
            this.hideAt = -1;
            this.hidden = true;
            this.chaosDanger = null;
            this.reopenT = 0;
          }
        }
      } else {
        this.hideAt = -1;
      }
    },

    /** Dá para sair da mesa sem álibi agora? */
    bossCalm() {
      const bi = bossInfo().filter((x) => x.out);
      if (!bi.length) return true;
      if (this.prof.physicalWhileOut) return bi.every((x) => x.dMe > 5 && x.st !== 'check');
      if (!this.prof.playWhileOut) return false;
      return bi.every((x) => x.dDesk > this.prof.reopenDist && x.dMe > this.prof.reopenDist && !x.toMe && x.st !== 'check');
    },

    safeToPlay() {
      const bi = bossInfo().filter((x) => x.out);
      if (!bi.length) return true;
      if (!this.prof.playWhileOut) return false;
      return bi.every((x) => x.dDesk > this.prof.reopenDist && !x.toMe && x.st !== 'check');
    },

    // -------------------------------------------------------------- decisão
    choose() {
      const p = P();
      const pr = this.prof;
      const mode = g.pc.mode;
      if (g.phase === 'lobby') return { name: 'lobby', pri: 100 };
      if (g.phase === 'evening') return { name: 'evening', pri: 100 };
      if (g.phase === 'leaving') return { name: 'leaving', pri: 100 };
      if (g.phase === 'elevator') return { name: 'elevator', pri: 100 };
      if (p.fired) return { name: 'ghost', pri: 100 };
      if (mode === 'cinematic') return { name: 'wait', pri: 100 };
      const bi = bossInfo();
      if (bi.some((x) => x.chasingMe)) return { name: 'flee', pri: 99 };
      if (g.tasks.picker) return { name: 'task', pri: 95, kind: 'cafe' };
      if (g.tasks.meeting) return { name: 'task', pri: 95, kind: 'reuniao' };
      if (mode === 'chair') return { name: 'chair', pri: 94 };
      if (mode === 'nap') return { name: 'nap', pri: 90 };
      if (mode === 'hide') return { name: 'hideStall', pri: 94 };
      if (g.meetingCall && g.meetingCall.phase === 'gather') return { name: 'meetingCall', pri: 92 };
      if (g.pc.carrying === 'coffee' && !g.pc.bossCoffee) return { name: 'coffee', pri: 88 };
      if (g.tasks.ringing) return { name: 'phone', pri: 85 };
      // relatório com a impressora travada: destrava primeiro (o passo de imprimir só aparece depois)
      if (g.printerJam > 0 && g.tasks.active.some((x) => x.kind === 'relatorio')) return { name: 'hero', pri: 81, id: 'jam' };
      const t = g.tasks.active.find((x) => !isBlocked(this.taskStepId(x)));
      if (t) return { name: 'task', pri: 80, kind: t.kind };
      // assalto: o chefe saiu e está longe; decide uma vez por saída dele
      if (this.wantsHeist(bi)) return { name: 'heist', pri: 78 };
      // v0.10: missão grande — na ausência longa (a janela da agenda) ou calmo e ousado; com item na mão, termina
      if (!g.missions.done && !isBlocked('missao')) {
        const main = g.bosses[0];
        const holding = !!g.items.heldBy(p);
        if (holding || main?.away || (this.bossCalm() && rnd() < pr.heist * 0.05)) return { name: 'missao', pri: holding ? 83 : 77 };
      }
      // desistiu do assalto (ou já pegou): não fica na sala do chefe esperando ele voltar
      if (g.office.inBossRoom(p.ball.pos)) return { name: 'sit', pri: 79, why: 'sair da sala do chefe' };
      // sem álibi com o chefe rondando: volta pra mesa
      const out = bi.some((x) => x.out && x.dMe < 13);
      const awayFromDesk = d2(p.ball.pos, p.desk.standPos) > 2.6;
      if (out && awayFromDesk && mode === 'walk' && !g.pc.carrying && (!pr.physicalWhileOut || p.sus > 70)) return { name: 'sit', pri: 75, why: 'chefe fora' };
      const calm = this.bossCalm();
      // eventos de herói (baixam a Suspeita)
      if (g.printerJam > 0 && (calm || pr.physicalWhileOut) && rnd() < pr.hero) return { name: 'hero', pri: 70, id: 'jam' };
      if (g.blackout && (calm || pr.physicalWhileOut) && rnd() < pr.hero) return { name: 'hero', pri: 70, id: 'breaker' };
      // Suspeita alta: trabalho/café
      if (p.sus > pr.susTol) {
        if (!g.tasks.fixedDone) return { name: 'fixed', pri: 65 };
        if (calm && this.dayPlan.coffeeLeft > 0 && g.coffeeMachineCd <= 0 && g.coffeePlayerCd <= 0 && rnd() < pr.coffeeRelief) return { name: 'coffee', pri: 64 };
      }
      if (calm && g.pizzaLeft > 0 && this.feastEaten < pr.feastMax && !(g.feast === 'pizza' && this.feastEaten >= 2 && pr.feastMax < 4)) return { name: 'feast', pri: 55 };
      // fixa: o cauteloso faz primeiro; os outros quando passou da metade do dia
      const fixedUrgent = !g.tasks.fixedDone && (pr.react === 'door' || g.time > g.duration * (pr.react === 'late' ? 0.55 : 0.4));
      if (fixedUrgent) return { name: 'fixed', pri: 50 };
      // v0.10: a pauta andando também é cota (obrigatória); com o lote/documento na mão, termina primeiro
      const pautaLeft = (g.tasks.pauta ?? []).find((x) => x.prog < x.goal && !isBlocked(`pauta-${x.kind}`));
      if (pautaLeft && g.pc.carrying === 'doc') return { name: 'pauta', pri: 82, kind: pautaLeft.kind };
      if (pautaLeft && (calm || pr.physicalWhileOut) && g.time > g.duration * (pr.react === 'door' ? 0.1 : 0.3)) return { name: 'pauta', pri: 52, kind: pautaLeft.kind };
      const fun = this.nextFun();
      if (fun) return { name: 'fun', pri: 40, id: fun };
      if (!g.tasks.fixedDone) return { name: 'fixed', pri: 35 };
      const farm = this.farmOption();
      if (farm && rnd() < pr.farm) return { name: 'fun', pri: 30, id: farm, farm: true };
      if (calm && p.sus > 25 && this.dayPlan.coffeeLeft > 0 && g.coffeeMachineCd <= 0 && g.coffeePlayerCd <= 0) return { name: 'coffee', pri: 25 };
      return { name: 'idle', pri: 0 };
    },

    /** Sala do chefe aberta (todas as chefias fora e longe) e o perfil topa: rola uma vez por saída. */
    wantsHeist(bi) {
      if (!g.heistPrize?.visible || g.pc.carrying || g.phase !== 'play') return false;
      const chiefs = bi.filter((x) => x.kind !== 'dono');
      // num dia de X9 o chefe fica sentado na sala (fora de `bosses`)
      const chefeHome = !g.bosses.includes(g.chefe) && g.chefe.ball.root.visible && !g.chefe.out;
      if (!chiefs.length || chefeHome || chiefs.some((x) => !x.out)) {
        this.heistRoll = null;
        return false;
      }
      if (this.goal?.name === 'heist' && !this.goal.finished) return true;
      // zera quando alguém da chefia está em casa (acima): então rola de novo a cada saída
      this.heistRoll ??= { go: rnd() < this.prof.heist };
      // como um jogador atento: a porta dele fica aberta enquanto ele está fora, então só vai com a chefia longe da porta
      const door = g.office.P.bossDoor;
      return this.heistRoll.go && chiefs.every((x) => x.dMe > 9 && d2(x.b.pos, door) > 14 && !x.toMe && x.st !== 'check' && !x.chasingMe);
    },

    /** Diversão do dia ainda não concluída que dá para fazer agora. */
    nextFun() {
      const list = g.funTasks.filter((f) => !f.done && !((this.failedFun[f.id] ?? -1) > g.time));
      const bigFirst = list.sort((a, b) => Number(b.big) - Number(a.big));
      for (const f of bigFirst) if (this.funAvailable(f.id)) return f.id;
      return null;
    },
    funAvailable(id) {
      const st = g.stock;
      const pc = ['tiro', 'pesca', 'video'];
      if (pc.includes(id)) {
        if (g.computer.offline || !g.computer.unlocked.includes(id)) return false;
        if (id === 'tiro') return st.tiro > 0 && (g.tiroCooldown <= 0 || g.computer.tiro.state === 'play') && g.earnedLeft(P(), 'tiro') > 0;
        if (id === 'pesca') return st.pesca > 0;
        return st.video > 0.5;
      }
      if (id !== 'lanche' && !this.bossCalm()) return false;
      switch (id) {
        case 'soneca':
          return g.earnedLeft(P(), 'soneca') > 0 && !g.bots.spot('sofa').busy;
        case 'cadeira':
          return st.cadeira > 0 && g.pc.chairCd <= 0;
        case 'lanche':
          return st.lanche > 0;
        case 'maquina':
          return st.maquina > 0;
        case 'fofoca':
          return st.fofoca > 0 && ['fofoca1', 'fofoca2'].some((s) => g.bots.spot(s).busy && !g.bots.spot(s).busy.isPlayer);
        case 'cestas':
        case 'bonk':
          return g.paperAllowed && (g.pc.paperHeld > 0 || g.pc.pile.count > 0);
        case 'bonkChefe':
          // só quem topa risco vai atrás do chefe
          return this.prof.physicalWhileOut && g.paperAllowed && (g.pc.paperHeld > 0 || g.pc.pile.count > 0) && bossInfo().some((x) => x.out && x.st !== 'chase');
        case 'vidro':
          return true;
      }
      return false;
    },
    /** Depois das diversões do dia, mais FUN (é o placar). */
    farmOption() {
      const opts = [];
      const st = g.stock;
      const c = g.computer;
      if (!c.offline) {
        if (c.unlocked.includes('pesca') && st.pesca > 0) opts.push('pesca');
        if (c.unlocked.includes('video') && st.video > 0.5 && g.earnedLeft(P(), 'video') > 0) opts.push('video');
        if (c.unlocked.includes('tiro') && st.tiro > 0 && g.tiroCooldown <= 0 && g.earnedLeft(P(), 'tiro') > 0) opts.push('tiro');
      }
      const calm = this.bossCalm();
      if (g.canFun('maquina') && st.maquina > 0 && calm) opts.push('maquina');
      if (g.canFun('lanche') && st.lanche > 0) opts.push('lanche');
      if (g.canFun('cadeira') && st.cadeira > 0 && g.pc.chairCd <= 0 && calm) opts.push('cadeira');
      if (g.canFun('soneca') && g.earnedLeft(P(), 'soneca') > 0 && calm) opts.push('soneca');
      if (g.canFun('fofoca') && this.funAvailable('fofoca')) opts.push('fofoca');
      return opts.length ? pick(opts) : null;
    },

    // -------------------------------------------------------------- execução
    tick(dt) {
      if (!this.prof || !g.running) {
        releaseAll();
        return;
      }
      tickKeys();
      tickCursor();
      this.sample(dt);
      if (data.opts?.passive) return;
      // v0.10: minigames no painel — o robô "joga" por um tempo do perfil e resolve (o caótico às vezes larga com Q)
      if (g.minigame?.open) {
        this.mgT = (this.mgT ?? 0) + dt;
        this.mgNeed ??= 1.5 + rnd() * 3 * (this.prof.chaos ? 1.6 : 1);
        if (this.mgT >= this.mgNeed) {
          if (this.prof.chaos && rnd() < 0.15) g.minigame.close(true);
          else g.minigame.solve();
          this.mgT = 0;
          this.mgNeed = null;
          ev('minigame', { kind: g.minigame.kind });
        }
        return;
      }
      if (g.phase !== 'elevator' && held.has('Space') && !releaseAt.has('Space')) keyUp('Space');
      if (g.paused && ui.screen() === 'pause') {
        // o caótico apertou P: volta ao trabalho depois de um tempinho
        this.pauseSeen += 1 / 30;
        if (this.pauseSeen > 1) {
          this.pauseSeen = 0;
          ev('resume');
          ui.click('#b-res');
        }
        return;
      }
      if (g.paused || g.shopOpen) return;
      this.reflex(dt);
      if (this.prof.chaos) this.chaos(dt);
      this.thinkT -= dt;
      if (this.thinkT <= 0 || !this.goal || this.goal.finished) {
        this.thinkT = 0.25;
        const want = this.choose();
        const cur = this.goal;
        const same = cur && cur.name === want.name && cur.id === want.id && cur.kind === want.kind;
        // objetivos presos a um estado do jogo (elevador, telefone, fuga...) acabam quando o estado some
        const stateGoal = cur && STATE_GOALS.includes(cur.name);
        if (!same && (!cur || want.pri > cur.pri || cur.finished || stateGoal)) this.switchGoal(want);
      }
      const gl = this.goal;
      if (!gl) return;
      if (day) {
        day.goalTime[gl.name] = (day.goalTime[gl.name] ?? 0) + dt;
        if (gl.name === 'idle') {
          day.idle += dt;
          if (!this.anythingLeft()) day.deadIdle += dt;
        }
        if (gl.waitingBoss) day.waitBoss += dt;
      }
      let r;
      try {
        r = this[`g_${gl.name}`](gl, dt);
      } catch (e) {
        bug(`bot-${gl.name}`, `erro no robô ao executar ${gl.name}: ${e.message}`);
        r = 'fail';
      }
      if (r === 'done' || r === 'fail') {
        gl.finished = true;
        if (r === 'fail' && gl.name === 'fun') this.failedFun[gl.id] = g.time + 30;
        if (r === 'fail') ev('goalFail', { goal: gl.name, id: gl.id ?? gl.kind });
        stopWalk();
        keyUp('KeyE');
      }
    },

    /** Ainda há algo útil hoje, mesmo que agora seja preciso esperar o chefe? */
    anythingLeft() {
      const keep = this.bossCalm;
      this.bossCalm = () => true;
      try {
        return !g.tasks.fixedDone || g.funTasks.some((f) => !f.done && this.funAvailable(f.id)) || !!this.farmOption();
      } finally {
        this.bossCalm = keep;
      }
    },

    switchGoal(want) {
      const cur = this.goal;
      if (cur) cur.leave?.();
      // tirar o pé de todas as teclas de movimento e dos apps
      releaseAll();
      stopWalk();
      if (cursor) cursor.down = false;
      // ramal falso (R sentado): antes de sair da mesa para uma diversão longe ou para o assalto
      const leaving = want.name === 'heist' || (want.name === 'fun' && !['tiro', 'pesca', 'video', 'lanche'].includes(want.id));
      if (leaving && g.pc.mode === 'seated' && g.ramalLeft > 0 && !g.computer.typing && rnd() < this.prof.ramal) {
        tap('KeyR');
        ev('ramal', { why: want.id ?? want.name });
        if (day) day.ramal++;
      }
      this.goal = { ...want, st: {}, t0: g.time };
      if (day) day.switches++;
    },

    /** Assalto: entra na sala do chefe, segura E no prêmio e sai. Desiste se alguém da chefia voltar ou chegar perto. */
    g_heist(gl, dt) {
      if (g.pc.mode === 'seated') return this.standUp();
      if (g.pc.mode !== 'walk') return 'fail';
      if (!g.heistPrize.visible) return 'done';
      if (!gl.st.counted) {
        gl.st.counted = true;
        if (day) day.heistTries++;
      }
      const danger = bossInfo().some((x) => x.kind !== 'dono' && (!x.out || x.dMe < 6 || x.toMe || x.chasingMe));
      if (danger) return 'fail';
      gl.st.u ??= {};
      if (!findIt('heist')) {
        const r = walkTo(g.heistPrize.position, 0.9, dt, 1.5);
        return r === 'stuck' ? 'fail' : 'run';
      }
      const r = use(gl.st.u, 'heist', () => !g.heistPrize.visible, dt);
      if (r === 'done') {
        if (day) day.heists++;
        ev('heist', { t: g.time });
      }
      return r;
    },

    // -------------------------------------------------------------- helpers de mesa
    /** Garante sentado no próprio PC. 'done' quando sentado. */
    seat(gl, dt) {
      if (g.pc.mode === 'seated') return 'done';
      if (g.pc.mode !== 'walk') {
        tap('KeyE');
        return 'run';
      }
      gl.st.seat ??= {};
      return use(gl.st.seat, 'sit', () => g.pc.mode === 'seated', dt);
    },
    standUp() {
      if (g.pc.mode !== 'seated') {
        keyUp('KeyE');
        return 'done';
      }
      // levantar com o chefe atrás da cadeira = esbarrão: espera ele sair
      if (bossInfo().some((x) => x.out && x.dDesk < 3.2)) return 'run';
      // fechar o jogo antes de levantar (o chefe pune jogo aberto na mesa vazia)
      if (g.computer.forbiddenOpen && rnd() < this.prof.closeBeforeStand) {
        this.openApp('planilha');
        return 'run';
      }
      if (g.computer.typing) {
        // digitando e-mail o E é letra: segurar o E levanta (como a tela do e-mail diz)
        keyDown('KeyE');
        return 'run';
      }
      keyUp('KeyE');
      tap('KeyE');
      return 'run';
    },
    /** Abre um app clicando no botão da barra de tarefas (cai no atalho se o botão não existir). */
    openApp(id) {
      const c = g.computer;
      // 'planilha' = "a janela segura": nos dias de e-mail, totais ou slides é o app Trabalho
      if (id === 'planilha') id = c.home;
      if (c.active === id) return true;
      if (id === c.home && c.forbiddenOpen) {
        tap('Space');
        return false;
      }
      const b = c.btns?.find((x) => x.id === id);
      if (b) click(b.r.x + b.r.w / 2, b.r.y + b.r.h / 2);
      else {
        bug('no-taskbar-btn', `sem botão "${id}" na barra de tarefas`);
        c.open(id, g.time);
      }
      return false;
    },

    // -------------------------------------------------------------- objetivos
    g_wait() {
      return 'run';
    },
    // v0.8: de manhã o dia começa no hall — anda até a cabine do elevador (o jogo sobe sozinho quando você entra)
    g_lobby(gl, dt) {
      const cab = new V3(5, 0, -49.6);
      const r = walkTo(cab, 0.5, dt);
      if (r === 'stuck') g.skipElevator();
      return 'run';
    },
    // 18:00: anda até a cabine do elevador do escritório (a porta fecha e desce sozinha)
    g_leaving(gl, dt) {
      const cab = new V3(5, 0, -9.2);
      const r = walkTo(cab, 0.5, dt);
      if (r === 'stuck') g.skipElevator();
      return 'run';
    },
    // à noite: compra (conforme o perfil) o que der com o vale e vai para casa pela porta da rua
    g_evening(gl, dt) {
      gl.st.t = (gl.st.t ?? 0) + dt;
      if (gl.st.t < 2) return 'run';
      gl.st.plan ??= g.shop.offers.map((id, i) => ({ i, id })).filter(() => rnd() < this.prof.shop);
      const next = gl.st.plan.find((o) => !o.tried && !g.shop.soldOut(o.id) && g.wallet >= g.shop.price(o.id));
      if (next) {
        gl.st.u ??= {};
        next.before ??= g.shop.count(next.id);
        const r = use(gl.st.u, `buy${next.i}`, () => g.shop.count(next.id) > next.before, dt);
        if (r !== 'run') {
          next.tried = true;
          if (r === 'done') ev('buy', { id: next.id, wallet: g.wallet });
          gl.st.u = {};
        }
        return 'run';
      }
      gl.st.h ??= {};
      const r = use(gl.st.h, 'home', () => g.phase !== 'evening', dt);
      if (r === 'fail' && gl.st.t > 25) g['goHome']();
      return 'run';
    },
    g_elevator(gl, dt) {
      const ep = (this.elevPlan ??= { skip: false, shop: false, shopDone: true, readyAt: 2 });
      if (g.net) {
        if (!g.net.ready && g.time >= 0 && (gl.st.t = (gl.st.t ?? 0) + dt) > ep.readyAt) g.net.setReady(true);
        return 'run';
      }
      gl.st.t = (gl.st.t ?? 0) + dt;
      if (ep.shop && !ep.shopDone && g.dayIndex > 0 && gl.st.t > 1) {
        ep.shopDone = true;
        tap('KeyL');
        return 'run';
      }
      if (ep.skip && g.dayIndex > 0 && gl.st.t > 2.5) keyDown('Space');
      return 'run';
    },
    g_ghost(gl, dt) {
      gl.st.t = (gl.st.t ?? 0) + dt;
      // ENTER (acelerar ×6) como fantasma explode as molas dos rostos e trava a aba: só com --ghost-ff
      if (!gl.st.ff && !g.net && data.opts?.ghostFF) {
        gl.st.ff = true;
        tap('Enter');
      }
      if (g.net && gl.st.t > 8) {
        gl.st.t = 0;
        if (bossInfo().some((x) => x.out)) tap('KeyF');
      }
      return 'run';
    },
    g_flee(gl, dt) {
      // corre para a própria mesa (ou cabine do banheiro, se estiver mais perto)
      const p = P().ball.pos;
      if (g.pc.mode === 'seated') return 'done';
      if (g.pc.mode !== 'walk') {
        tap('KeyE');
        return 'run';
      }
      if (!gl.st.target) {
        const wc = g.office.baths.map((b, i) => ({ id: `wc${i}`, d: d2(p, b.stallFront) })).sort((a, b) => a.d - b.d)[0];
        gl.st.target = wc && wc.d + 3 < d2(p, P().desk.standPos) && g.pc.hideCd <= 0 && !g.pc.carrying ? wc.id : 'sit';
        ev('flee', { to: gl.st.target });
      }
      gl.st.u ??= {};
      return use(gl.st.u, gl.st.target, () => g.pc.mode === 'seated' || g.pc.mode === 'hide', dt);
    },
    g_hideStall() {
      // fica até o tempo da cabine acabar (o jogo tira sozinho)
      if (day && !this._hidCount) {
        this._hidCount = true;
        day.hides++;
      }
      return 'run';
    },
    g_nap(gl, dt) {
      gl.st.t = (gl.st.t ?? 0) + dt;
      const danger = bossInfo().some((x) => x.out && x.dMe < (this.prof.physicalWhileOut ? 5 : 12));
      if (danger || gl.st.t > 25) {
        tap('KeyE');
        return 'done';
      }
      return 'run';
    },
    g_chair(gl, dt) {
      // pilota: W o tempo todo e vira quando trava
      gl.st.t = (gl.st.t ?? 0) + dt;
      keyDown('KeyW');
      const sp = g.pc.chairSpeed;
      gl.st.turnT = (gl.st.turnT ?? 0) - dt;
      if (sp < 2 && gl.st.t > 0.6 && gl.st.turnT <= 0) {
        gl.st.turnT = 0.5;
        gl.st.dir = rnd() < 0.5 ? 'KeyA' : 'KeyD';
      }
      if (gl.st.turnT > 0) keyDown(gl.st.dir);
      else {
        keyUp('KeyA');
        keyUp('KeyD');
      }
      if (bossInfo().some((x) => x.out && x.dMe < 8) && !this.prof.physicalWhileOut) {
        tap('KeyE');
        return 'done';
      }
      return g.pc.mode === 'chair' ? 'run' : 'done';
    },
    g_meetingCall(gl, dt) {
      if (g.pc.mode === 'seated') return this.standUp();
      const sp = g.office.P.speaker;
      const r = walkTo(sp, 2.2, dt);
      return r === 'stuck' ? 'fail' : 'run';
    },
    g_phone(gl, dt) {
      if (!g.tasks.ringing) return 'done';
      gl.st.t = (gl.st.t ?? 0) + dt;
      if (gl.st.t < (gl.st.delay ??= range([0.4, 1.4]))) return 'run';
      if (g.pc.mode === 'seated') {
        if (g.computer.typing) tap('Enter');
        else tap('KeyT');
        return 'run';
      }
      gl.st.u ??= {};
      return use(gl.st.u, 'phone', () => !g.tasks.ringing, dt);
    },
    g_sit(gl, dt) {
      gl.waitingBoss = true;
      const r = this.seat(gl, dt);
      if (r !== 'done') return r;
      this.openApp('planilha');
      return 'done';
    },
    g_idle(gl, dt) {
      // sem nada para fazer: sentado na planilha
      const r = this.seat(gl, dt);
      if (r !== 'done') return r;
      if (g.computer.active !== 'planilha') this.openApp('planilha');
      gl.st.t = (gl.st.t ?? 0) + dt;
      return gl.st.t > 3 ? 'done' : 'run';
    },
    g_hero(gl, dt) {
      if (g.pc.mode === 'seated') return this.standUp();
      gl.st.u ??= {};
      const done = () => (gl.id === 'jam' ? g.printerJam <= 0 : !g.blackout);
      return use(gl.st.u, gl.id, done, dt);
    },
    g_feast(gl, dt) {
      if (g.pc.mode === 'seated') return this.standUp();
      gl.st.u ??= {};
      gl.st.left0 ??= g.pizzaLeft;
      const r = use(gl.st.u, 'pizza', () => g.pizzaLeft < gl.st.left0 || g.pizzaLeft <= 0, dt);
      if (r === 'done') this.feastEaten++;
      return r;
    },
    g_coffee(gl, dt) {
      // café solto: pega na máquina e entrega na bandeja do chefe (−Suspeita)
      if (g.pc.mode === 'seated') return this.standUp();
      gl.st.u ??= {};
      if (g.pc.carrying !== 'coffee') {
        if (gl.st.got) return 'done';
        const r = use(gl.st.u, 'coffee', () => g.pc.carrying === 'coffee', dt);
        if (r === 'done') {
          gl.st.got = true;
          gl.st.u = {};
          this.dayPlan.coffeeLeft--;
          return 'run';
        }
        return r;
      }
      gl.st.got = true;
      gl.st.u2 ??= {};
      return use(gl.st.u2, 'tray', () => g.pc.carrying !== 'coffee', dt);
    },
    /** v0.10: missão grande — usa a interação de missão mais perto (revistar, gaveta, esconder, entregar, pegar o item). */
    g_missao(gl, dt) {
      const M = g.missions;
      if (M.done) return 'done';
      if (g.pc.mode === 'seated') return this.standUp();
      const key = `${M.step}|${M.searched}|${M.count}|${g.items.heldBy(P()) ? 1 : 0}|${g.surv.codeKnown}|${g.surv.unlocked}`;
      if (gl.st.key !== key) {
        gl.st.key = key;
        gl.st.u = {};
        gl.st.target = null;
        gl.st.t = 0;
      }
      gl.st.t += dt;
      if (gl.st.t > 25) {
        blocked.missao = g.time + 20;
        return 'fail';
      }
      if (!gl.st.target) {
        const me = P().ball.pos;
        const kinds = { grampeador: 1, aquario: 1, banquinho: 1, salgadinho: 1 };
        const cands = its().filter((it) => (it.id.startsWith('m-') || it.id.startsWith('sv-') || (it.id.startsWith('item-') && kinds)) && it.ok() && !isBlocked(it.id));
        cands.sort((a, b) => d2(me, a.pos) - d2(me, b.pos));
        gl.st.target = cands[0]?.id ?? null;
        if (!gl.st.target) return 'run';
      }
      const r = use(gl.st.u, gl.st.target, () => gl.st.key !== `${M.step}|${M.searched}|${M.count}|${g.items.heldBy(P()) ? 1 : 0}|${g.surv.codeKnown}|${g.surv.unlocked}` || M.done, dt);
      if (r === 'fail') {
        blocked[gl.st.target] = g.time + 15;
        gl.st.target = null;
        return 'run';
      }
      return r === 'done' ? (M.done ? 'done' : 'run') : r;
    },

    /** v0.10: pauta andando — arquivar (lote → arquivo), xerox (impressora), entregar (bandeja → mesa do chefe). */
    g_pauta(gl, dt) {
      const p = g.tasks.pauta.find((x) => x.kind === gl.kind);
      if (!p || p.prog >= p.goal) return 'done';
      if (g.pc.mode === 'seated') return this.standUp();
      gl.st.prog0 ??= p.prog;
      const done = () => p.prog > gl.st.prog0;
      if (done()) return 'done';
      let r;
      if (gl.kind === 'xerox') r = use((gl.st.u ??= {}), 'w-xerox', done, dt);
      else if (g.pc.carrying !== 'doc') {
        r = use((gl.st.a ??= {}), gl.kind === 'arquivar' ? 'w-lote' : 'tray', () => g.pc.carrying === 'doc', dt);
        if (r === 'done') r = 'run';
      } else r = use((gl.st.b ??= {}), gl.kind === 'arquivar' ? 'w-arquivo' : 'w-entrega', done, dt);
      if (r === 'fail') blocked[`pauta-${gl.kind}`] = g.time + 20;
      return r;
    },
    g_fixed(gl, dt) {
      const r = this.seat(gl, dt);
      if (r !== 'done') return r;
      if (g.tasks.fixedDone) return 'done';
      const fk = g.tasks.fixed.kind;
      if (fk === 'planilha') {
        if (!this.openApp('planilha')) return 'run';
        this.playBeat(dt);
        return 'run';
      }
      if (!this.openApp('trabalho')) return 'run';
      this.playWork(dt);
      return 'run';
    },
    g_fun(gl, dt) {
      const id = gl.id;
      const f = g.funTasks.find((x) => x.id === id);
      if (!gl.farm && f?.done) return 'done';
      gl.st.t = (gl.st.t ?? 0) + dt;
      if (gl.st.t > 70) return 'fail';
      switch (id) {
        case 'tiro':
        case 'pesca':
        case 'video':
          return this.funPC(gl, dt);
        case 'lanche':
          return this.funSnack(gl, dt);
        case 'soneca': {
          if (g.pc.mode === 'seated') return this.standUp();
          gl.st.u ??= {};
          const r = use(gl.st.u, 'sofa', () => g.pc.mode === 'nap', dt);
          return r === 'done' ? 'done' : r;
        }
        case 'cadeira': {
          if (g.pc.mode === 'seated') return this.standUp();
          gl.st.u ??= {};
          return use(gl.st.u, (it) => it.id.startsWith('chair') && it.ok(), () => g.pc.mode === 'chair', dt);
        }
        case 'maquina': {
          if (g.pc.mode === 'seated') return this.standUp();
          gl.st.u ??= {};
          gl.st.s0 ??= g.stock.maquina;
          return use(gl.st.u, 'vend', () => g.stock.maquina < gl.st.s0, dt);
        }
        case 'fofoca': {
          if (g.pc.mode === 'seated') return this.standUp();
          gl.st.u ??= {};
          gl.st.s0 ??= g.stock.fofoca;
          return use(gl.st.u, (it) => it.id.startsWith('gossip'), () => g.stock.fofoca < gl.st.s0, dt);
        }
        case 'vidro':
          return this.funGlass(gl, dt);
        case 'cestas':
        case 'bonk':
        case 'bonkChefe':
          return this.funThrow(gl, dt);
      }
      return 'fail';
    },

    // -------------------------------------------------------------- diversões
    funPC(gl, dt) {
      const id = gl.id;
      const c = g.computer;
      if (c.offline) return 'fail';
      if (!this.safeToPlay()) {
        gl.waitingBoss = true;
        // espera o chefe voltar sentado na planilha
        const r = this.seat(gl, dt);
        if (r === 'done' && c.forbiddenOpen) this.openApp('planilha');
        gl.st.t -= dt * 0.8; // espera não conta como desistência
        return r === 'done' || r === 'run' ? 'run' : r;
      }
      gl.waitingBoss = false;
      const r = this.seat(gl, dt);
      if (r !== 'done') return r;
      if (c.active !== id) {
        if (this.hideAt >= 0) return 'run';
        // ALT-TAB volta para o último jogo (mais rápido que a barra)
        if (c.active === 'planilha' && c.lastForbidden === id) tap('Space');
        else this.openApp(id);
        return 'run';
      }
      if (id === 'video' && this.prof.headphones > 0.5 && !g.headphones && !gl.st.hp) {
        gl.st.hp = true;
        tap('KeyH');
      }
      if (id === 'tiro') return this.playTiro(gl, dt);
      if (id === 'pesca') return this.playPesca(gl, dt);
      // vídeo: só assistir
      if (g.stock.video <= 0.5 || g.earnedLeft(P(), 'video') <= 0) {
        this.openApp('planilha');
        return 'done';
      }
      const f = g.funTasks.find((x) => x.id === 'video');
      if (!gl.farm && f?.done) {
        this.openApp('planilha');
        return 'done';
      }
      return 'run';
    },
    playTiro(gl, dt) {
      const t = g.computer.tiro;
      if (t.state !== 'play') {
        if (g.stock.tiro <= 0 || g.tiroCooldown > 0 || g.earnedLeft(P(), 'tiro') <= 0) {
          releaseAll();
          this.openApp('planilha');
          return 'done';
        }
        if (gl.st.started && t.state === 'over' && !gl.farm && g.funTasks.find((x) => x.id === 'tiro')?.done) {
          this.openApp('planilha');
          return 'done';
        }
        if (!cursor?.upIn) click(512, 300);
        gl.st.started = true;
        return 'run';
      }
      // mira no inimigo mais perto e atira; desvia com WASD
      const es = t.enemies ?? [];
      let best = null;
      let bd = 1e9;
      for (const e of es) {
        const d = Math.hypot(e.x - t.px, e.y - t.py);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      const err = this.prof.aimErr * 120;
      if (best) aim(t.ax + (best.x + gauss(0, err)) * t.as, t.ay + (best.y + gauss(0, err)) * t.as);
      cursor ??= { x: 512, y: 320 };
      cursor.down = !!best;
      gl.st.moveT = (gl.st.moveT ?? 0) - dt;
      if (gl.st.moveT <= 0) {
        gl.st.moveT = 0.25;
        releaseAll(['Space']);
        if (best && bd < 150) {
          const dx = t.px - best.x;
          const dy = t.py - best.y;
          if (Math.abs(dx) > 10) keyDown(dx > 0 ? 'KeyD' : 'KeyA');
          if (Math.abs(dy) > 10) keyDown(dy > 0 ? 'KeyS' : 'KeyW');
        }
      }
      return 'run';
    },
    playPesca(gl, dt) {
      const p = g.computer.pesca;
      const f = g.funTasks.find((x) => x.id === 'pesca');
      if (g.stock.pesca <= 0 || (!gl.farm && f?.done && p.st === 'idle')) {
        this.openApp('planilha');
        return 'done';
      }
      if (p.st === 'idle' || p.st === 'caught' || p.st === 'lost') {
        gl.st.idleT = (gl.st.idleT ?? 0) + dt;
        if (gl.st.idleT > 0.6) {
          gl.st.idleT = 0;
          click(600, 300);
        }
      } else if (p.st === 'bite') {
        gl.st.biteAt ??= g.time + clamp(gauss(this.prof.chaos ? 0.55 : 0.38, 0.12), 0.12, 1.2);
        if (g.time >= gl.st.biteAt) {
          click(600, 300);
          gl.st.biteAt = undefined;
        }
      } else {
        gl.st.biteAt = undefined;
        if (this.prof.chaos && p.st === 'wait' && rnd() < dt * 0.15) click(600, 300);
      }
      return 'run';
    },
    funSnack(gl, dt) {
      const r = this.seat(gl, dt);
      if (r !== 'done') return r;
      gl.st.s0 ??= g.stock.lanche;
      if (g.stock.lanche < gl.st.s0 && g.pc.eating <= 0) {
        // migalhas: limpar segurando C
        if (P().crumbs > 0 && rnd() < this.prof.cleanCrumbs && !gl.st.noClean) {
          keyDown('KeyC');
          gl.st.cleanT = (gl.st.cleanT ?? 0) + dt;
          if (P().crumbs === 0 || gl.st.cleanT > 2.5) {
            keyUp('KeyC');
            return 'done';
          }
          return 'run';
        }
        gl.st.noClean = true;
        return 'done';
      }
      if (g.computer.typing) {
        this.openApp('planilha');
        return 'run';
      }
      if (g.pc.eating <= 0 && !gl.st.pressed) {
        gl.st.pressed = true;
        tap('KeyG');
      }
      return 'run';
    },
    funGlass(gl, dt) {
      if (g.pc.mode === 'seated') return this.standUp();
      const f = g.funTasks.find((x) => x.id === 'vidro');
      if (f?.done) return 'done';
      const pigs = g.office.outside.pigeons.filter((p) => p.fly === 0 && p.g.visible);
      if (!pigs.length) return gl.st.t > 20 ? 'fail' : 'run';
      gl.st.pig ??= pick(pigs);
      const pp = gl.st.pig.g.getWorldPosition(new V3());
      const it = findIt('glass');
      if (!it) {
        const r = walkTo(new V3(pp.x, 0, pp.z - 0.9), 0.5, dt);
        if (r === 'stuck') return 'fail';
        if (r === 'arrived') gl.st.pig = null;
        return 'run';
      }
      gl.st.u ??= {};
      return use(gl.st.u, 'glass', () => g.funTasks.find((x) => x.id === 'vidro')?.done || gl.st.u.actT > 0.4, dt);
    },
    /** Bolinha de papel: pega no monte e arremessa (atalho: a física de verdade, a mira calculada com erro). */
    funThrow(gl, dt) {
      const id = gl.id;
      const done = () => g.funTasks.find((x) => x.id === id)?.done;
      if (done()) return 'done';
      if (g.pc.mode === 'seated') return this.standUp();
      if (g.pc.mode !== 'walk') return 'run';
      if (g.pc.paperHeld <= 0) {
        if (g.pc.pile.count <= 0) return 'fail';
        gl.st.u ??= {};
        gl.st.h0 = g.pc.paperHeld;
        const r = use(gl.st.u, 'pile', () => g.pc.paperHeld > 0, dt);
        if (r === 'done') gl.st.u = {};
        return r === 'fail' ? 'fail' : 'run';
      }
      // alvo
      let target = null;
      if (id === 'cestas') {
        const me = P().ball.pos;
        const bin = g.office.bins.slice().sort((a, b) => d2(a.rim, me) - d2(b.rim, me))[0];
        if (!bin) return 'fail';
        gl.st.spot ??= (() => {
          for (let k = 0; k < 12; k++) {
            const ang = rnd() * Math.PI * 2;
            const dist = 2.2 + rnd() * 3;
            const c = new V3(bin.rim.x + Math.cos(ang) * dist, 0, bin.rim.z + Math.sin(ang) * dist);
            // o ponto precisa estar dentro do mapa e numa célula livre da navegação
            if (Math.abs(c.x) > 9.5 || Math.abs(c.z) > 11.5 || !g.nav.free(...g.nav.idx(c))) continue;
            const path = g.nav.find(new V3(me.x, 0, me.z), c) ?? [];
            if (path.length) return c;
          }
          return new V3(me.x, 0, me.z);
        })();
        gl.st.u = null;
        const r = walkTo(gl.st.spot, 0.5, dt);
        if (r === 'stuck') {
          gl.st.spot = null;
          return 'run';
        }
        if (r !== 'arrived') return 'run';
        target = bin.rim.clone();
      } else if (id === 'bonk') {
        const ws = g.workers.filter((w) => !w.isPlayer && !w.fired);
        if (!ws.length) return 'fail';
        gl.st.who ??= pick(ws);
        const head = gl.st.who.ball.headWorld();
        if (d2(head, P().ball.pos) > 5.5) {
          walkTo(head, 4.5, dt);
          return 'run';
        }
        stopWalk();
        target = head;
      } else {
        // bonkChefe: pelas costas, sem ele ver
        const b = bossInfo().find((x) => x.out && x.st !== 'chase')?.b;
        if (!b) return gl.st.t > 40 ? 'fail' : 'run';
        const behind = b.pos.clone().addScaledVector(b.forward(), -3.2);
        if (d2(P().ball.pos, behind) > 1.2) {
          walkTo(behind, 1.0, dt);
          return 'run';
        }
        stopWalk();
        if (b.sees(P().ball.pos)) return 'run';
        target = b.ball.headWorld();
      }
      gl.st.cool = (gl.st.cool ?? 0) - dt;
      if (gl.st.cool > 0) return 'run';
      gl.st.cool = 1.2;
      face(target);
      const cam = g.r.camera;
      const dir = cam.getWorldDirection(new V3());
      const start = cam.position.clone().addScaledVector(dir, 0.45).add(new V3(0, -0.08, 0));
      const T = clamp(Math.hypot(target.x - start.x, target.z - start.z) / 6.5, 0.35, 1.1);
      const e = this.prof.throwErr;
      const vel = new V3((target.x - start.x) / T + gauss(0, e), (target.y - start.y + 0.5 * 9.8 * T * T) / T + gauss(0, e), (target.z - start.z) / T + gauss(0, e));
      g.pc.paperHeld--;
      g.pc.throwPaper(start, vel);
      ev('throw', { at: id });
      gl.st.throws = (gl.st.throws ?? 0) + 1;
      if (gl.st.throws > 9) return 'fail';
      return 'run';
    },

    // -------------------------------------------------------------- trabalho
    // planilha v0.9: ritmo de novo — F na batida (a cada 2 s), com o erro de tempo do perfil
    playBeat(dt) {
      const b = this.beat;
      b.cool = (b.cool ?? 0) - dt;
      if (b.cool > 0) return;
      b.err ??= gauss(0, this.prof.beatSigma);
      const ph = g.computer.planilha.phase ?? 0;
      const toBeat = 2 - ph + b.err;
      if (toBeat > dt && toBeat < 2) return;
      tap('KeyF');
      b.err = gauss(0, this.prof.beatSigma);
      b.cool = 1;
    },
    playWork(dt) {
      const tr = g.computer.trabalho;
      const j = tr.job;
      if (!j) return;
      this.typeT -= dt;
      if (this.typeT > 0) return;
      this.typeT = range(this.prof.typeRate);
      const pr = this.prof;
      if (j.kind === 'planilha') {
        const r = j.rows[j.row];
        if (!r) return;
        const want = String(r.a + r.b);
        if (!want.startsWith(r.typed)) tap('Backspace');
        else if (r.typed.length < want.length) {
          const ch = rnd() < pr.typeErr ? String(Math.floor(rnd() * 10)) : want[r.typed.length];
          tap(`Digit${ch}`);
        } else tap('Enter');
      } else if (j.kind === 'emails') {
        const m = j.mails[j.cur];
        if (!m) return;
        let ch = m.reply[m.typed];
        if (rnd() < pr.typeErr) ch = pick('abcdefghijklmnopqrstuvwxyz'.split(''));
        const code = ch === ' ' ? 'Space' : ch === ',' ? 'Comma' : ch === '.' ? 'Period' : ch === '!' ? 'Digit1' : /\d/.test(ch) ? `Digit${ch}` : `Key${ch.toUpperCase()}`;
        tap(code);
      } else if (j.kind === 'triagem') {
        // v0.10: ← importante, → spam (com o erro do perfil)
        const m = j.mails[j.cur];
        if (!m) return;
        const spam = rnd() < pr.typeErr ? !m.spam : m.spam;
        tap(spam ? 'KeyD' : 'KeyA');
      } else if (j.kind === 'slides') {
        if (!j.cards?.length) return;
        let i = j.order.indexOf(j.next);
        if (rnd() < pr.typeErr * 1.5) i = Math.floor(rnd() * j.cards.length);
        const c = j.cards[i];
        if (c) click(c.x + c.w / 2, c.y + c.h / 2);
      }
    },

    // -------------------------------------------------------------- tarefas do chefe
    g_task(gl, dt) {
      const t = g.tasks.active.find((x) => x.kind === gl.kind);
      if (!t && !g.tasks.picker && !g.tasks.meeting) return 'done';
      if (g.pc.mode === 'seated') return this.standUp();
      gl.st.u ??= {};
      const step = t ? `${t.kind}:${t.step}:${g.pc.carrying}` : '';
      if (gl.st.step !== step) {
        gl.st.step = step;
        gl.st.u = {};
      }
      const pc = g.pc;
      switch (gl.kind) {
        case 'relatorio':
          if (t.step === 0) return this.stepUse(gl, 'print', () => pc.carrying === 'report', dt);
          return this.stepUse(gl, 'tray', () => !g.tasks.active.includes(t), dt);
        case 'assinatura':
          if (t.step === 0) return this.stepUse(gl, 'tray', () => pc.carrying === 'doc', dt);
          if (t.step === 1) return this.stepUse(gl, 'sign', () => t.step === 2, dt);
          return this.stepUse(gl, 'tray', () => !g.tasks.active.includes(t), dt);
        case 'galao':
          if (t.step === 0) return this.stepUse(gl, 'galaoPick', () => pc.carrying === 'galao', dt);
          return this.stepUse(gl, 'galaoSwap', () => !g.tasks.active.includes(t), dt);
        case 'impressora':
          return this.stepUse(gl, 'taskJam', () => !g.tasks.active.includes(t), dt);
        case 'cafe': {
          const pk = g.tasks.picker;
          if (pk) return this.coffeePicker(gl, t, dt);
          if (t.step === 0) return pc.carrying ? 'fail' : this.stepUse(gl, 'cafeMake', () => !!g.tasks.picker, dt);
          if (pc.carrying !== 'coffee') return 'fail';
          return this.stepUse(gl, 'tray', () => !g.tasks.active.includes(t), dt);
        }
        case 'reuniao':
          if (g.tasks.meeting) return this.meetingBeat(gl, dt);
          return this.stepUse(gl, 'meeting', () => !!g.tasks.meeting, dt);
      }
      return 'fail';
    },
    /** Interagível do passo atual de uma tarefa do chefe. */
    taskStepId(t) {
      switch (t.kind) {
        case 'relatorio':
          return t.step === 0 ? 'print' : 'tray';
        case 'assinatura':
          return t.step === 1 ? 'sign' : 'tray';
        case 'galao':
          return t.step === 0 ? 'galaoPick' : 'galaoSwap';
        case 'impressora':
          return 'taskJam';
        case 'cafe':
          return t.step === 0 ? 'cafeMake' : 'tray';
        default:
          return 'meeting';
      }
    },
    stepUse(gl, id, done, dt) {
      if (isBlocked(id)) return 'fail';
      const r = use(gl.st.u, id, done, dt);
      if (r === 'done') {
        gl.st.u = {};
        return 'run';
      }
      if (r === 'fail') {
        gl.st.fails = (gl.st.fails ?? 0) + 1;
        gl.st.u = {};
        if (gl.st.fails > 40) {
          bug(`task-${gl.kind}-${id}`, `tarefa "${gl.kind}": passo "${id}" não ficou disponível`, { carrying: g.pc.carrying });
          return 'fail';
        }
        return 'run';
      }
      return r;
    },
    coffeePicker(gl, t, dt) {
      const pk = g.tasks.picker;
      gl.st.pkT = (gl.st.pkT ?? 0) - dt;
      if (gl.st.pkT > 0) return 'run';
      gl.st.pkT = range([0.2, 0.45]);
      // erra a receita às vezes (memória)
      const want = gl.st.want ?? (gl.st.want = rnd() < this.prof.typeErr * 2 ? { size: t.coffee.size === 'duplo' ? 'pequeno' : 'duplo', sugar: t.coffee.sugar } : t.coffee);
      if (pk.size !== want.size) tap('KeyD');
      else if (pk.sugar < want.sugar) tap('KeyW');
      else if (pk.sugar > want.sugar) tap('KeyS');
      else tap('KeyE');
      return 'run';
    },
    meetingBeat(gl, dt) {
      // reunião v0.8: o chefe olha (m.idle > 0 = tempo para assentir); o bot reage com um atraso do perfil
      const m = g.tasks.meeting;
      if (m.idle > 0) {
        gl.st.nodT ??= clamp(0.3 + Math.abs(gauss(0, this.prof.beatSigma)) * 2, 0.2, 2.4);
        gl.st.nodT -= dt;
        if (gl.st.nodT <= 0) {
          tap('KeyF');
          gl.st.nodT = null;
        }
      } else gl.st.nodT = null;
      return 'run';
    },

    // -------------------------------------------------------------- caos (monkey test)
    chaos(dt) {
      this.chaosT -= dt;
      if (this.chaosT > 0) return;
      this.chaosT = range([1.5, 6]);
      const keys = ['KeyE', 'Space', 'KeyF', 'KeyG', 'KeyH', 'KeyC', 'KeyT', 'KeyL', 'KeyQ', 'Digit1', 'Digit3', 'KeyA', 'KeyD', 'KeyS', 'Tab', 'KeyP', 'Escape', 'KeyR', 'Backspace'];
      // ENTER como fantasma acelera ×6 e dispara o travamento já documentado (repro: fantasma-enter-trava)
      if (data.opts?.ghostFF || !P().fired) keys.push('Enter');
      const k = pick(keys);
      ev('chaos', { key: k, mode: g.pc.mode });
      tap(k);
      if (rnd() < 0.15) this.goal && (this.goal.finished = true);
    },

    // -------------------------------------------------------------- amostras e invariantes
    sample(dt) {
      if (!day || g.phase !== 'play') return;
      const p = P();
      const mode = g.pc.mode;
      day.modeTime[mode] = (day.modeTime[mode] ?? 0) + dt;
      if (mode === 'seated') day.appTime[g.computer.active] = (day.appTime[g.computer.active] ?? 0) + dt;
      day.peakSus = Math.max(day.peakSus, p.sus);
      // FUN nunca desce dentro do dia (pilar do GDD)
      if (!p.fired && p.fun < this.prevFun - 0.01 && g.time > 0.5) bug('fun-down', `FUN desceu dentro do dia (${this.prevFun.toFixed(1)} → ${p.fun.toFixed(1)})`);
      this.prevFun = p.fun;
      // o FUN do dia passa de 100 desde a meta por dia (teto técnico FUN_MAX = 999)
      if (!(p.sus >= 0 && p.sus <= 100) || !(p.fun >= 0 && p.fun <= 999)) bug('range', `Suspeita fora de 0-100 ou FUN fora de 0-999 (sus ${p.sus}, fun ${p.fun})`);
      for (const [k, v] of Object.entries(g.stock)) if (v < 0) bug(`stock-${k}`, `estoque negativo: ${k} = ${v}`);
      const pos = p.ball.pos;
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) bug('nan-pos', 'posição do jogador virou NaN');
      if ((mode === 'seated') !== !!p.seated && mode !== 'cinematic') {
        this.seatMis = (this.seatMis ?? 0) + dt;
        if (this.seatMis > 1) bug('seated-flag', `modo "${mode}" mas worker.seated=${p.seated}`);
      } else this.seatMis = 0;
      if (g.time > g.duration + 2 && g.running) bug('overtime', `o dia passou do fim (${g.time.toFixed(1)} s de ${g.duration})`);
      if (!g.computer.unlocked.includes(g.computer.active)) bug('locked-app', `app aberto não liberado hoje: ${g.computer.active}`);
      // chefe parado fora da sala por muito tempo
      for (const b of g.bosses) {
        if (!b.ball.root.visible) continue;
        b._pt ??= { last: b.pos.clone(), t: 0 };
        const moved = d2(b.pos, b._pt.last) > 0.05;
        const parked = ['office', 'wait', 'stay', 'check', 'door'].includes(b.state);
        if (moved || parked) {
          b._pt.t = 0;
          b._pt.last = b.pos.clone();
        } else if ((b._pt.t += dt) > 20) bug(`boss-stuck-${b.kind}`, `${b.kind} parado ${b._pt.t.toFixed(0)} s no estado "${b.state}" (travado?)`, { at: `${(b.pos.x + 10).toFixed(1)},${(b.pos.z + 12).toFixed(1)}` });
      }
      // colegas-robô parados andando
      for (const w of g.workers) {
        if (w.isPlayer || w.remote || w.fired) continue;
        w._pt ??= { last: w.ball.pos.clone(), t: 0 };
        const walking = ['walking', 'returning', 'exiting'].includes(w.botState);
        if (!walking || d2(w.ball.pos, w._pt.last) > 0.05) {
          w._pt.t = 0;
          w._pt.last = w.ball.pos.clone();
        } else if ((w._pt.t += dt) > 15) bug(`npc-stuck`, `colega ${w.name} travado no estado "${w.botState}"`, { at: `${(w.ball.pos.x + 10).toFixed(1)},${(w.ball.pos.z + 12).toFixed(1)}` });
      }
      this.sampleT -= dt;
      if (this.sampleT > 0) return;
      this.sampleT = 1;
      const bi = bossInfo();
      data.samples.push([g.dayIndex, Math.round(g.time), Math.round(p.sus * 10) / 10, Math.round(p.fun * 10) / 10, mode, mode === 'seated' ? g.computer.active : this.goal?.name ?? '', +(pos.x + 10).toFixed(1), +(pos.z + 12).toFixed(1), bi.map((x) => `${x.kind}:${x.st}:${x.dDesk.toFixed(1)}`).join('|')]);
    },
  };

  // ------------------------------------------------------------------ fps (tempo real)
  let frames = [];
  function summarizeFps() {
    if (frames.length < 10) return null;
    const s = frames.slice().sort((a, b) => a - b);
    const avg = 1000 / (s.reduce((a, b) => a + b, 0) / s.length);
    const p95 = s[Math.floor(s.length * 0.95)];
    frames = [];
    return { avg: +avg.toFixed(1), low: +(1000 / p95).toFixed(1) };
  }
  let lastRaf = performance.now();
  (function raf(now) {
    if (!data.opts?.accel && g.running && g.phase === 'play' && !document.hidden) frames.push(now - lastRaf);
    lastRaf = now;
    requestAnimationFrame(raf);
  })(performance.now());

  // ------------------------------------------------------------------ o robô roda antes de cada quadro do jogo
  const origUpdate = g.update.bind(g);
  g.update = (realDt) => {
    try {
      bot.tick(Math.min(realDt, 0.05));
    } catch (e) {
      bug('bot-tick', `erro no robô: ${e.message}`);
    }
    return origUpdate(realDt);
  };

  // ------------------------------------------------------------------ telas (DOM)
  const ui = {
    screen() {
      const el = document.querySelector('#ui .screen');
      if (!el) return null;
      const has = (s) => !!el.querySelector(s);
      if (has('#b-next')) return 'report';
      if (has('#b-again')) return 'final';
      if (has('#b-res')) return 'pause';
      if (has('.shop-it')) return 'shop';
      if (has('#n-ok')) return 'notice';
      if (has('#j-go')) return 'join';
      if (has('#m-play')) return 'menu';
      return el.classList.contains('boot') ? 'boot' : 'other';
    },
    click(sel) {
      const b = document.querySelector(sel);
      if (!b || b.disabled) return false;
      b.click();
      return true;
    },
    text() {
      return document.querySelector('#ui .screen')?.innerText ?? '';
    },
  };

  window.PT = {
    data,
    bot,
    ui,
    PROFILES,
    init(opts) {
      data.opts = opts;
      data.profile = opts.profile;
      bot.prof = PROFILES[opts.profile];
      bot.profName = opts.profile;
      window.fakeLock?.();
      if (opts.accel) window.frozen = true;
      // multi: o anfitrião já começou o dia antes de o robô chegar
      if (g.running && !day) {
        newDay();
        bot.onNewDay();
      }
      return true;
    },
    /** Avança `secs` de jogo de forma síncrona (modo acelerado). */
    advance(secs, fps = 30) {
      const n = Math.round(secs * fps);
      for (let i = 0; i < n; i++) {
        g.update(1 / fps);
        inp.endFrame();
      }
      return this.state();
    },
    /** Loja aberta no elevador: compra o item mais barato que der e fecha. */
    shop() {
      const items = [...document.querySelectorAll('.shop-it:not([disabled])')];
      const bought = [];
      if (items.length && rnd() < 0.8) {
        const it = pick(items);
        bought.push(it.dataset.id);
        it.click();
      }
      ui.click('#b-go');
      ev('shop', { bought, wallet: g.wallet });
      return bought;
    },
    /** O que esta janela vê da sala (para comparar com as outras). */
    netSnap() {
      const n = g.net;
      if (!n) return null;
      const p = P();
      return {
        self: n.self, time: +g.time.toFixed(2), day: g.dayIndex, events: g.dayEvents.join('+'), phase: g.phase,
        me: { x: p.ball.pos.x, z: p.ball.pos.z, fired: p.fired, sus: p.sus, fun: p.fun },
        remotes: [...n.remotes.entries()].map(([id, r]) => ({ id, x: r.w.ball.pos.x, z: r.w.ball.pos.z, fired: r.w.fired, seated: r.w.seated })),
        bosses: [g.chefe, g.x9, g.dono].map((b) => ({ kind: b.kind, x: b.ball.pos.x, z: b.ball.pos.z, vis: b.ball.root.visible })),
      };
    },
    state() {
      const p = P();
      return {
        running: g.running, phase: g.phase, day: g.dayIndex, time: +g.time.toFixed(1), paused: g.paused, shop: g.shopOpen,
        fired: p.fired, sus: Math.round(p.sus), fun: Math.round(p.fun), mode: g.pc.mode, goal: bot.goal?.name ?? null,
        screen: ui.screen(), results: g.results.length, net: g.net ? { host: g.net.isHost, members: g.net.members.length, ready: g.net.ready, playing: g.net.playing } : null,
        workers: g.workers.map((w) => ({ n: w.name, f: w.fired, s: Math.round(w.sus) })),
      };
    },
  };
})();
