import { RUN, dayTitle } from '../balance';
import { TIE_COLORS } from '../entities/Ball';
import { PLAYABLE } from '../characters/designs';
import { portraits } from '../characters/portrait';
import type { AudioEngine } from '../core/Audio';
import { SUS_SOURCE_LABEL, type DayResult } from '../game/Game';
import type { SaveData } from '../save';

const BODY_COLORS = ['#ff8a3d', '#ff6b6b', '#4da3ff', '#3ddc97', '#b79cff', '#ffd23f', '#7F93A6'];

/** Relatório da run em .json (teste com pessoas): cada dia com FUN, meta, Suspeita por motivo, eventos e itens. */
function saveRunReport(results: DayResult[], total: number, title: string, grade: string) {
  const when = new Date();
  const data = {
    jogo: 'BOSS KEY',
    quando: when.toISOString(),
    tela: `${innerWidth}×${innerHeight}`,
    navegador: navigator.userAgent,
    placar: Math.floor(total),
    titulo: title,
    nota: grade,
    dias: results.map((r) => ({
      dia: r.day + 1,
      chefia: r.boss,
      eventos: r.events,
      fun: Math.round(r.fun * 10) / 10,
      meta: r.goal,
      funDaMeta: Math.round(r.goalFun * 10) / 10,
      perdeuVida: r.lifeLost || null,
      demitido: r.fired ? r.firedReason : null,
      suspeita: { inicio: Math.round(r.susStart), fim: Math.round(r.susEnd), amanha: Math.round(r.susNext) },
      suspeitaPorMotivo: Object.fromEntries(r.susLog.map(([k, v]) => [SUS_SOURCE_LABEL[k] ?? k, Math.round(v)])),
      clutches: r.clutches,
      tarefas: r.tasks,
      fixa: r.fixed,
      diversoes: r.funTasks.map((f) => `${f.label}${f.done ? ' ✓' : ''}`),
      vale: r.vd,
      cofre: r.wallet,
      itens: r.items,
    })),
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `bosskey-run-${when.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const logo = (word1: string, word2: string) =>
  `<div class="logo">${[...word1].map((c, i) => `<span style="animation-delay:${i * 0.09}s">${c}</span>`).join('')}<span class="sp"></span>${[...word2].map((c, i) => `<span class="k" style="animation-delay:${(i + word1.length) * 0.09}s">${c}</span>`).join('')}</div>`;

/** Telas HTML: boot, menu, como jogar, opções, relatório, loja e final. */
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

  menu(h: { play: () => void; host: () => void; join: () => void; character: () => void; howto: () => void; options: () => void; credits: () => void }) {
    const best = this.data.bestScore ? `<div class="best">🏆 melhor run: ${this.data.bestScore} FUN — ${this.data.bestTitle}</div>` : '';
    this.mount(
      'menu',
      `<div class="menu-inner">
        ${logo('BOSS', 'KEY')}
        <div class="tagline">Slack Off <em>Together</em> — finja que trabalha.</div>
        <button class="btn" id="m-play">▶  Jogar sozinho</button>
        <button class="btn" id="m-host">🛗  Criar sala</button>
        <button class="btn alt" id="m-join">🔑  Entrar com código</button>
        <button class="btn alt" id="m-char">📺  Seu personagem</button>
        <button class="btn alt" id="m-how">❓  Como jogar</button>
        <button class="btn alt" id="m-opt">⚙  Opções</button>
        <button class="btn alt" id="m-cred">★  Créditos</button>
        ${best}
        <div class="menu-foot">Solo com bots · Multiplayer até 6 · v0.5</div>
      </div>`,
    );
    this.on('#m-play', h.play);
    this.on('#m-host', h.host);
    this.on('#m-join', h.join);
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
          <div class="rule"><span class="n">1</span><span class="ico">🎮</span><b>Divirta-se</b>Todo dia saem <em class="g">1 diversão grande + 3 pequenas</em>. Só elas valem: o <em class="g">FUN</em> somado é o seu placar.</div>
          <div class="rule"><span class="n">2</span><span class="ico">📞</span><b>Trabalhe o mínimo</b>Feche a <em>tarefa fixa</em> e atenda o telefone: tarefa do chefe esperando faz a Suspeita subir cada vez mais rápido.</div>
          <div class="rule"><span class="n">3</span><span class="ico">🙈</span><b>Não seja visto</b>Se o chefe te <em class="p">VIR</em> se divertindo, é flagrante. Os dias não acabam: aguente o máximo que der.</div>
        </div>
        <h3>A tela</h3>
        <div class="legend">
          <div><i>👁</i><span><b>Suspeita (topo)</b> É sua e vai para o dia seguinte. Cheia = ele vem te flagrar.</span></div>
          <div><i>🟩</i><span><b>Barra FUN</b> A diversão de hoje e o total da run.</span></div>
          <div><i>🎯</i><span><b>Cartão (esq.)</b> O que fazer agora e as diversões de hoje.</span></div>
          <div><i>🚨</i><span><b>Faixa vermelha</b> Chefe fora da sala + o que fazer.</span></div>
        </div>
        <h3>Truques</h3>
        <div class="steps">
          <div class="st"><span class="ico">⏫</span><b>Cada dia pesa mais</b>A Suspeita sobe ×${RUN.growth.toFixed(2).replace('.', ',')} a cada dia. Entregar tarefa do chefe baixa.</div>
          <div class="st"><span class="ico">⚡</span><b>CLUTCH</b>Esconder o jogo no último instante dá bônus de FUN.</div>
          <div class="st"><span class="ico">☕</span><b>Álibi</b>Com tarefa do chefe ou café na mão você pode andar. <kbd>SHIFT</kbd> não derrama.</div>
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

  /** Escolha do personagem: acessório da Telinha, cor do monitor e da gravata. O mascote do menu mostra ao vivo. */
  character(back: () => void) {
    const s = this.data.settings;
    const swatches = (cls: string, list: string[], cur: string) =>
      `<div class="ties ${cls}">${list.map((c) => `<button data-c="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>`;
    const el = this.mount(
      'pick',
      `<div class="card pick-card">
        <h2>Seu personagem</h2>
        <p class="pick-sub">No escritório todo mundo é monitor: o X9 tem câmera, o chefe é tela larga e o dono usa cartola. E você?</p>
        <div class="species">${PLAYABLE.map((p) => `<button class="sp${p.id === s.variant ? ' on' : ''}" data-id="${p.id}"><span class="pic"><img alt="${p.name}"></span><b>${p.name}</b><small>${p.blurb}</small></button>`).join('')}</div>
        <div class="opts">
          <div class="opt"><label>COR DO MONITOR</label>${swatches('bodies', BODY_COLORS, s.color)}</div>
          <div class="opt"><label>COR DA GRAVATA</label>${swatches('neck', TIE_COLORS, s.tie)}</div>
        </div>
        <div class="row"><button class="btn" id="b-back">Pronto!</button></div>
      </div>`,
    );
    const imgs = [...el.querySelectorAll<HTMLImageElement>('.sp img')];
    let gen = 0;
    const refresh = () => {
      const my = ++gen;
      void portraits(PLAYABLE.map((p) => ({ species: 'telinha' as const, color: s.color, tie: s.tie, variant: p.id }))).then((urls) => {
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
      s.variant = b.dataset.id as typeof s.variant;
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

  /** `inGame`: aberta pela pausa — sem nome e tutorial, que só valem no começo da run. */
  options(back: () => void, inGame = false) {
    const s = this.data.settings;
    const seg = (id: string, opts: [string, string][], cur: string) =>
      `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    this.mount(
      'dim',
      `<div class="card">
        <h2 style="margin:0;font-size:36px;color:#ffd23f">Opções</h2>
        <div class="opts">
          ${inGame ? '' : `<div class="opt"><label>NOME</label><input type="text" id="o-name" maxlength="14" value="${s.name}"></div>`}
          <div class="opt"><label>VOLUME GERAL</label><input type="range" id="o-master" min="0" max="1" step="0.05" value="${s.master}"></div>
          <div class="opt"><label>EFEITOS</label><input type="range" id="o-sfx" min="0" max="1" step="0.05" value="${s.sfx}"></div>
          <div class="opt"><label>MÚSICA</label><input type="range" id="o-music" min="0" max="1" step="0.05" value="${s.music}"></div>
          <div class="opt"><label>SENSIBILIDADE DO MOUSE</label><input type="range" id="o-sens" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}"></div>
          <div class="opt"><label>QUALIDADE</label>${seg('o-q', [['alta', 'Alta'], ['baixa', 'Baixa']], s.quality)}</div>
          <div class="opt"><label>LEGENDAS DE SOM</label>${seg('o-sub', [['1', 'Ligadas'], ['0', 'Desligadas']], s.subtitles ? '1' : '0')}</div>
          ${inGame ? '' : `<div class="opt"><label>TUTORIAL (1º DIA)</label>${seg('o-tut', [['1', 'Ligado'], ['0', 'Desligado']], s.tutorial ? '1' : '0')}</div>`}
        </div>
        <div class="row"><button class="btn" id="b-back">${inGame ? 'Salvar e voltar' : 'Salvar'}</button></div>
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
      const name = el.querySelector<HTMLInputElement>('#o-name');
      if (name) s.name = name.value.trim() || 'Você';
      this.onSettings();
      back();
    });
  }

  /** Relatório do fim do dia: placar, diversões, trabalho e de onde veio a Suspeita (e com quanto você volta amanhã). */
  report(r: DayResult, next: () => void) {
    const met = r.goalFun >= r.goal;
    const stamp = r.runOver
      ? '<div class="stamp bad">FIM DA RUN</div>'
      : r.fired
        ? '<div class="stamp bad">DEMITIDO HOJE</div>'
        : met
          ? '<div class="stamp gold">META BATIDA</div>'
          : '<div class="stamp bad">ENTEDIADO</div>';
    const multi = r.bots.some((b) => b.total !== undefined);
    const rows = [{ name: 'Você', fun: r.fun, total: r.total as number | undefined, fired: r.fired, me: true }, ...r.bots.map((b) => ({ ...b, me: false }))]
      .map((x) => `<tr class="${x.me ? 'me' : ''}"><td>${x.me ? '⭐ ' : ''}${x.name}</td><td><div class="barwrap"><i style="width:${Math.min(100, x.fun)}%"></i></div></td><td class="n">${Math.floor(x.fun)}${multi && x.total !== undefined ? ` <small>· ${Math.floor(x.total)}</small>` : ''}</td><td>${x.fired ? '🔥 demitido' : '✓'}</td></tr>`)
      .join('');
    const chips = [
      ...r.funTasks.map((f) => `<span class="rep-ch ${f.done ? 'ok' : ''}">${f.done ? '✓' : '✗'} ${f.big ? '★' : '•'} ${f.icon} ${f.label}</span>`),
      `<span class="rep-ch ${r.fixed.done ? 'ok' : ''}">${r.fixed.done ? '✓' : '✗'} cota: ${r.fixed.label} (${r.fixed.prog})</span>`,
    ].join('');
    const log = r.susLog.length
      ? r.susLog.map(([k, v]) => `<div class="hrow"><span>${SUS_SOURCE_LABEL[k]}</span><b>+${Math.round(v)}</b></div>`).join('')
      : '<div class="hrow"><span>nada subiu hoje 😇</span></div>';
    const left = RUN.lives - r.strikes;
    const lost = r.lifeLost === 'demitido' ? 'Demitido(a): <b>−1 vida</b>. ' : r.lifeLost === 'tedio' ? `Meta de FUN não batida: <b>−1 vida</b>. ` : r.lifeLost === 'cota' ? 'Cota de trabalho não fechada: <b>−1 vida</b>. ' : '';
    const lives = `Restam <b>${left}</b> ${left === 1 ? 'vida' : 'vidas'}.`;
    const tomorrow = r.runOver ? '' : `${lost}${r.fired ? 'Amanhã você volta sem Suspeita.' : `Amanhã você começa com <b>${Math.round(r.susNext)}</b> de Suspeita${r.fixed.done ? '' : ` (e o chefe cobra a cota aberta: +${RUN.fixedMissSus})`}.`} ${lives}`;
    this.mount(
      'dim',
      `<div class="card report">
        <h1>Fim do expediente — ${dayTitle(r.day)}</h1>
        ${stamp}
        <div class="stats">
          <div class="stat"><div class="v" style="color:${met ? '#3ddc97' : '#ff8fa3'}">${Math.floor(r.goalFun)} / ${r.goal}</div><div class="k">META ${multi ? 'DO TIME' : 'DE FUN'}</div></div>
          <div class="stat"><div class="v" style="color:#ffd23f">${Math.floor(r.total)}</div><div class="k">FUN NA RUN</div></div>
          <div class="stat"><div class="v" style="color:#ff4d6d">${Math.round(r.susStart)} → ${Math.round(r.susEnd)}</div><div class="k">SUSPEITA</div></div>
          <div class="stat"><div class="v">${r.clutches}</div><div class="k">CLUTCHES</div></div>
        </div>
        ${r.fired ? `<p style="margin:-6px 0 14px;color:#ff8fa3">Motivo: ${r.firedReason}</p>` : ''}
        <div class="rep-extra">
          <div>${chips}</div>
          <div class="rep-vd">💰 <b>+${r.vd}</b> de Vale-Diversão <small>(saldo ${r.wallet} · ${r.tasks} tarefa${r.tasks === 1 ? '' : 's'} do chefe entregue${r.tasks === 1 ? '' : 's'})</small></div>
        </div>
        <div class="rep-sus"><div class="pnl-h">DE ONDE VEIO A SUSPEITA</div>${log}</div>
        ${tomorrow ? `<p style="margin:8px 0 14px;color:#ffb347">${tomorrow}</p>` : ''}
        <table><tr><th>FUNCIONÁRIO</th><th>FUN</th><th></th><th>STATUS</th></tr>${rows}</table>
        <div class="row"><button class="btn" id="b-next">${r.runOver ? 'Ver resultado' : 'Próximo dia ▶'}</button></div>
      </div>`,
    );
    this.on('#b-next', next);
  }

  /** Fim da run: dias aguentados, FUN total (o placar) e, no multi, o ranking da sala. */
  final(results: DayResult[], total: number, title: string, grade: string, isBest: boolean, menu: () => void, again: () => void) {
    const last = results[results.length - 1];
    const ranking = last?.bots.some((b) => b.total !== undefined)
      ? `<table><tr><th>JOGADOR</th><th>FUN NA RUN</th></tr>${[{ name: 'Você', total }, ...last.bots.map((b) => ({ name: b.name, total: b.total ?? 0 }))]
          .sort((a, b) => b.total - a.total)
          .map((x, i) => `<tr class="${x.name === 'Você' ? 'me' : ''}"><td>${i + 1}. ${x.name}</td><td class="n">${Math.floor(x.total)}</td></tr>`)
          .join('')}</table>`
      : '';
    const best = results.reduce((a, r) => Math.max(a, r.fun), 0);
    this.mount(
      'dim',
      `<div class="card report final" style="text-align:center">
        <div style="font-size:18px;color:#a9b1c6;letter-spacing:.14em;font-weight:700">FIM DA RUN</div>
        <div class="grade">${grade}</div>
        <div class="title">${title}</div>
        <div class="stats">
          <div class="stat"><div class="v" style="color:#3ddc97">${Math.floor(total)}</div><div class="k">FUN TOTAL${isBest ? ' · RECORDE!' : ''}</div></div>
          <div class="stat"><div class="v" style="color:#ffd23f">${results.length}</div><div class="k">DIAS</div></div>
          <div class="stat"><div class="v">${Math.floor(best)}</div><div class="k">MELHOR DIA</div></div>
          <div class="stat"><div class="v" style="color:#ff4d6d">${results.filter((r) => r.fired).length}</div><div class="k">DEMISSÕES</div></div>
        </div>
        ${ranking}
        <div class="row" style="justify-content:center"><button class="btn alt" id="b-menu">Menu</button><button class="btn alt" id="b-save" title="baixa um .json com os dias desta run (para o teste com pessoas)">Salvar relatório</button><button class="btn" id="b-again">Nova run</button></div>
      </div>`,
    );
    this.on('#b-menu', menu);
    this.on('#b-again', again);
    this.on('#b-save', () => saveRunReport(results, total, title, grade));
  }

  /** Entrar numa sala: código que o amigo passou (ou convite do overlay da Steam). */
  join(go: (code: string) => void, back: () => void, error = '') {
    const el = this.mount(
      'dim',
      `<div class="card" style="text-align:center;min-width:380px">
        <h2 style="margin:0 0 6px;font-size:40px;color:#ffd23f">Entrar na sala</h2>
        <p style="color:#a9b1c6;margin:0 0 16px">peça o código ao anfitrião — ou aceite o convite pela Steam (Shift+Tab)</p>
        <input id="j-code" maxlength="24" autocomplete="off" spellcheck="false" placeholder="CÓDIGO"
          style="font:700 28px var(--font);text-align:center;letter-spacing:.2em;text-transform:uppercase;width:260px;padding:10px;border-radius:12px;border:0">
        <p id="j-err" style="color:#ff8fa3;min-height:20px;margin:10px 0">${error}</p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button class="btn" id="j-go">Entrar</button>
          <button class="btn alt" id="j-back">Voltar</button>
        </div>
      </div>`,
    );
    const input = el.querySelector('#j-code') as HTMLInputElement;
    input.focus();
    const submit = () => {
      const code = input.value.trim();
      if (!code) return;
      (el.querySelector('#j-err') as HTMLElement).textContent = 'procurando a sala…';
      go(code);
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    this.on('#j-go', submit);
    this.on('#j-back', back);
  }

  /** Carregamento entre o menu e a sala (criar, entrar, convite da Steam). `step` troca a legenda. */
  loading(title: string, text: string, cancel?: () => void) {
    const el = this.mount(
      'dim loading',
      `<div class="card" style="text-align:center;min-width:360px">
        <div class="spinner"></div>
        <h2 style="margin:0 0 6px;font-size:38px;color:#ffd23f">${title}</h2>
        <p id="l-step" style="color:#a9b1c6;margin:0 0 20px;min-height:20px">${text}</p>
        ${cancel ? '<button class="btn alt" id="l-cancel">Cancelar</button>' : ''}
      </div>`,
    );
    if (cancel) this.on('#l-cancel', cancel);
    return (t: string) => {
      const p = el.querySelector('#l-step');
      if (p) p.textContent = t;
    };
  }

  /** Aviso simples com um botão (host saiu, sala não encontrada...). */
  notice(title: string, text: string, ok: () => void) {
    this.mount(
      'dim',
      `<div class="card" style="text-align:center;min-width:360px">
        <h2 style="margin:0 0 6px;font-size:38px;color:#ffd23f">${title}</h2>
        <p style="color:#a9b1c6;margin:0 0 20px">${text}</p>
        <button class="btn" id="n-ok">OK</button>
      </div>`,
    );
    this.on('#n-ok', ok);
  }

  pause(resume: () => void, quit: () => void, help?: () => void, online = false, options?: () => void) {
    this.mount(
      'dim',
      `<div class="card" style="text-align:center;min-width:360px">
        <h2 style="margin:0 0 6px;font-size:44px;color:#ffd23f">Pausa pro café</h2>
        <p style="color:#a9b1c6;margin:0 0 20px">${online ? 'online o expediente <b>não para</b> — volte logo!' : 'no solo o chefe também espera'}</p>
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center">
          <button class="btn" id="b-res">Voltar ao trabalho</button>
          ${options ? '<button class="btn alt" id="b-opt">⚙ Opções</button>' : ''}
          ${help ? '<button class="btn alt" id="b-help">❓ Como jogar</button>' : ''}
          <button class="btn pink" id="b-quit">${online ? 'Sair da sala (menu)' : 'Pedir as contas (menu)'}</button>
        </div>
        <p style="color:#a9b1c6;margin:16px 0 0;font-size:14px">no jogo, segure <b>TAB</b> para ver controles e legenda</p>
      </div>`,
    );
    this.on('#b-res', resume);
    if (options) this.on('#b-opt', options);
    if (help) this.on('#b-help', help);
    this.on('#b-quit', quit);
  }
}
