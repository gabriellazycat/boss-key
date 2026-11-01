import { SHOP, SHOP_OFFERS, PRICE_STEP, SHOP_STYLE, UPGRADES, teamPrice, type ShopItemId, type UpgradeId } from '../balance';

/** Cor da faixa de cada estilo na etiqueta. */
const STYLE_COLOR: Record<keyof typeof SHOP_STYLE, string> = { contra: '#c8463d', furtivo: '#2f5fa8', alibi: '#7a5bc0', ganancia: '#2f9a57', raro: '#c9902a' };

/** Quebra o texto em até `max` linhas que cabem em `w` (a última ganha reticências se sobrar). */
function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, w: number, max: number) {
  ctx.font = font;
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const word of words) {
    const t = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(t).width <= w) cur = t;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  if (out.length > max) {
    out.length = max;
    out[max - 1] = out[max - 1].replace(/[\s,.:;]*\S*$/, '') + '…';
  }
  return out;
}

/** Embaralhador com semente (as ofertas da noite são as mesmas para todos da sala). */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Conta de um jogador: o vale dele e o que ele tem (itens pessoais e níveis das trilhas, `up:<id>`). */
interface Account {
  w: number;
  o: Record<string, number>;
}

/**
 * Loja do hall e as contas da run (v0.11): cada jogador tem o próprio vale e os próprios itens; os itens DO TIME
 * (e a sirene) ficam em `team` e valem para todos. No multi o host decide e manda o estado (`apply`) para todo mundo.
 */
export class Shop {
  /** Quem joga neste aparelho (no multi, o id do peer). */
  me = 'me';
  private accounts = new Map<string, Account>();
  readonly team = new Map<string, number>();
  offers: ShopItemId[] = [];
  /** Semente da run (no multi vem do host). */
  seed = Math.floor(Math.random() * 1e9);

  reset() {
    this.accounts.clear();
    this.team.clear();
    this.offers = [];
    this.seed = Math.floor(Math.random() * 1e9);
  }

  acct(who = this.me) {
    let a = this.accounts.get(who);
    if (!a) this.accounts.set(who, (a = { w: 0, o: {} }));
    return a;
  }

  get wallet() {
    return this.acct().w;
  }
  set wallet(v: number) {
    this.acct().w = v;
  }

  /** Quantas cópias (pessoais de `who`, ou do time). */
  count(id: ShopItemId, who = this.me) {
    return this.spec(id).team ? (this.team.get(id) ?? 0) : (this.acct(who).o[id] ?? 0);
  }

  has(id: ShopItemId) {
    return this.count(id) > 0;
  }

  spec(id: ShopItemId) {
    return SHOP.find((s) => s.id === id)!;
  }

  /** Cada cópia a mais custa mais; item do time custa mais quanto maior o time. */
  price(id: ShopItemId, players = 1, who = this.me) {
    const s = this.spec(id);
    const base = Math.round(s.cost * Math.pow(PRICE_STEP, this.count(id, who)));
    return s.team ? teamPrice(base, players) : base;
  }

  soldOut(id: ShopItemId, who = this.me) {
    return this.count(id, who) >= this.spec(id).max;
  }

  /** Sorteia as ofertas da noite do dia `day` (sem repetir, pesando o `weight`, só o que ainda cabe comprar). */
  roll(day: number) {
    const rnd = seeded(this.seed + day * 7919);
    const pool = SHOP.filter((s) => !this.soldOut(s.id));
    const out: ShopItemId[] = [];
    while (out.length < SHOP_OFFERS && pool.length) {
      const total = pool.reduce((a, s) => a + s.weight, 0);
      let r = rnd() * total;
      const i = pool.findIndex((s) => (r -= s.weight) < 0);
      out.push(pool.splice(Math.max(0, i), 1)[0].id);
    }
    this.offers = out;
  }

  /** Tenta comprar com a conta de `who` (devolve o motivo se não der). */
  buy(id: ShopItemId, who = this.me, players = 1): true | string {
    if (this.soldOut(id, who)) return 'esgotado';
    const p = this.price(id, players, who);
    const a = this.acct(who);
    if (a.w < p) return `faltam ${p - a.w} de vale`;
    a.w -= p;
    if (this.spec(id).team) this.team.set(id, (this.team.get(id) ?? 0) + 1);
    else a.o[id] = (a.o[id] ?? 0) + 1;
    return true;
  }

  // ------------------------------------------------------------------ trilhas de upgrade
  upSpec(id: UpgradeId) {
    return UPGRADES.find((u) => u.id === id)!;
  }

  /** Nível da trilha (0 = não comprou). */
  level(id: UpgradeId, who = this.me) {
    return this.upSpec(id).kind === 'team' ? (this.team.get(`up:${id}`) ?? 0) : (this.acct(who).o[`up:${id}`] ?? 0);
  }

  /** Preço do próximo nível (null = trilha completa). */
  upPrice(id: UpgradeId, players = 1, who = this.me) {
    const u = this.upSpec(id);
    const c = u.costs[this.level(id, who)];
    if (c === undefined) return null;
    return u.kind === 'team' ? teamPrice(c, players) : c;
  }

  buyUp(id: UpgradeId, who = this.me, players = 1): true | string {
    const p = this.upPrice(id, players, who);
    if (p === null) return 'nível máximo';
    const a = this.acct(who);
    if (a.w < p) return `faltam ${p - a.w} de vale`;
    a.w -= p;
    const key = `up:${id}`;
    if (this.upSpec(id).kind === 'team') this.team.set(key, (this.team.get(key) ?? 0) + 1);
    else a.o[key] = (a.o[key] ?? 0) + 1;
    return true;
  }

  /** Estado das contas para a rede. */
  state() {
    return { a: Object.fromEntries(this.accounts) as Record<string, Account>, tm: Object.fromEntries(this.team) as Record<string, number> };
  }

  apply(st: { a: Record<string, Account>; tm: Record<string, number> }) {
    this.accounts.clear();
    for (const [k, v] of Object.entries(st.a)) this.accounts.set(k, { w: v.w, o: { ...v.o } });
    this.team.clear();
    for (const [k, v] of Object.entries(st.tm)) if (v > 0) this.team.set(k, v);
  }

  /** Etiqueta de uma trilha no balcão de upgrades (canvas 512×640): nível atual, o próximo e o preço. */
  drawUpgrade(ctx: CanvasRenderingContext2D, id: UpgradeId, players: number) {
    const c = ctx.canvas;
    const W = c.width;
    const H = c.height;
    const u = this.upSpec(id);
    const lvl = this.level(id);
    const price = this.upPrice(id, players);
    const col = u.kind === 'pc' ? '#2f6fd0' : u.kind === 'char' ? '#c0602f' : '#b3162e';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(14, 22, W - 28, H - 30, 34);
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.roundRect(10, 10, W - 28, H - 30, 34);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = (W - 8) / 2;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(10, 10, W - 28, 76, [34, 34, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px Fredoka, sans-serif';
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3px';
    ctx.fillText(u.kind === 'pc' ? 'SEU PC' : u.kind === 'char' ? 'VOCÊ' : 'TIME', cx, 50);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    ctx.fillStyle = col + '22';
    ctx.beginPath();
    ctx.arc(cx, 176, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = '100px sans-serif';
    ctx.fillText(u.icon, cx, 182);
    ctx.fillStyle = '#1b2233';
    const lines = wrap(ctx, u.name, '700 44px Fredoka, sans-serif', W - 70, 2);
    lines.forEach((l, i) => ctx.fillText(l, cx, 292 + i * 48));
    // níveis: bolinhas cheias = comprados
    const n = u.costs.length;
    const y = 292 + lines.length * 48 + 4;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < lvl ? col : '#d9d4c8';
      ctx.beginPath();
      ctx.arc(cx + (i - (n - 1) / 2) * 40, y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3d4458';
    const next = price === null ? 'Trilha completa!' : `Próximo: ${u.desc[lvl]}`;
    wrap(ctx, next, '600 28px Fredoka, sans-serif', W - 70, 3).forEach((l, i) => ctx.fillText(l, cx, y + 44 + i * 34));
    const can = price !== null && this.wallet >= price;
    ctx.fillStyle = price === null ? '#8a90a2' : can ? '#1f9e63' : '#c0392b';
    ctx.beginPath();
    ctx.roundRect(cx - 140, H - 120, 280, 74, 37);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px Fredoka, sans-serif';
    ctx.fillText(price === null ? 'COMPLETO' : `💰 ${price}`, cx, H - 82);
  }

  /** De manhã a lojinha está fechada: o cavalete mostra o horário. */
  drawClosed(ctx: CanvasRenderingContext2D, i: number) {
    const c = ctx.canvas;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(14, 22, W - 28, H - 30, 34);
    ctx.fill();
    ctx.fillStyle = '#2b3246';
    ctx.beginPath();
    ctx.roundRect(10, 10, W - 28, H - 30, 34);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = (W - 8) / 2;
    // relógio parado nas 18h
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, H * 0.3, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, H * 0.3 - 50);
    ctx.lineTo(cx, H * 0.3);
    ctx.lineTo(cx, H * 0.3 + 44);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.font = '700 50px Fredoka, sans-serif';
    ctx.fillText('ABRE ÀS 18H', cx, H * 0.56);
    ctx.fillStyle = '#c9cfdc';
    ctx.font = '500 30px Fredoka, sans-serif';
    ctx.fillText(['traga seu vale', 'oferta nova todo dia', 'fiado só amanhã', 'sem fila (quase)', 'até mais tarde'][i % 5], cx, H * 0.66);
  }

  /** Etiqueta da oferta no balcão (canvas 512×640): faixa do estilo, ícone, nome, o que faz e o selo de preço. */
  drawSlot(ctx: CanvasRenderingContext2D, id: ShopItemId | null) {
    const c = ctx.canvas;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    // sombra e cartão
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(14, 22, W - 28, H - 30, 34);
    ctx.fill();
    ctx.fillStyle = id ? '#fffaf0' : '#e9e5dc';
    ctx.beginPath();
    ctx.roundRect(10, 10, W - 28, H - 30, 34);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = (W - 8) / 2;
    if (!id) {
      ctx.fillStyle = '#8a90a2';
      ctx.font = '700 54px Fredoka, sans-serif';
      ctx.fillText('VENDIDO', cx, H * 0.44);
      ctx.font = '500 28px Fredoka, sans-serif';
      ctx.fillText('volta amanhã (talvez)', cx, H * 0.54);
      return;
    }
    const s = this.spec(id);
    const col = STYLE_COLOR[s.style];
    const out = this.soldOut(id);
    // faixa do estilo no topo
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(10, 10, W - 28, 76, [34, 34, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px Fredoka, sans-serif';
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3px';
    ctx.fillText(SHOP_STYLE[s.style].toUpperCase(), cx, 50);
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    // ícone num círculo
    ctx.fillStyle = col + '22';
    ctx.beginPath();
    ctx.arc(cx, 186, 84, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = '112px sans-serif';
    ctx.fillText(s.icon, cx, 192);
    // nome (até duas linhas)
    ctx.fillStyle = '#1b2233';
    const lines = wrap(ctx, s.name, '700 48px Fredoka, sans-serif', W - 70, 2);
    lines.forEach((l, i) => ctx.fillText(l, cx, 316 + i * 52));
    // o que faz (curto)
    ctx.fillStyle = '#3d4458';
    const desc = wrap(ctx, s.desc, '600 30px Fredoka, sans-serif', W - 70, 3);
    const dy = 316 + lines.length * 52 + 8;
    desc.forEach((l, i) => ctx.fillText(l, cx, dy + i * 36));
    // selo de preço
    const owned = this.count(id);
    const can = this.wallet >= this.price(id);
    ctx.fillStyle = out ? '#8a90a2' : can ? '#1f9e63' : '#c0392b';
    ctx.beginPath();
    ctx.roundRect(cx - 140, H - 120, 280, 74, 37);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px Fredoka, sans-serif';
    ctx.fillText(out ? 'ESGOTADO' : `💰 ${this.price(id)}`, cx, H - 82);
    if (owned) {
      ctx.fillStyle = '#1b2233';
      ctx.beginPath();
      ctx.roundRect(W - 150, 100, 110, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.font = '700 24px Fredoka, sans-serif';
      ctx.fillText(`tem ${owned}`, W - 95, 123);
    }
  }
}
