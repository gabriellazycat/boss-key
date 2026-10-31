const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export type ControlMode = 'seated' | 'walk' | 'ghost' | 'ghostNet' | 'chair' | 'nap' | 'hide' | 'meeting' | 'none';

/** [tecla, ação, aparece na barra compacta?] — a lista completa fica no painel do TAB. */
export const CONTROLS: Record<ControlMode, [string, string, boolean][]> = {
  seated: [
    ['ESPAÇO', 'esconder o jogo (volta ao trabalho)', true],
    ['CLIQUE', 'no telefone para atender', false],
    ['F', 'trabalhar no ritmo (planilha) · vira papo com o chefe', true],
    ['E', 'levantar', true],
    ['Mouse', 'girar na cadeira (a mira é o cursor da tela)', false],
    ['CLIQUE', 'no monte pega bolinha, no telefone atende', false],
    ['Btn dir.', 'arremessar bolinha (segure e solte)', false],
    ['G', 'lanche', false],
    ['H', 'fones (abafa o som)', false],
  ],
  walk: [
    ['WASD', 'andar', true],
    ['CLIQUE / E', 'usar', true],
    ['Btn dir.', 'arremessar papel · com item de missão: passar', true],
    ['Q', 'largar o item de missão · sair do minigame', false],
    ['E (perto do chefe)', 'puxar papo (o trabalho feito vira segundos)', false],
    ['Mouse', 'olhar', false],
    ['SHIFT', 'andar com cuidado (café)', false],
    ['ESPAÇO', 'pulinho', false],
  ],
  chair: [['WASD', 'pilotar', true], ['E', 'descer', true], ['Mouse', 'olhar', false]],
  nap: [['E / ESPAÇO', 'acordar', true]],
  hide: [['E', 'sair do banheiro', true], ['Mouse', 'olhar pela fresta', false]],
  meeting: [['F', 'assentir quando ele olhar', true], ['E', 'sair da reunião', true]],
  ghost: [['WASD', 'flutuar', true], ['ENTER', 'acelerar o tempo', true]],
  /** No multi o tempo não acelera: o fantasma avisa a sala. */
  ghostNet: [['WASD', 'flutuar', true], ['F', 'avisar a sala onde o chefe está', true]],
  none: [],
};

export interface TaskView {
  icon: string;
  label: string;
  /** 0-1 (folga restante, progresso da cota) ou null. */
  bar: number | null;
  urgent?: boolean;
}

/** HUD em HTML/CSS sobre o canvas. */
export class HUD {
  readonly root = h('div', 'hud hidden');
  private funFill = h('div', 'fun-fill');
  private funGhost = h('div', 'fun-ghost');
  private funMeta = h('div', 'fun-meta');
  private funVal = h('div', 'fun-val');
  private funWrap = h('div', 'fun');
  private susWrap = h('div', 'sus');
  private funList = h('div', 'fun-list');
  private markersEl = h('div', 'markers');
  private markEls: HTMLElement[] = [];
  private susIndiv = h('div', 'sus-indiv-fill');
  private susLabel = h('div', 'sus-label');
  /** Embaixo da barra: o motivo de cada subida da Suspeita ("+5 👁 mesa vazia"), sem nunca ser descartado. */
  private susFeedEl = h('div', 'sus-feed');
  private susRows: { el: HTMLElement; reason: string; n: number; t: number }[] = [];
  private livesEl = h('div', 'lives');
  private coverEl = h('div', 'cover');
  private clock = h('div', 'clock');
  private dayEl = h('div', 'day');
  private phaseEl = h('div', 'phase');
  private banner = h('div', 'banner');
  private goalEl = h('div', 'goal');
  private helpEl = h('div', 'help');
  private tasks = h('div', 'tasks');
  private promptEl = h('div', 'prompt');
  private promptRing = h('div', 'prompt-ring');
  private subs = h('div', 'subs');
  private sayEl = h('div', 'say');
  private popupEl = h('div', 'popup');
  private controlsEl = h('div', 'controls');
  private controlsT = 0;
  private meterEl = h('div', 'meter');
  private meterFill = h('div', 'meter-fill');
  private meterLbl = h('div', 'meter-lbl');
  private ghostEl = h('div', 'ghost-banner');
  private cross = h('div', 'cross');
  private toastEl = h('div', 'wtoast');
  private toastT = 0;
  private crackEl = h('div', 'crack', '<i></i><i></i>');
  private pickerEl = h('div', 'picker postit');
  private splatEl = h('div', 'splat');
  private callEl = h('div', 'call');
  private callT = 0;
  private lastFun = 0;
  private funPulse = 0;
  private subQueue: { el: HTMLElement; t: number }[] = [];
  private popupHold = 0;

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
    // topo-centro: medidor de Suspeita
    const indiv = h('div', 'sus-indiv');
    indiv.append(this.susIndiv);
    const col = h('div', 'sus-col');
    col.append(this.coverEl, this.susLabel, indiv, this.susFeedEl);
    this.susWrap.append(col);
    this.root.append(this.susWrap);

    const tr = h('div', 'topright');
    tr.append(this.dayEl, this.clock, this.phaseEl, this.livesEl);
    this.root.append(tr, this.banner);

    const left = h('div', 'left');
    left.append(this.goalEl, this.funList);
    this.root.append(left);

    this.funWrap.append(h('div', 'fun-title', 'FUN'), this.funGhost, this.funFill, this.funMeta, this.funVal);
    const funOuter = h('div', 'fun-outer');
    funOuter.append(this.funWrap);
    this.root.append(funOuter);

    this.promptEl.append(this.promptRing, h('span', 'prompt-txt'));
    this.meterEl.append(this.meterLbl, h('div', 'meter-track'));
    (this.meterEl.lastChild as HTMLElement).append(this.meterFill, h('div', 'meter-zone'));
    this.root.append(this.markersEl, this.crackEl, this.cross, this.toastEl, this.tasks, this.promptEl, this.meterEl, this.subs, this.sayEl, this.popupEl, this.controlsEl, this.ghostEl, this.pickerEl, this.callEl, this.splatEl, this.helpEl);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  /** Dentro do elevador o HUD fica enxuto (só objetivo, relógio e controles). */
  elevator(on: boolean) {
    this.root.classList.toggle('elev', on);
  }

  /** Barra FUN: o de hoje rumo à meta do dia (cheia = meta batida; no multi, a meta e o FUN são do time) e o total da run. */
  setFun(v: number, total: number, goal: number, team = v) {
    if (v > this.lastFun + 0.01) this.funPulse = 1;
    this.lastFun = v;
    const done = team >= goal;
    this.funFill.style.width = `${Math.min(100, (team / Math.max(1, goal)) * 100)}%`;
    this.funWrap.classList.toggle('met', done);
    this.funMeta.style.display = 'none';
    const mine = team !== v ? ` <small>· você ${Math.floor(v)}</small>` : '';
    const html = `${Math.floor(team)} / ${goal}${done ? ' ✓' : ''}${mine} <small>· run ${Math.floor(total + v)}</small>`;
    if (this.funVal.innerHTML !== html) this.funVal.innerHTML = html;
  }

  /** Disfarçado / exposto / à toa: o único indicador do que o chefe pensaria se te visse agora. */
  setCover(kind: 'disfarcado' | 'exposto' | 'atoa' | null, extra = '') {
    const txt = kind === 'disfarcado' ? '👔 DISFARÇADO' : kind === 'exposto' ? `🎉 EXPOSTO${extra ? ` · ${extra}` : ''}` : kind === 'atoa' ? '🚶 À TOA' : '';
    if (this.coverEl.textContent !== txt) this.coverEl.textContent = txt;
    this.coverEl.className = `cover ${kind ?? 'off'}`;
  }

  /** Vidas da run (crachás). */
  setLives(left: number, max: number) {
    const html = `<span>VIDAS</span> ${'<i class="on">♥</i>'.repeat(Math.max(0, left))}${'<i>♥</i>'.repeat(Math.max(0, max - left))}`;
    if (this.livesEl.innerHTML !== html) this.livesEl.innerHTML = html;
  }

  /** "+N 👁 motivo" embaixo da barra: o mesmo motivo seguido soma na mesma linha. */
  susFeed(reason: string, n: number) {
    const row = this.susRows.find((r) => r.reason === reason);
    if (row) {
      row.n += n;
      row.t = 3.5;
    } else {
      const el = h('div', 'sus-row');
      this.susFeedEl.prepend(el);
      this.susRows.unshift({ el, reason, n, t: 3.5 });
      while (this.susRows.length > 4) this.susRows.pop()!.el.remove();
    }
    const r = this.susRows.find((x) => x.reason === reason)!;
    r.el.innerHTML = `<b>+${r.n}</b> 👁 ${reason}`;
    r.el.classList.remove('bump');
    void r.el.offsetWidth;
    r.el.classList.add('bump');
  }

  /** Sua Suspeita, as setas de quanto ela está subindo e a curva do dia. */
  setSus(indiv: number, arrows: string, mul: number) {
    this.susIndiv.style.width = `${indiv}%`;
    this.susIndiv.classList.toggle('hot', indiv > 70);
    // a curva do dia: quanto tudo pesa hoje (sem nome, ninguém sabia o que era o "×1,32")
    const curve = mul > 1.001 ? ` · rigor ×${mul.toFixed(2).replace('.', ',')}` : '';
    this.susLabel.textContent = `SUA SUSPEITA ${Math.round(indiv)}% ${arrows}${curve}`;
    this.susWrap.classList.toggle('danger', indiv > 75);
  }

  setClock(t01: number, day: string, phase: string) {
    const mins = 9 * 60 + t01 * 9 * 60;
    const hh = Math.floor(mins / 60);
    const mm = Math.floor(mins % 60);
    this.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.dayEl.textContent = day;
    this.phaseEl.textContent = phase;
  }

  /** Faixa de alerta no topo; `sub` diz o que fazer AGORA. */
  setBanner(text: string | null, kind = '', sub = '') {
    const html = text ? `${text}${sub ? `<div class="banner-sub">${sub}</div>` : ''}` : '';
    if (this.banner.innerHTML !== html) this.banner.innerHTML = html;
    this.banner.className = `banner ${text ? 'on' : ''} ${kind}`;
  }

  /** Cartão "o que fazer agora": um objetivo por vez. */
  goal(head: string, text: string, kind: '' | 'tut' | 'urgent' | 'done' = '') {
    const html = `<div class="goal-h">${head}</div><div class="goal-t">${text}</div>`;
    if (this.goalEl.innerHTML !== html) {
      const bump = this.goalEl.dataset.t !== text;
      this.goalEl.innerHTML = html;
      this.goalEl.dataset.t = text;
      if (bump) {
        this.goalEl.classList.remove('bump');
        void this.goalEl.offsetWidth;
        this.goalEl.classList.add('bump');
      }
    }
    this.goalEl.className = `goal ${kind} ${this.goalEl.classList.contains('bump') ? 'bump' : ''}`;
  }

  /** Painel de ajuda (segure TAB). */
  help(html: string | null) {
    this.helpEl.classList.toggle('on', !!html);
    if (html && this.helpEl.innerHTML !== html) this.helpEl.innerHTML = html;
  }

  /** Painel direito: tarefas de trabalho do dia (urgentes primeiro). */
  setTasks(list: TaskView[]) {
    const rows = [...list]
      .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent))
      .slice(0, 4)
      .map((t) => `<div class="task ${t.urgent ? 'urgent' : ''}"><span class="ti">${t.icon}</span><span class="tl">${t.label}</span>${t.bar !== null ? `<div class="tb"><i style="width:${Math.round(t.bar * 100)}%"></i></div>` : ''}</div>`)
      .join('');
    const html = rows ? `<div class="pnl-h">TAREFAS DO DIA</div>${rows}` : '';
    if (this.tasks.innerHTML !== html) this.tasks.innerHTML = html;
  }

  /** Ícones de FUN sobre os lugares (x/y já em pixels da tela). */
  setMarkers(list: { x: number; y: number; icon: string; text: string }[]) {
    while (this.markEls.length < list.length) {
      const el = h('div', 'mark');
      this.markersEl.append(el);
      this.markEls.push(el);
    }
    // painéis fixos do HUD: um marcador que cairia em cima deles some (não sobrepõe o texto)
    const panels = list.length ? Array.from(this.root.querySelectorAll<HTMLElement>('.left, .topright, .tasks, .sus, .fun, .controls'), (p) => p.getBoundingClientRect()).filter((r) => r.width > 0) : [];
    const overlap = (r: DOMRect, p: DOMRect) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top;
    // marcadores que se encavalam (as vitrines lado a lado): o de cima da lista fica com o texto, o outro vira só o ícone
    const placed: DOMRect[] = [];
    this.markEls.forEach((el, i) => {
      const m = list[i];
      el.style.display = m ? '' : 'none';
      if (!m) return;
      el.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -100%)`;
      const html = `<i>${m.icon}</i><span>${m.text}</span>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.remove('mini');
      let r = el.getBoundingClientRect();
      if (placed.some((p) => overlap(r, p))) {
        el.classList.add('mini');
        r = el.getBoundingClientRect();
      }
      // nem só o ícone cabe: some (chegando perto, o aviso do E diz o que é)
      const hit = panels.some((p) => overlap(r, p)) || placed.some((p) => overlap(r, p));
      el.style.visibility = hit ? 'hidden' : '';
      if (!hit) placed.push(r);
    });
  }

  /** Painel esquerdo: as diversões sorteadas hoje (só elas valem) e o progresso de cada uma. */
  setFunList(rows: [string, string | number, boolean][]) {
    const items = rows
      .filter((r) => r[2])
      .map(([label, v]) => `<div class="frow"><span>${label}</span><b>${v}</b></div>`)
      .join('');
    const html = `<div class="pnl-h">MISSÕES DE HOJE</div>${items}`;
    if (this.funList.innerHTML !== html) this.funList.innerHTML = html;
  }

  prompt(text: string | null, hold = 0, hint = '') {
    this.promptEl.classList.toggle('on', !!text);
    if (text) {
      const html = hint ? `${text}<small>${hint}</small>` : text;
      const el = this.promptEl.lastChild as HTMLElement;
      if (el.innerHTML !== html) el.innerHTML = html;
    }
    this.promptRing.style.setProperty('--p', String(hold));
    this.promptRing.classList.toggle('on', hold > 0);
  }

  meter(label: string | null, v = 0, zone: [number, number] | null = null) {
    this.meterEl.classList.toggle('on', !!label);
    if (!label) return;
    this.meterLbl.textContent = label;
    this.meterFill.style.width = `${v * 100}%`;
    this.meterFill.classList.toggle('bad', !zone && v > 0.3);
    const z = this.meterEl.querySelector('.meter-zone') as HTMLElement;
    z.style.display = zone ? 'block' : 'none';
    if (zone) {
      z.style.left = `${zone[0] * 100}%`;
      z.style.width = `${(zone[1] - zone[0]) * 100}%`;
    }
  }

  subtitle(text: string) {
    const last = this.subQueue[this.subQueue.length - 1];
    if (last && last.el.textContent === text) {
      last.t = 2.2;
      return;
    }
    const el = h('div', 'sub', text);
    this.subs.appendChild(el);
    this.subQueue.push({ el, t: 2.2 });
    while (this.subQueue.length > 3) this.subQueue.shift()!.el.remove();
  }

  /** Balão de fala de um personagem (tutorial do chefe); `null` esconde. */
  say(who: string, html: string | null) {
    this.sayEl.classList.toggle('on', !!html);
    if (!html) return;
    const next = `<div class="say-who">${who}</div><div class="say-t">${html}</div>`;
    if (this.sayEl.innerHTML === next) return;
    this.sayEl.innerHTML = next;
    this.sayEl.classList.remove('bump');
    void this.sayEl.offsetWidth;
    this.sayEl.classList.add('bump');
  }

  popup(kind: 'clutch' | 'caught' | 'fired' | 'info' | 'good' | 'warn', text: string, sub = '') {
    // evento importante segura a tela por 1,5 s: avisos menores nesse intervalo somem
    const now = performance.now();
    if (now < this.popupHold && (kind === 'info' || kind === 'warn')) return;
    if (kind === 'clutch' || kind === 'caught' || kind === 'fired') this.popupHold = now + 1500;
    // um popup por vez (o "DEMITIDO" substitui o "PEGO!")
    for (const old of Array.from(this.popupEl.children)) old.remove();
    const el = h('div', `pop ${kind}`, `<div class="pt">${text}</div>${sub ? `<div class="ps">${sub}</div>` : ''}`);
    this.popupEl.appendChild(el);
    const ms = kind === 'fired' ? 2600 : 1600;
    setTimeout(() => el.remove(), ms);
    // aviso grande na tela: as listas laterais recolhem para não disputar a leitura
    this.root.classList.add('busy');
    clearTimeout(this.busyT);
    this.busyT = setTimeout(() => this.root.classList.remove('busy'), ms);
  }
  private busyT = 0;

  /** Bolinha de papel na cara (um colega revidou). */
  splat() {
    this.splatEl.classList.remove('on');
    void this.splatEl.offsetWidth;
    this.splatEl.classList.add('on');
  }

  /** Painel de escolha (receita do café do chefe). */
  picker(html: string | null) {
    this.pickerEl.classList.toggle('on', !!html);
    if (html && this.pickerEl.innerHTML !== html) this.pickerEl.innerHTML = html;
  }

  /** Ligação do chefe: bilhete com retrato e o pedido. */
  call(who: string, text: string, portrait: string | null) {
    this.callEl.innerHTML = `${portrait ? `<img src="${portrait}" alt="">` : '<div class="ph">📞</div>'}<div><div class="call-h">📞 ${who} na linha</div><div class="call-t">“${text}”</div></div>`;
    this.callEl.classList.add('on');
    this.callT = 5.5;
  }

  /** Fresta da porta do banheiro (esconderijo). */
  crack(on: boolean) {
    this.crackEl.classList.toggle('on', on);
  }

  crosshair(state: 'idle' | 'target' | 'aim' | null) {
    this.cross.className = `cross ${state ?? 'off'}`;
  }

  /** Aviso curto no centro-baixo da tela (quando não há monitor). */
  toastWorld(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = 1.8;
  }

  controls(mode: ControlMode) {
    if (this.controlsEl.dataset.m === mode) return;
    this.controlsEl.dataset.m = mode;
    const list = CONTROLS[mode].filter((c) => c[2]);
    this.controlsEl.innerHTML = list.length ? list.map(([key, t]) => `<span><kbd>${key}</kbd>${t}</span>`).join('') + '<span class="more"><kbd>TAB</kbd>ajuda</span>' : '';
    // aparece forte ao trocar de modo e depois fica discreto
    this.controlsT = 7;
    this.controlsEl.classList.remove('dim');
  }

  ghost(text: string | null) {
    this.ghostEl.classList.toggle('on', !!text);
    if (text) this.ghostEl.innerHTML = text;
  }

  update(dt: number) {
    this.funPulse = Math.max(0, this.funPulse - dt * 4);
    if (this.callT > 0) {
      this.callT -= dt;
      if (this.callT <= 0) this.callEl.classList.remove('on');
    }
    if (this.controlsT > 0) {
      this.controlsT -= dt;
      if (this.controlsT <= 0) this.controlsEl.classList.add('dim');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('on');
    }
    this.funWrap.style.setProperty('--pulse', String(this.funPulse));
    for (let i = this.susRows.length - 1; i >= 0; i--) {
      const r = this.susRows[i];
      r.t -= dt;
      r.el.style.opacity = String(Math.min(1, r.t));
      if (r.t <= 0) {
        r.el.remove();
        this.susRows.splice(i, 1);
      }
    }
    for (let i = this.subQueue.length - 1; i >= 0; i--) {
      const s = this.subQueue[i];
      s.t -= dt;
      s.el.style.opacity = String(Math.min(1, s.t * 2));
      if (s.t <= 0) {
        s.el.remove();
        this.subQueue.splice(i, 1);
      }
    }
  }
}
