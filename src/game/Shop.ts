import { SHOP, SHOP_OFFERS, PRICE_STEP, SHOP_STYLE, type ShopItemId } from '../balance';

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

/**
 * Loja do hall e o cofre da run: o que foi comprado (com quantas cópias), o Vale-Diversão e as ofertas da noite.
 * No multi o cofre é um só: o host decide e manda o estado (`apply`) para todo mundo.
 */
export class Shop {
  wallet = 0;
  readonly owned = new Map<ShopItemId, number>();
  offers: ShopItemId[] = [];
  /** Semente da run (no multi vem do host). */
  seed = Math.floor(Math.random() * 1e9);

  reset() {
    this.wallet = 0;
    this.owned.clear();
    this.offers = [];
    this.seed = Math.floor(Math.random() * 1e9);
  }

  count(id: ShopItemId) {
    return this.owned.get(id) ?? 0;
  }

  has(id: ShopItemId) {
    return this.count(id) > 0;
  }

  spec(id: ShopItemId) {
    return SHOP.find((s) => s.id === id)!;
  }

  /** Cada cópia a mais custa mais. */
  price(id: ShopItemId) {
    return Math.round(this.spec(id).cost * Math.pow(PRICE_STEP, this.count(id)));
  }

  soldOut(id: ShopItemId) {
    return this.count(id) >= this.spec(id).max;
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

  /** Tenta comprar (devolve o motivo se não der). */
  buy(id: ShopItemId): true | string {
    if (this.soldOut(id)) return 'esgotado';
    const p = this.price(id);
    if (this.wallet < p) return `faltam ${p - this.wallet} de vale`;
    this.wallet -= p;
    this.owned.set(id, this.count(id) + 1);
    return true;
  }

  /** Estado do cofre para a rede. */
  state() {
    return { w: this.wallet, o: Object.fromEntries(this.owned) as Record<string, number> };
  }

  apply(st: { w: number; o: Record<string, number> }) {
    this.wallet = st.w;
    this.owned.clear();
    for (const [k, v] of Object.entries(st.o)) if (v > 0) this.owned.set(k as ShopItemId, v);
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
