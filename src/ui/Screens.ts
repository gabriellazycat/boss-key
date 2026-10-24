import { B, DAYS } from '../balance';
import { TIE_COLORS } from '../entities/Ball';
import type { AudioEngine } from '../core/Audio';
import type { DayResult } from '../game/Game';
import type { SaveData } from '../save';

const BODY_COLORS = ['#ff8a3d', '#ff6b6b', '#4da3ff', '#3ddc97', '#b79cff', '#ffd23f', '#7F93A6'];
const ACT_LABEL: Record<string, string> = { tiro: '✦ Ball Ops', pesca: '🐟 Pesca Zen', video: '▶ ClipClop', lanche: '🍪 Lanche', basquete: '📄 Basquete' };

const logo = (word1: string, word2: string) =>
  `<div class="logo">${[...word1].map((c, i) => `<span style="animation-delay:${i * 0.09}s">${c}</span>`).join('')}<span class="sp"></span>${[...word2].map((c, i) => `<span class="k" style="animation-delay:${(i + word1.length) * 0.09}s">${c}</span>`).join('')}</div>`;

/** Telas HTML: boot, menu, como jogar, opções, briefing, relatório e final. */
export class Screens {
  private el: HTMLElement | null = null;
  private wipeEl: HTMLElement;

  constructor(private ui: HTMLElement, private audio: AudioEngine, private data: SaveData, private onSettings: () => void) {
    this.wipeEl = document.createElement('div');
    this.wipeEl.className = 'wipe';
    ui.appendChild(this.wipeEl);
  }

  private mount(cls: string, html: string) {
    this.clear();
    const el = document.createElement('div');
    el.className = `screen interactive ${cls}`;
    el.innerHTML = html;
    this.ui.appendChild(el);
    this.el = el;
    el.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mouseenter', () => this.audio.play('hover', 0.8));
      b.addEventListener('click', () => this.audio.play('click', 0.9));
    });
    return el;
  }

  clear() {
    this.el?.remove();
    this.el = null;
  }

  /** Cortina amarela entre telas. */
  wipe(mid: () => void) {
    this.wipeEl.className = 'wipe in';
    setTimeout(() => {
      mid();
      this.wipeEl.className = 'wipe out';
      setTimeout(() => (this.wipeEl.className = 'wipe'), 450);
    }, 360);
  }

  private on(sel: string, fn: () => void) {
    this.el?.querySelector(sel)?.addEventListener('click', fn);
  }

  boot(onStart: () => void) {
    const el = this.mount('boot', `${logo('BOSS', 'KEY')}<div class="press">clique para começar o expediente</div><div class="hint">🎧 recomendado jogar com som — o áudio é parte da mecânica</div>`);
    el.addEventListener('click', () => onStart(), { once: true });
  }

  menu(h: { play: () => void; howto: () => void; options: () => void; credits: () => void }) {
    const best = this.data.bestScore ? `<div class="best">🏆 melhor semana: ${this.data.bestScore} pts — ${this.data.bestTitle}</div>` : '';
    this.mount(
      'menu',
      `<div class="menu-inner">
        ${logo('BOSS', 'KEY')}
        <div class="tagline">Slack Off <em>Together</em> — finja que trabalha.</div>
        <button class="btn" id="m-play">▶  Começar a semana (solo)</button>
        <button class="btn alt" id="m-how">❓  Como jogar</button>
        <button class="btn alt" id="m-opt">⚙  Opções</button>
        <button class="btn alt" id="m-cred">★  Créditos</button>
        ${best}
        <div class="menu-foot">Solo com bots · Coop · v0.3 · multiplayer em breve</div>
      </div>`,
    );
    this.on('#m-play', h.play);
    this.on('#m-how', h.howto);
    this.on('#m-opt', h.options);
    this.on('#m-cred', h.credits);
  }

  howto(back: () => void) {
    this.mount(
      'dim',
      `<div class="card howto">
        <h2>Como jogar</h2>
        <div class="steps">
          <div class="st"><span class="ico">🚶</span><b>Ande pelo escritório</b><kbd>WASD</kbd> anda, o mouse olha. Mire no <b style="display:inline;color:#ffd23f">seu PC</b> e <kbd>CLIQUE</kbd> para sentar. <kbd>E</kbd> levanta.</div>
          <div class="st"><span class="ico">🎮</span><b>Enrole no PC</b>Abra jogos e vídeos na barra de tarefas. Isso enche a barra de <b style="display:inline;color:#3ddc97">FUN</b>. Bata a meta do dia.</div>
          <div class="st"><span class="ico">🕹</span><b>Enrole andando</b>Na <b style="display:inline">sala de descompressão</b> (sul): fliperama, pebolim, soneca no sofá, corrida de cadeira, máquina de lanche. Fofoque com colegas na cozinha.</div>
          <div class="st"><span class="ico">🏀</span><b>Papel na cesta</b>Segure o <b style="display:inline">botão direito</b> para mirar e solte para arremessar em qualquer lixeira. De longe vale mais!</div>
          <div class="st"><span class="ico">🚪</span><b>Ouça a porta</b>A porta do chefe rangeu = ronda. Passos são 3D e o radar mostra a direção. Se ele te VIR na farra, é demissão.</div>
          <div class="st"><span class="ico">⌨️</span><b>ALT-TAB = <kbd>ESPAÇO</kbd></b>Sentado, volte para a planilha antes de ele parar atrás de você. No último instante = <b style="display:inline;color:#ffd23f">CLUTCH!</b></div>
          <div class="st"><span class="ico">👁</span><b>Suspeita</b>O olho no topo. Planilha no ritmo (<kbd>F</kbd>), café e relatórios baixam. Passear sem nada na mão sobe.</div>
          <div class="st"><span class="ico">☕</span><b>Puxa-saco</b>Leve café da cozinha à bandeja do chefe. <kbd>SHIFT</kbd> anda sem derramar. Café na mão é álibi.</div>
          <div class="st"><span class="ico">⚠️</span><b>Não deixe o jogo aberto</b>Se o chefe passar na sua mesa vazia com um jogo na tela, a Suspeita dispara.</div>
          <div class="st"><span class="ico">👻</span><b>Demitido?</b>Só por hoje: vire fantasma. Se o time inteiro cair no mesmo dia: advertência. 3 = fim.</div>
        </div>
        <div class="row"><button class="btn" id="b-back">Entendi!</button></div>
      </div>`,
    );
    this.on('#b-back', back);
  }

  credits(back: () => void) {
    this.mount(
      'dim',
      `<div class="card howto">
        <h2>Créditos</h2>
        <p style="font-size:18px;line-height:1.5">Design: <b>BOSS KEY GDD v1.1</b><br>
        Código, arte procedural e áudio sintetizado: feitos sob medida em Three.js + Web Audio — sem assets de terceiros.<br>
        Fontes: Fredoka e JetBrains Mono (OFL).<br><br>
        Nenhuma bola foi demitida de verdade durante o desenvolvimento.</p>
        <div class="row"><button class="btn" id="b-back">Voltar</button></div>
      </div>`,
    );
    this.on('#b-back', back);
  }

  options(back: () => void) {
    const s = this.data.settings;
    const seg = (id: string, opts: [string, string][], cur: string) =>
      `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    this.mount(
      'dim',
      `<div class="card">
        <h2 style="margin:0;font-size:36px;color:#ffd23f">Opções</h2>
        <div class="opts">
          <div class="opt"><label>NOME</label><input type="text" id="o-name" maxlength="14" value="${s.name}"></div>
          <div class="opt"><label>COR DA SUA BOLA</label><div class="ties bodies">${BODY_COLORS.map((c) => `<button data-c="${c}" class="${c === s.color ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
          <div class="opt"><label>COR DA GRAVATA</label><div class="ties">${TIE_COLORS.map((c) => `<button data-c="${c}" class="${c === s.tie ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
          <div class="opt"><label>VOLUME GERAL</label><input type="range" id="o-master" min="0" max="1" step="0.05" value="${s.master}"></div>
          <div class="opt"><label>EFEITOS</label><input type="range" id="o-sfx" min="0" max="1" step="0.05" value="${s.sfx}"></div>
          <div class="opt"><label>MÚSICA</label><input type="range" id="o-music" min="0" max="1" step="0.05" value="${s.music}"></div>
          <div class="opt"><label>SENSIBILIDADE DO MOUSE</label><input type="range" id="o-sens" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}"></div>
          <div class="opt"><label>QUALIDADE</label>${seg('o-q', [['alta', 'Alta'], ['baixa', 'Baixa']], s.quality)}</div>
          <div class="opt"><label>DURAÇÃO DO DIA</label>${seg('o-len', [['normal', '5 min'], ['curto', '3 min']], s.dayLength)}</div>
          <div class="opt"><label>LEGENDAS DE SOM</label>${seg('o-sub', [['1', 'Ligadas'], ['0', 'Desligadas']], s.subtitles ? '1' : '0')}</div>
          <div class="opt"><label>TUTORIAL (SEGUNDA)</label>${seg('o-tut', [['1', 'Ligado'], ['0', 'Desligado']], s.tutorial ? '1' : '0')}</div>
        </div>
        <div class="row"><button class="btn" id="b-back">Salvar</button></div>
      </div>`,
    );
    const el = this.el!;
    const num = (id: string) => parseFloat((el.querySelector(id) as HTMLInputElement).value);
    const segVal = (id: string, set: (v: string) => void) =>
      el.querySelectorAll(`${id} button`).forEach((b) =>
        b.addEventListener('click', () => {
          el.querySelectorAll(`${id} button`).forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          set((b as HTMLElement).dataset.v!);
        }),
      );
    segVal('#o-q', (v) => (s.quality = v as 'alta' | 'baixa'));
    segVal('#o-len', (v) => (s.dayLength = v as 'normal' | 'curto'));
    segVal('#o-sub', (v) => (s.subtitles = v === '1'));
    segVal('#o-tut', (v) => (s.tutorial = v === '1'));
    el.querySelectorAll('.ties:not(.bodies) button').forEach((b) =>
      b.addEventListener('click', () => {
        el.querySelectorAll('.ties:not(.bodies) button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        s.tie = (b as HTMLElement).dataset.c!;
        this.onSettings();
      }),
    );
    el.querySelectorAll('.ties.bodies button').forEach((b) =>
      b.addEventListener('click', () => {
        el.querySelectorAll('.ties.bodies button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        s.color = (b as HTMLElement).dataset.c!;
        this.onSettings();
      }),
    );
    el.querySelectorAll('input[type=range]').forEach((r) =>
      r.addEventListener('input', () => {
        s.master = num('#o-master');
        s.sfx = num('#o-sfx');
        s.music = num('#o-music');
        s.sensitivity = num('#o-sens');
        this.onSettings();
      }),
    );
    this.on('#b-back', () => {
      s.name = (el.querySelector('#o-name') as HTMLInputElement).value.trim() || 'Você';
      this.onSettings();
      back();
    });
  }

  private weekStrip(cur: number, results: DayResult[]) {
    return `<div class="week">${DAYS.map((d, i) => {
      const r = results[i];
      const cls = i === cur ? 'cur' : r ? (r.met && !r.fired ? 'ok' : 'bad') : '';
      return `<div class="d ${cls}">${d.short}${r ? (r.met ? ' ✓' : ' ✗') : ''}</div>`;
    }).join('')}</div>`;
  }

  briefing(i: number, results: DayResult[], warnings: number, go: () => void) {
    const d = DAYS[i];
    const prev = i > 0 ? DAYS[i - 1].unlocked : [];
    const chips = d.unlocked.map((a) => `<span class="chip ${prev.includes(a) || i === 0 ? '' : 'new'}">${ACT_LABEL[a]}${prev.includes(a) || i === 0 ? '' : ' · NOVO'}</span>`).join('');
    this.mount(
      'dim',
      `<div class="card brief">
        ${this.weekStrip(i, results)}
        <h1>${d.name}</h1>
        <div class="bsub">Dia ${i + 1} de 5 · ${warnings > 0 ? `⚠ ${warnings} advertência(s)` : 'nenhuma advertência'}</div>
        <div class="grid">
          <div class="cell"><div class="k">QUEM VIGIA</div><div class="v">${d.bossName}</div><div class="d">${d.novelty}</div></div>
          <div class="cell"><div class="k">META DE FUN</div><div class="v meta">${B.FUN_META[i]}</div></div>
          <div class="cell big"><div class="k">EVENTO DO MEIO-DIA · ${d.eventName.toUpperCase()}</div><div class="d">${d.eventDesc}</div></div>
          <div class="cell big"><div class="k">NO SEU PC E NA MESA</div><div class="acts">${chips}</div><div class="k" style="margin-top:10px">PELO ESCRITÓRIO (TODO DIA)</div><div class="acts"><span class="chip">🕹 Fliperama</span><span class="chip">⚽ Pebolim</span><span class="chip">🛋 Soneca</span><span class="chip">🪑 Corrida de cadeira</span><span class="chip">🍫 Máquina</span><span class="chip">🗣 Fofoca</span><span class="chip">🏀 Cesta de papel</span></div></div>
        </div>
        <div class="row"><button class="btn" id="b-go">Bater o ponto ▶</button></div>
      </div>`,
    );
    this.on('#b-go', go);
  }

  report(r: DayResult, warnings: number, last: boolean, lost: boolean, next: () => void) {
    const stamp = r.warning ? `<div class="stamp bad">ADVERTÊNCIA ${warnings}/3</div>` : r.fired ? `<div class="stamp bad">DEMITIDO HOJE</div>` : r.met ? `<div class="stamp gold">META BATIDA</div>` : `<div class="stamp bad">TÉDIO</div>`;
    const rows = [
      { name: `${'Você'}`, fun: r.fun, fired: r.fired, me: true },
      ...r.bots.map((b) => ({ ...b, me: false })),
    ]
      .map((x) => `<tr class="${x.me ? 'me' : ''}"><td>${x.me ? '⭐ ' : ''}${x.name}</td><td><div class="barwrap"><i style="width:${Math.min(100, x.fun)}%;${x.fun >= r.meta ? 'background:#ffd23f' : ''}"></i><b style="left:${r.meta}%"></b></div></td><td class="n">${Math.floor(x.fun)}</td><td>${x.fired ? '🔥 demitido' : '✓'}</td></tr>`)
      .join('');
    this.mount(
      'dim',
      `<div class="card report">
        <h1>Fim do expediente — ${DAYS[r.day].name}</h1>
        ${stamp}
        <div class="stats">
          <div class="stat"><div class="v" style="color:#3ddc97">${Math.floor(r.fun)}</div><div class="k">FUN (meta ${r.meta})</div></div>
          <div class="stat"><div class="v" style="color:#ffd23f">${r.clutches}</div><div class="k">CLUTCHES</div></div>
          <div class="stat"><div class="v" style="color:#ff4d6d">${Math.round(r.peakSus)}</div><div class="k">PICO DE SUSPEITA</div></div>
          <div class="stat"><div class="v">${r.score}</div><div class="k">PONTOS</div></div>
        </div>
        ${r.fired ? `<p style="margin:-6px 0 14px;color:#ff8fa3">Motivo: ${r.firedReason}</p>` : ''}
        ${!r.met && !last ? `<p style="margin:-6px 0 14px;color:#ffb347">Não bateu a meta: amanhã você começa entediado (+15 de Suspeita).</p>` : ''}
        <table><tr><th>FUNCIONÁRIO</th><th>FUN</th><th></th><th>STATUS</th></tr>${rows}</table>
        <div class="row"><button class="btn" id="b-next">${lost ? 'Ver resultado' : last ? 'Fim da semana ▶' : 'Próximo dia ▶'}</button></div>
      </div>`,
    );
    this.on('#b-next', next);
  }

  final(results: DayResult[], warnings: number, total: number, title: string, grade: string, isBest: boolean, menu: () => void, again: () => void) {
    const lost = warnings >= B.ADVERTENCIAS_LIMITE;
    this.mount(
      'dim',
      `<div class="card report final" style="text-align:center">
        ${this.weekStrip(-1, results)}
        <div style="font-size:18px;color:#a9b1c6;letter-spacing:.14em;font-weight:700">${lost ? 'DEMISSÃO EM MASSA' : 'SEMANA CONCLUÍDA'}</div>
        <div class="grade">${grade}</div>
        <div class="title">${title}</div>
        <div class="stats">
          <div class="stat"><div class="v">${total}</div><div class="k">PONTOS${isBest ? ' · RECORDE!' : ''}</div></div>
          <div class="stat"><div class="v" style="color:#3ddc97">${results.filter((r) => r.met).length}/5</div><div class="k">METAS</div></div>
          <div class="stat"><div class="v" style="color:#ffd23f">${results.reduce((a, r) => a + r.clutches, 0)}</div><div class="k">CLUTCHES</div></div>
          <div class="stat"><div class="v" style="color:#ff4d6d">${warnings}</div><div class="k">ADVERTÊNCIAS</div></div>
        </div>
        <div class="row" style="justify-content:center"><button class="btn alt" id="b-menu">Menu</button><button class="btn" id="b-again">Jogar outra semana</button></div>
      </div>`,
    );
    this.on('#b-menu', menu);
    this.on('#b-again', again);
  }

  pause(resume: () => void, quit: () => void) {
    this.mount(
      'dim',
      `<div class="card" style="text-align:center;min-width:360px">
        <h2 style="margin:0 0 6px;font-size:44px;color:#ffd23f">Pausa pro café</h2>
        <p style="color:#a9b1c6;margin:0 0 20px">no solo o chefe também espera</p>
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center">
          <button class="btn" id="b-res">Voltar ao trabalho</button>
          <button class="btn pink" id="b-quit">Pedir as contas (menu)</button>
        </div>
      </div>`,
    );
    this.on('#b-res', resume);
    this.on('#b-quit', quit);
  }
}
