const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
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
  private stocks = h('div', 'stocks');
  private tasks = h('div', 'tasks');
  private promptEl = h('div', 'prompt');
  private promptRing = h('div', 'prompt-ring');
  private subs = h('div', 'subs');
  private popupEl = h('div', 'popup');
  private tipEl = h('div', 'tip');
  private controlsEl = h('div', 'controls');
  private meterEl = h('div', 'meter');
  private meterFill = h('div', 'meter-fill');
  private meterLbl = h('div', 'meter-lbl');
  private ghostEl = h('div', 'ghost-banner');
  private heatEl = h('div', 'heat');
  private cross = h('div', 'cross');
  private toastEl = h('div', 'wtoast');
  private toastT = 0;
  private lastFun = 0;
  private funPulse = 0;
  private eyeOpen = 0;
  private subQueue: { el: HTMLElement; t: number }[] = [];

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
    indiv.append(this.susIndiv, h('div', 'sus-indiv-cap', 'você'));
    this.susWrap.append(this.eyeSvg, this.susLabel, indiv);
    this.root.append(this.susWrap);

    const tr = h('div', 'topright');
    tr.append(this.dayEl, this.clock, this.phaseEl, this.warnEl);
    this.root.append(tr, this.banner);

    this.radar.append(h('div', 'radar-ring'), h('div', 'radar-me'), this.radarArrow, this.radarLbl);
    const left = h('div', 'left');
    left.append(this.radar, this.stocks, this.heatEl);
    this.root.append(left);

    this.funWrap.append(h('div', 'fun-title', 'FUN'), this.funGhost, this.funFill, this.funMeta, this.funVal);
    const funOuter = h('div', 'fun-outer');
    funOuter.append(this.funWrap);
    this.root.append(funOuter);

    this.promptEl.append(this.promptRing, h('span', 'prompt-txt'));
    this.meterEl.append(this.meterLbl, h('div', 'meter-track'));
    (this.meterEl.lastChild as HTMLElement).append(this.meterFill, h('div', 'meter-zone'));
    this.root.append(this.cross, this.toastEl, this.tasks, this.promptEl, this.meterEl, this.subs, this.popupEl, this.tipEl, this.controlsEl, this.ghostEl);
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
    this.susLabel.textContent = `SUSPEITA ${Math.round(team)}`;
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
    this.warnEl.innerHTML = Array.from({ length: max }, (_, i) => `<span class="w ${i < n ? 'on' : ''}">!</span>`).join('');
  }

  setBanner(text: string | null, kind = '') {
    this.banner.textContent = text ?? '';
    this.banner.className = `banner ${text ? 'on' : ''} ${kind}`;
  }

  setRadar(angle: number | null, alpha: number, label: string, hidden: boolean) {
    this.radar.classList.toggle('blind', hidden);
    if (angle === null || hidden) {
      this.radarArrow.style.opacity = '0';
      this.radarLbl.textContent = hidden ? 'visão de túnel' : '';
      return;
    }
    this.radarArrow.style.opacity = String(alpha);
    this.radarArrow.style.transform = `rotate(${angle}rad)`;
    this.radarLbl.textContent = label;
  }

  setStocks(items: { icon: string; v: string; off?: boolean; tip?: string }[]) {
    const html = items.map((i) => `<div class="stk ${i.off ? 'off' : ''}" title="${i.tip ?? ''}"><span>${i.icon}</span><b>${i.v}</b></div>`).join('');
    if (this.stocks.innerHTML !== html) this.stocks.innerHTML = html;
  }

  setHeat(heat: number) {
    this.heatEl.className = `heat ${heat > 60 ? 'on' : ''}`;
    this.heatEl.textContent = heat > 60 ? '🔥 SUPERAQUECENDO — cooler alto!' : '';
  }

  setTasks(list: TaskView[]) {
    const html = list
      .map((t) => `<div class="task ${t.urgent ? 'urgent' : ''}"><span class="ti">${t.icon}</span><span class="tl">${t.label}</span>${t.bar !== null ? `<div class="tb"><i style="width:${Math.round(t.bar * 100)}%"></i></div>` : ''}</div>`)
      .join('');
    if (this.tasks.innerHTML !== html) this.tasks.innerHTML = html;
  }

  prompt(text: string | null, hold = 0) {
    this.promptEl.classList.toggle('on', !!text);
    if (text) (this.promptEl.lastChild as HTMLElement).innerHTML = text;
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
    // um popup por vez (o "DEMITIDO" substitui o "PEGO!")
    for (const old of Array.from(this.popupEl.children)) old.remove();
    const el = h('div', `pop ${kind}`, `<div class="pt">${text}</div>${sub ? `<div class="ps">${sub}</div>` : ''}`);
    this.popupEl.appendChild(el);
    setTimeout(() => el.remove(), kind === 'fired' ? 2600 : 1600);
  }

  tip(text: string | null) {
    this.tipEl.classList.toggle('on', !!text);
    if (text && this.tipEl.dataset.t !== text) {
      this.tipEl.dataset.t = text;
      this.tipEl.innerHTML = `<div class="tip-h">💡 DICA</div><div>${text}</div>`;
      this.tipEl.classList.remove('bump');
      void this.tipEl.offsetWidth;
      this.tipEl.classList.add('bump');
    }
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

  controls(mode: 'seated' | 'walk' | 'ghost' | 'arcade' | 'foosball' | 'chair' | 'nap' | 'none') {
    if (this.controlsEl.dataset.m === mode) return;
    this.controlsEl.dataset.m = mode;
    const k = (key: string, t: string) => `<div><kbd>${key}</kbd>${t}</div>`;
    const map = {
      seated: k('ESPAÇO', 'ALT-TAB') + k('F', 'planilha no ritmo') + k('B', 'basquete (segure)') + k('G', 'lanche') + k('H', 'fones') + k('Btn dir.', 'espiar') + k('E', 'levantar'),
      walk: k('WASD', 'andar') + k('Mouse', 'olhar') + k('CLIQUE / E', 'interagir') + k('Btn dir.', 'arremessar papel') + k('SHIFT', 'com cuidado') + k('ESPAÇO', 'pulinho'),
      arcade: k('Mouse', 'mirar') + k('WASD', 'mover') + k('Clique', 'atirar') + k('E', 'sair'),
      foosball: k('Clique / ESPAÇO', 'chutar') + k('E', 'sair'),
      chair: k('WASD', 'pilotar') + k('Mouse', 'olhar') + k('E', 'descer'),
      nap: k('E / ESPAÇO', 'acordar'),
      ghost: k('WASD', 'flutuar') + k('ENTER', 'acelerar o tempo'),
      none: '',
    };
    this.controlsEl.innerHTML = map[mode];
  }

  ghost(text: string | null) {
    this.ghostEl.classList.toggle('on', !!text);
    if (text) this.ghostEl.innerHTML = text;
  }

  update(dt: number) {
    this.funPulse = Math.max(0, this.funPulse - dt * 4);
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
