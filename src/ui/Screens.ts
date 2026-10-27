import { B, DAYS } from '../balance';
import { TIE_COLORS } from '../entities/Ball';
import { PLAYABLE } from '../characters/designs';
import { portraits } from '../characters/portrait';
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

  menu(h: { play: () => void; character: () => void; howto: () => void; options: () => void; credits: () => void }) {
    const best = this.data.bestScore ? `<div class="best">🏆 melhor semana: ${this.data.bestScore} pts — ${this.data.bestTitle}</div>` : '';
    this.mount(
      'menu',
      `<div class="menu-inner">
        ${logo('BOSS', 'KEY')}
        <div class="tagline">Slack Off <em>Together</em> — finja que trabalha.</div>
        <button class="btn" id="m-play">▶  Começar a semana (solo)</button>
        <button class="btn alt" id="m-char">🐾  Seu personagem</button>
        <button class="btn alt" id="m-how">❓  Como jogar</button>
        <button class="btn alt" id="m-opt">⚙  Opções</button>
        <button class="btn alt" id="m-cred">★  Créditos</button>
        ${best}
        <div class="menu-foot">Solo com bots · Coop · v0.3 · multiplayer em breve</div>
      </div>`,
    );
    this.on('#m-play', h.play);
    this.on('#m-char', h.character);
    this.on('#m-how', h.howto);
    this.on('#m-opt', h.options);
    this.on('#m-cred', h.credits);
  }

  howto(back: () => void) {
    this.mount(
      'dim',
      `<div class="card howto">
        <h2>Como jogar</h2>
        <div class="rules">
          <div class="rule"><span class="n">1</span><span class="ico">🎮</span><b>Divirta-se</b>Jogue no PC e use a sala de descompressão para encher a barra de <em class="g">FUN</em> até a <em>META</em> antes das 18h.</div>
          <div class="rule"><span class="n">2</span><span class="ico">👂</span><b>Ouça o chefe</b>Porta rangeu = ele saiu da sala. Sentado, aperte <kbd>ESPAÇO</kbd> para esconder o jogo. Andando, volte para a mesa.</div>
          <div class="rule"><span class="n">3</span><span class="ico">🙈</span><b>Não seja visto</b>Se ele te <em class="p">VIR</em> se divertindo, é flagrante: demitido por hoje. 3 advertências = fim da semana.</div>
        </div>
        <h3>A tela</h3>
        <div class="legend">
          <div><i>👁</i><span><b>Olho (topo)</b> Suspeita do chefe. Cheia = ele vem te flagrar.</span></div>
          <div><i>🟩</i><span><b>Barra FUN</b> Sua diversão. A linha branca é a meta.</span></div>
          <div><i>🎯</i><span><b>Cartão (esq.)</b> O que fazer agora.</span></div>
          <div><i>🚨</i><span><b>Faixa vermelha</b> Chefe fora da sala + o que fazer.</span></div>
        </div>
        <h3>Truques</h3>
        <div class="steps">
          <div class="st"><span class="ico">⌨️</span><b>Planilha no ritmo</b>Sentado, <kbd>F</kbd> quando o anel fechar baixa a Suspeita.</div>
          <div class="st"><span class="ico">⚡</span><b>CLUTCH</b>Esconder o jogo no último instante dá bônus de FUN.</div>
          <div class="st"><span class="ico">☕</span><b>Café = álibi</b>Com café na mão você pode andar. Entregue na bandeja do chefe (<kbd>SHIFT</kbd> não derrama).</div>
          <div class="st"><span class="ico">🚽</span><b>Banheiro</b>Perseguido? Esconda-se no banheiro para despistar.</div>
          <div class="st"><span class="ico">🏀</span><b>Papel na cesta</b>Segure o botão direito e solte numa lixeira. De longe vale mais.</div>
          <div class="st"><span class="ico">⚠️</span><b>Feche o jogo</b>Levantou com jogo aberto? Se o chefe passar na mesa vazia, a Suspeita dispara.</div>
        </div>
        <p class="howto-foot">Durante o dia, <b>segure <kbd>TAB</kbd></b> para ver controles, legenda e o que ainda dá para fazer.</p>
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

  /** Escolha do personagem: espécie (bichos ou Telinha), cor da camisa e da gravata. O mascote do menu mostra ao vivo. */
  character(back: () => void) {
    const s = this.data.settings;
    const swatches = (cls: string, list: string[], cur: string) =>
      `<div class="ties ${cls}">${list.map((c) => `<button data-c="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>`;
    const el = this.mount(
      'pick',
      `<div class="card pick-card">
        <h2>Seu personagem</h2>
        <p class="pick-sub">No escritório todo mundo é bicho: o X9 é um rato, o chefe um buldogue e o dono um tubarão. E você?</p>
        <div class="species">${PLAYABLE.map((p) => `<button class="sp${p.id === s.species ? ' on' : ''}" data-id="${p.id}"><span class="pic"><img alt="${p.name}"></span><b>${p.name}</b><small>${p.blurb}</small></button>`).join('')}</div>
        <div class="opts">
          <div class="opt"><label id="l-color">${s.species === 'telinha' ? 'COR DO MONITOR' : 'COR DA CAMISA'}</label>${swatches('bodies', BODY_COLORS, s.color)}</div>
          <div class="opt"><label>COR DA GRAVATA</label>${swatches('neck', TIE_COLORS, s.tie)}</div>
        </div>
        <div class="row"><button class="btn" id="b-back">Pronto!</button></div>
      </div>`,
    );
    const imgs = [...el.querySelectorAll<HTMLImageElement>('.sp img')];
    let gen = 0;
    const refresh = () => {
      const my = ++gen;
      void portraits(PLAYABLE.map((p) => ({ species: p.id, color: s.color, tie: s.tie }))).then((urls) => {
        if (my === gen) urls.forEach((u, i) => (imgs[i].src = u));
      });
    };
    const pickIn = (sel: string, set: (b: HTMLElement) => void) =>
      el.querySelectorAll<HTMLElement>(sel).forEach((b) =>
        b.addEventListener('click', () => {
          el.querySelectorAll(sel).forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          set(b);
          this.onSettings();
        }),
      );
    pickIn('.sp', (b) => {
      s.species = b.dataset.id as typeof s.species;
      el.querySelector('#l-color')!.textContent = s.species === 'telinha' ? 'COR DO MONITOR' : 'COR DA CAMISA';
    });
    pickIn('.ties.bodies button', (b) => {
      s.color = b.dataset.c!;
      refresh();
    });
    pickIn('.ties.neck button', (b) => {
      s.tie = b.dataset.c!;
      refresh();
    });
    refresh();
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
    const novos = i === 0 ? [] : d.unlocked.filter((a) => !prev.includes(a));
    this.mount(
      'dim',
      `<div class="card brief">
        ${this.weekStrip(i, results)}
        <h1>${d.name}</h1>
        <div class="bsub">Dia ${i + 1} de 5 · ${warnings > 0 ? `⚠ ${warnings} advertência(s)` : 'nenhuma advertência'}</div>
        <div class="grid">
          <div class="cell"><div class="k">QUEM VIGIA</div><div class="v">${d.bossName}</div></div>
          <div class="cell"><div class="k">META DE FUN</div><div class="v meta">${B.FUN_META[i]}</div></div>
          <div class="cell"><div class="k">EVENTO</div><div class="v">${d.eventName}</div></div>
        </div>
        <p class="brief-line">${d.eventDesc}</p>
        <p class="brief-line"><b>Novidade:</b> ${d.novelty}${novos.length ? `<br><span class="new">NOVO NO SEU PC: ${novos.map((a) => ACT_LABEL[a]).join(', ')}</span>` : ''}</p>
        <div class="row"><span class="brief-hint">segure <kbd>TAB</kbd> no jogo para ajuda</span><button class="btn" id="b-go">Bater o ponto ▶</button></div>
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

  pause(resume: () => void, quit: () => void, help?: () => void) {
    this.mount(
      'dim',
      `<div class="card" style="text-align:center;min-width:360px">
        <h2 style="margin:0 0 6px;font-size:44px;color:#ffd23f">Pausa pro café</h2>
        <p style="color:#a9b1c6;margin:0 0 20px">no solo o chefe também espera</p>
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center">
          <button class="btn" id="b-res">Voltar ao trabalho</button>
          ${help ? '<button class="btn alt" id="b-help">❓ Como jogar</button>' : ''}
          <button class="btn pink" id="b-quit">Pedir as contas (menu)</button>
        </div>
        <p style="color:#a9b1c6;margin:16px 0 0;font-size:14px">no jogo, segure <b>TAB</b> para ver controles e legenda</p>
      </div>`,
    );
    this.on('#b-res', resume);
    if (help) this.on('#b-help', help);
    this.on('#b-quit', quit);
  }
}
