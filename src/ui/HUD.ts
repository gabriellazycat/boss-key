const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export type ControlMode = 'seated' | 'walk' | 'ghost' | 'chair' | 'nap' | 'hide' | 'none';

/** [tecla, ação, aparece na barra compacta?] — a lista completa fica no painel do TAB. */
export const CONTROLS: Record<ControlMode, [string, string, boolean][]> = {
  seated: [
    ['ESPAÇO', 'esconder o jogo (planilha)', true],
    ['F', 'trabalhar no ritmo', true],
    ['E', 'levantar', true],
    ['Btn dir.', 'espiar para trás', false],
    ['B', 'basquete de papel (segure)', false],
    ['G', 'lanche', false],
    ['H', 'fones (abafa o som)', false],
  ],
  walk: [
    ['WASD', 'andar', true],
    ['CLIQUE / E', 'usar', true],
    ['Btn dir.', 'arremessar papel (segure)', true],
    ['Mouse', 'olhar', false],
    ['SHIFT', 'andar com cuidado (café)', false],
    ['ESPAÇO', 'pulinho', false],
  ],
  chair: [['WASD', 'pilotar', true], ['E', 'descer', true], ['Mouse', 'olhar', false]],
  nap: [['E / ESPAÇO', 'acordar', true]],
  hide: [['E', 'sair do banheiro', true], ['Mouse', 'olhar pela fresta', false]],
  ghost: [['WASD', 'flutuar', true], ['ENTER', 'acelerar o tempo', true]],
  none: [],
};

export interface TaskView {
  icon: string;
  label: string;
  /** 0-1 (tempo restante) ou null. */
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
  private eyeSvg: SVGSVGElement;
  private lidTop!: SVGPathElement;
  private lidBot!: SVGPathElement;
  private iris!: SVGCircleElement;
  private pupil!: SVGCircleElement;
  private susWrap = h('div', 'sus');
  private funList = h('div', 'fun-list');
  private markersEl = h('div', 'markers');
  private markEls: HTMLElement[] = [];
  private susIndiv = h('div', 'sus-indiv-fill');
  private susLabel = h('div', 'sus-label');
  private clock = h('div', 'clock');
  private dayEl = h('div', 'day');
  private phaseEl = h('div', 'phase');
  private warnEl = h('div', 'warns');
  private banner = h('div', 'banner');
  private radar = h('div', 'radar');
  private radarArrow = h('div', 'radar-arrow');
  private radarLbl = h('div', 'radar-lbl');
  private goalEl = h('div', 'goal');
  private helpEl = h('div', 'help');
  private tasks = h('div', 'tasks');
  private promptEl = h('div', 'prompt');
  private promptRing = h('div', 'prompt-ring');
  private subs = h('div', 'subs');
  private popupEl = h('div', 'popup');
  private controlsEl = h('div', 'controls');
  private controlsT = 0;
  private meterEl = h('div', 'meter');
  private meterFill = h('div', 'meter-fill');
  private meterLbl = h('div', 'meter-lbl');
  private ghostEl = h('div', 'ghost-banner');
  private heatEl = h('div', 'heat');
  private cross = h('div', 'cross');
  private toastEl = h('div', 'wtoast');
  private toastT = 0;
  private crackEl = h('div', 'crack', '<i></i><i></i>');
  private lastFun = 0;
  private funPulse = 0;
  private eyeOpen = 0;
  private subQueue: { el: HTMLElement; t: number }[] = [];
  private popupHold = 0;

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
    // topo-centro: olho
    this.eyeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.eyeSvg.setAttribute('viewBox', '0 0 200 100');
    this.eyeSvg.classList.add('eye');
    this.eyeSvg.innerHTML = `
      <defs>
        <clipPath id="eyeClip"><path d="M10 50 Q100 -10 190 50 Q100 110 10 50Z"/></clipPath>
        <radialGradient id="irisG"><stop offset="0" stop-color="#ff7a7a"/><stop offset="0.7" stop-color="#d9233a"/><stop offset="1" stop-color="#7a0a1a"/></radialGradient>
      </defs>
      <path d="M10 50 Q100 -10 190 50 Q100 110 10 50Z" fill="#fff8f0" stroke="#1b2233" stroke-width="5"/>
      <g clip-path="url(#eyeClip)">
        <g class="veins" stroke="#ff4d6d" stroke-width="1.6" fill="none" opacity="0">
          <path d="M14 50 q14 -6 26 2 q8 -8 18 -4"/><path d="M186 50 q-14 6 -26 -2 q-8 8 -18 4"/><path d="M20 58 q12 4 22 -2"/>
        </g>
        <circle class="iris" cx="100" cy="50" r="26" fill="url(#irisG)"/>
        <circle class="pupil" cx="100" cy="50" r="11" fill="#111"/>
        <circle cx="92" cy="42" r="5" fill="#fff" opacity="0.9"/>
        <path class="lidT" fill="#2a3245" d=""/>
        <path class="lidB" fill="#2a3245" d=""/>
      </g>
      <path d="M10 50 Q100 -10 190 50 Q100 110 10 50Z" fill="none" stroke="#1b2233" stroke-width="5"/>`;
    this.lidTop = this.eyeSvg.querySelector('.lidT')!;
    this.lidBot = this.eyeSvg.querySelector('.lidB')!;
    this.iris = this.eyeSvg.querySelector('.iris')!;
    this.pupil = this.eyeSvg.querySelector('.pupil')!;
    const indiv = h('div', 'sus-indiv');
    indiv.append(this.susIndiv);
    const col = h('div', 'sus-col');
    col.append(this.susLabel, indiv);
    this.susWrap.append(this.eyeSvg, col);
    this.root.append(this.susWrap);

    const tr = h('div', 'topright');
    tr.append(this.dayEl, this.clock, this.phaseEl, this.warnEl);
    this.root.append(tr, this.banner);

    this.radar.append(h('div', 'radar-ring'), h('div', 'radar-me'), this.radarArrow, this.radarLbl);
    const left = h('div', 'left');
    left.append(this.goalEl, this.funList, this.radar, this.heatEl);
    this.root.append(left);

    this.funWrap.append(h('div', 'fun-title', 'FUN'), this.funGhost, this.funFill, this.funMeta, this.funVal);
    const funOuter = h('div', 'fun-outer');
    funOuter.append(this.funWrap);
    this.root.append(funOuter);

    this.promptEl.append(this.promptRing, h('span', 'prompt-txt'));
    this.meterEl.append(this.meterLbl, h('div', 'meter-track'));
    (this.meterEl.lastChild as HTMLElement).append(this.meterFill, h('div', 'meter-zone'));
    this.root.append(this.markersEl, this.crackEl, this.cross, this.toastEl, this.tasks, this.promptEl, this.meterEl, this.subs, this.popupEl, this.controlsEl, this.ghostEl, this.helpEl);
    this.setEye(0);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  setFun(v: number, meta: number) {
    if (v > this.lastFun + 0.01) this.funPulse = 1;
    this.lastFun = v;
    this.funFill.style.width = `${v}%`;
    this.funMeta.style.left = `${meta}%`;
    this.funVal.textContent = `${Math.floor(v)} / ${meta}`;
    this.funWrap.classList.toggle('met', v >= meta);
  }

  setSus(team: number, indiv: number) {
    this.eyeOpen += (team / 100 - this.eyeOpen) * 0.15;
    this.setEye(this.eyeOpen);
    this.susIndiv.style.width = `${indiv}%`;
    this.susIndiv.classList.toggle('hot', indiv > 70);
    this.susLabel.textContent = `SUSPEITA DO CHEFE ${Math.round(team)}%`;
    this.susWrap.classList.toggle('danger', team > 75);
  }

  private setEye(k: number) {
    // k 0..1 → abertura
    const open = 6 + k * 44;
    const top = 50 - open;
    const bot = 50 + open;
    this.lidTop.setAttribute('d', `M0 0 H200 V50 Q100 ${top * 2 - 50} 0 50 Z`);
    this.lidBot.setAttribute('d', `M0 100 H200 V50 Q100 ${bot * 2 - 50} 0 50 Z`);
    this.iris.setAttribute('r', String(18 + k * 12));
    this.pupil.setAttribute('r', String(12 - k * 5));
    (this.eyeSvg.querySelector('.veins') as SVGGElement).setAttribute('opacity', String(Math.max(0, (k - 0.55) * 2.2)));
  }

  setClock(t01: number, day: string, phase: string) {
    const mins = 9 * 60 + t01 * 9 * 60;
    const hh = Math.floor(mins / 60);
    const mm = Math.floor(mins % 60);
    this.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.dayEl.textContent = day;
    this.phaseEl.textContent = phase;
  }

  setWarnings(n: number, max: number) {
    // só aparece quando importa
    this.warnEl.innerHTML = n > 0 ? `⚠ advertências <b>${n}/${max}</b>` : '';
  }

  /** Faixa de alerta no topo; `sub` diz o que fazer AGORA. */
  setBanner(text: string | null, kind = '', sub = '') {
    const html = text ? `${text}${sub ? `<div class="banner-sub">${sub}</div>` : ''}` : '';
    if (this.banner.innerHTML !== html) this.banner.innerHTML = html;
    this.banner.className = `banner ${text ? 'on' : ''} ${kind}`;
  }

  setRadar(angle: number | null, alpha: number, label: string, hidden: boolean) {
    this.radar.classList.toggle('blind', hidden);
    // o radar só aparece quando há um som para mostrar
    this.radar.classList.toggle('idle', angle === null && !hidden);
    if (angle === null || hidden) {
      this.radarArrow.style.opacity = '0';
      this.radarLbl.textContent = hidden ? 'visão de túnel' : '';
      return;
    }
    this.radarArrow.style.opacity = String(alpha);
    this.radarArrow.style.transform = `rotate(${angle}rad)`;
    this.radarLbl.textContent = label;
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

  setHeat(heat: number) {
    this.heatEl.className = `heat ${heat > 60 ? 'on' : ''}`;
    this.heatEl.textContent = heat > 60 ? '🔥 SUPERAQUECENDO — cooler alto!' : '';
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
    this.markEls.forEach((el, i) => {
      const m = list[i];
      el.style.display = m ? '' : 'none';
      if (!m) return;
      el.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -100%)`;
      const html = `<i>${m.icon}</i><span>${m.text}</span>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      const r = el.getBoundingClientRect();
      const hit = panels.some((p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top);
      el.style.visibility = hit ? 'hidden' : '';
    });
  }

  /** Painel esquerdo: o que dá FUN hoje e quanto ainda resta. */
  setFunList(rows: [string, string | number, boolean][]) {
    const items = rows
      .filter((r) => r[2])
      .map(([label, v]) => `<div class="frow"><span>${label}</span><b>${v}</b></div>`)
      .join('');
    const html = `<div class="pnl-h">DIVERSÃO QUE VOCÊ PODE FAZER</div>${items}`;
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

  popup(kind: 'clutch' | 'caught' | 'fired' | 'info' | 'good' | 'warn', text: string, sub = '') {
    // evento importante segura a tela por 1,5 s: avisos menores nesse intervalo somem
    const now = performance.now();
    if (now < this.popupHold && (kind === 'info' || kind === 'warn')) return;
    if (kind === 'clutch' || kind === 'caught' || kind === 'fired') this.popupHold = now + 1500;
    // um popup por vez (o "DEMITIDO" substitui o "PEGO!")
    for (const old of Array.from(this.popupEl.children)) old.remove();
    const el = h('div', `pop ${kind}`, `<div class="pt">${text}</div>${sub ? `<div class="ps">${sub}</div>` : ''}`);
    this.popupEl.appendChild(el);
    setTimeout(() => el.remove(), kind === 'fired' ? 2600 : 1600);
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
    if (this.controlsT > 0) {
      this.controlsT -= dt;
      if (this.controlsT <= 0) this.controlsEl.classList.add('dim');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('on');
    }
    this.funWrap.style.setProperty('--pulse', String(this.funPulse));
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
