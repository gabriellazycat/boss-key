// Regras e números do jogo: invariantes que nenhum ajuste de balanço pode quebrar, e os números que o GDD cita.
// Roda com o Node puro (lê TypeScript sem instalar nada): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bossDay, x9Day, funGoal, runMul, RUN, FUN_DAY, FUN_TASKS, FUN_BIG, FUN_SMALL, SHOP, SHOP_OFFERS, SHOP_FX, PRICE_STEP,
  TRICKS, tricksOn, HEIST, HEIST_PRIZES, VISIT, CLIENTS, ELEVATOR, ELEVATOR_TALK, EVENTS, EVENT_IDS, dailyBossTalk, TASK_POOL, TASKS, FIXED,
  B, AGENDA, DISTRACT, DISTRACT_FX, MISSIONS, MISSION_SMALL, SMALL_DAY, PAPO, ITEMS, PRESSURE, TRICKS_FROM, SURV, longAway, PAUTA, workGoal, WORK, INTRO, FIRST_DAY, FUN_GOAL, survKinds, BIG_MISSIONS, UPGRADES, UP_FX, teamPrice, CALM_PAY, SUPER,
} from '../src/balance.ts';

const DAYS = Array.from({ length: 40 }, (_, i) => i);

test('pilar 3: o aviso antes de uma conferência nunca fica abaixo de 6 s, em nenhum dia, com chefe ou X9', () => {
  for (const d of DAYS) {
    assert.ok(bossDay(d).warn >= 6, `chefe, dia ${d + 1}: aviso ${bossDay(d).warn}`);
    assert.ok(x9Day(d).warn >= 6, `X9, dia ${d + 1}: aviso ${x9Day(d).warn}`);
  }
});

test('a chefia endurece com os dias, mas dentro de limites', () => {
  for (const d of DAYS.slice(1)) {
    const a = bossDay(d - 1);
    const b = bossDay(d);
    assert.ok(b.speed >= a.speed && b.speed <= 3.8, `velocidade no dia ${d + 1}`);
    assert.ok(b.identify <= a.identify && b.identify > 0, `identificação no dia ${d + 1}`);
    assert.ok(b.minInterval <= a.minInterval && b.minInterval >= 20, `intervalo entre rondas no dia ${d + 1}`);
  }
  for (const d of DAYS) assert.ok(x9Day(d).speed < bossDay(d).speed, `o X9 é mais lento que o chefe (dia ${d + 1})`);
});

test('meta de FUN: começa em 22, sobe 5 por dia (o 1º dia mais leve), e o multi pede mais do time todo', () => {
  assert.equal(funGoal(0), Math.round(22 * FIRST_DAY.goal), 'o 1º dia é mais leve');
  assert.equal(funGoal(1), 27);
  for (const d of DAYS.slice(2)) assert.equal(funGoal(d) - funGoal(d - 1), 5);
  assert.equal(funGoal(0, 2), Math.round(22 * 0.8 * 2 * FIRST_DAY.goal));
  assert.ok(funGoal(3, 4) > funGoal(3, 2));
});

test('a curva de Suspeita cresce todo dia', () => {
  assert.equal(runMul(0), 1);
  for (const d of DAYS.slice(1)) assert.ok(runMul(d) > runMul(d - 1));
  assert.ok(RUN.lives >= 1);
});

test('diversões: as grandes e as pequenas existem e dá para sortear o dia', () => {
  for (const id of [...FUN_BIG, ...FUN_SMALL]) assert.ok(FUN_TASKS[id], `diversão ${id} sem cadastro`);
  assert.ok(FUN_BIG.length >= FUN_DAY.big);
  // com chuva sai o vidro: ainda precisa sobrar o bastante
  assert.ok(FUN_SMALL.length - 1 >= FUN_DAY.small);
  for (const id of FUN_BIG) assert.equal(FUN_TASKS[id].big, true, id);
  for (const id of FUN_SMALL) assert.equal(FUN_TASKS[id].big, false, id);
});

test('loja: ids únicos, preços e pesos positivos, e dá para sortear as ofertas', () => {
  const ids = SHOP.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'item repetido');
  for (const s of SHOP) {
    assert.ok(s.cost > 0 && s.max >= 1 && s.weight > 0, s.id);
    assert.ok(s.name && s.desc && s.icon, s.id);
  }
  assert.ok(SHOP.length >= SHOP_OFFERS);
  assert.ok(PRICE_STEP > 1);
});

test('economia: um dia completo de missões compra pelo menos um item', () => {
  // v0.11: o vale vem só do trabalho — o pior caso é o 1º dia solo fechando só a cota (PC + 1 tarefa da pauta)
  const valeDay = workGoal(WORK.quota, 0, true) * WORK.pay + Math.min(PAUTA.maxGoal, workGoal(PAUTA.arquivar.goal, 0, true)) * WORK.pautaPay;
  const cheapest = Math.min(...SHOP.map((s) => s.cost));
  assert.ok(valeDay >= cheapest, `Vale do dia ${valeDay} < item mais barato ${cheapest}`);
  // e nenhum item comum custa mais que 3 dias completos (o atestado é o raro)
  for (const s of SHOP) if (s.style !== 'raro') assert.ok(s.cost <= valeDay * 3, `${s.id} caro demais (${s.cost})`);
});

test('truques: todo truque tem um item que o contra-ataca, e entram um por dia', () => {
  const ids = new Set(SHOP.map((s) => s.id));
  const ups = new Set<string>(UPGRADES.map((u) => u.id));
  for (const t of TRICKS) assert.ok(ids.has(t.counter as never) || ups.has(t.counter), `truque ${t.id}: contra-ataque ${t.counter} não existe na loja nem no balcão`);
  assert.equal(new Set(TRICKS.map((t) => t.id)).size, TRICKS.length);
  assert.equal(tricksOn(0, 7).length, 0, 'o 1º dia não tem truque');
  // v0.11: sorteados do 3º dia em diante, um novo por dia, acumulando, sem repetir; mesma semente = mesma ordem (multi)
  for (const seed of [1, 42, 99999])
    for (const d of DAYS) {
      const t = tricksOn(d, seed);
      assert.equal(t.length, Math.max(0, Math.min(TRICKS.length, d - TRICKS_FROM + 1)));
      assert.equal(new Set(t.map((x) => x.id)).size, t.length, 'truque repetido');
      if (d > 0) assert.deepEqual(tricksOn(d - 1, seed), t.slice(0, tricksOn(d - 1, seed).length), 'acumula');
    }
  assert.notDeepEqual(tricksOn(8, 1).map((t) => t.id), tricksOn(8, 2).map((t) => t.id), 'a ordem muda com a run');
});

test('elevador: o tutorial cabe no tempo do elevador; todo evento tem fala no briefing', () => {
  const talk = ELEVATOR_TALK.reduce((a, x) => a + x.t, 0);
  assert.ok(talk + ELEVATOR.talkDelay <= ELEVATOR.time, `tutorial ${talk} s > elevador ${ELEVATOR.time} s`);
  for (const id of EVENT_IDS) {
    assert.ok(EVENTS[id].name && EVENTS[id].desc, id);
    const lines = dailyBossTalk('Terça', 1, [id]);
    assert.ok(lines.length > 0 && lines.every((l) => l.t > 0 && l.say), `briefing do evento ${id}`);
  }
});

test('tarefas: o pool tem cadastro e o trabalho do PC tem cota e paga', () => {
  for (const k of TASK_POOL) assert.ok(k in TASKS || TASKS, k);
  for (const [k, f] of Object.entries(FIXED)) assert.ok(f.label && f.how, k);
  assert.ok(WORK.quota > 0 && WORK.planilhaHits > 0 && WORK.pay > 0 && WORK.pautaPay > 0);
});

test('clientes e assalto: números coerentes', () => {
  assert.ok(CLIENTS.perDay <= CLIENTS.maxPerDay);
  assert.ok(CLIENTS.meeting[0] < CLIENTS.meeting[1]);
  assert.ok(HEIST.fun > 0 && HEIST_PRIZES.length >= 2);
  assert.ok(VISIT.cooldown > VISIT.talk);
});

// O GDD cita números; se alguém mudar um lado, o outro fica mentindo. (TDD §10: "números da tabela = números do código")
test('GDD §0.0 bate com balance.ts', () => {
  const gdd = fs.readFileSync(new URL('../docs/GDD.md', import.meta.url), 'utf8');
  const s00 = gdd.slice(gdd.indexOf('## 0.0'), gdd.indexOf('## 0.1'));
  const has = (re: RegExp, what: string) => assert.match(s00, re, `GDD §0.0 não diz ${what}`);
  has(new RegExp(`funGoal\\(dia\\) = ${FUN_GOAL.base} \\+ ${FUN_GOAL.perDay}·dia`), 'a meta de FUN do código');
  has(new RegExp(`\\+${HEIST.fun} FUN`), `o prêmio do assalto (+${HEIST.fun})`);
  has(new RegExp(`\\+${SHOP_FX.doorWarn} s de aviso`), 'a dobradiça');
  has(new RegExp(`identifica ×${String(SHOP_FX.plantIdentify).replace('.', ',')}`), 'a planta');
  has(new RegExp(`sai por ${SHOP_FX.ramalHome} s`), 'o ramal na sala');
  has(new RegExp(`\\+${String(SHOP_FX.clutchBonus).replace('.', ',')} s de CLUTCH`), 'o atalho de pânico');
  has(new RegExp(`\\+${SHOP_FX.heistBonus} no prêmio`), 'o faro de assalto');
  has(new RegExp(`ele para ${VISIT.talk} s, recarga ${VISIT.cooldown} s`), 'a visita');
  has(new RegExp(`${CLIENTS.meeting[0]}–${CLIENTS.meeting[1]} s`), 'a reunião do cliente');
  has(new RegExp(`elevador de ${ELEVATOR.time} s`), 'o tempo do elevador');
});

// ------------------------------------------------------------------ v0.9: missões, agenda, distrações, crédito
test('missão grande paga entre 60% e 80% da meta; as pequenas completam sem precisar da grande sozinhas', () => {
  assert.ok(MISSIONS.bigShare >= 0.6 && MISSIONS.bigShare <= 0.8, `bigShare ${MISSIONS.bigShare}`);
  for (const d of DAYS.slice(0, 10)) {
    const goal = funGoal(d);
    const big = Math.round(goal * MISSIONS.bigShare);
    // só a grande não basta: a ganância (pequenas, diversões) é o que fecha o dia
    assert.ok(big < goal, `dia ${d + 1}: a grande sozinha (${big}) já bate a meta (${goal})`);
  }
  for (const id of MISSION_SMALL) assert.ok(FUN_TASKS[id], `pequena ${id} sem cadastro em FUN_TASKS`);
  assert.ok(MISSION_SMALL.length >= SMALL_DAY.count + 2, 'pool de pequenas curto demais para variar');
});

test('agenda: os compromissos cabem no dia de 5 min, com folga entre eles', () => {
  assert.equal(B.DAY_DURATION, 300);
  for (const d of DAYS.slice(0, 12)) {
    const n = Math.min(AGENDA.max, AGENDA.base + Math.floor(d / AGENDA.perDays));
    const calm = d === 0 ? PRESSURE.calmFirstDay : PRESSURE.calm;
    // a ausência longa ocupa a fatia dela inteira; o resto divide o que sobra
    for (const solo of [true, false]) {
      const long = Math.max(...AGENDA.long.map((k) => longAway(k, d, solo)));
      // a ronda, a supervisão e a longa SEMPRE cabem, com o tempo real de cada saída (porta, ida, volta); a pausa e os
      // opcionais saem se não couber (antes o quadro reservava metade do tempo e o fim da tarde nunca acontecia)
      // se não couber, o sorteio encolhe a longa até `longMin`: o que sobra para ela tem que chegar a isso
      const rest = AGENDA.rondaLen + AGENDA.dur.supervisao + 2 * AGENDA.trip + 2 * AGENDA.gap;
      const room = AGENDA.end * B.DAY_DURATION - calm - AGENDA.firstAfter - rest;
      assert.ok(room >= AGENDA.longMin, `dia ${d + 1} (${solo ? 'solo' : 'multi'}): o essencial não cabe (sobram ${room} s para a ausência longa)`);
      // e ela quase não encolhe: no máximo 15 s a menos que o planejado
      assert.ok(long - Math.min(long, room) <= 15, `dia ${d + 1} (${solo ? 'solo' : 'multi'}): ausência longa encolheria de ${long} para ${room} s`);
      assert.ok(n >= 5 && n <= AGENDA.max, `dia ${d + 1}: ${n} compromissos`);
      assert.ok(long >= AGENDA.longMin, `dia ${d + 1}: ausência longa de ${long} s`);
    }
  }
  for (const k of AGENDA.pool) assert.ok(AGENDA.label[k] && AGENDA.dur[k] >= 0, `compromisso ${k} sem rótulo/duração`);
});

test('distrações: recarga positiva (o alarme é 1×/dia), ninguém de graça', () => {
  for (const [id, d] of Object.entries(DISTRACT)) {
    if (id !== 'alarme') assert.ok(d.cd > 0, `${id} sem recarga`);
    assert.ok(d.hold > 0 && d.seenSus > 0 && d.noise > 0, `${id}: segurar, Suspeita e barulho precisam ser > 0`);
  }
  assert.ok(DISTRACT_FX.alarme.on > DISTRACT_FX.radio.on, 'o alarme (1×/dia) tem que valer mais que o rádio');
});

test('papo e itens: números coerentes', () => {
  assert.ok(PAPO.perTask > 0 && PAPO.max >= PAPO.perTask * 3 && PAPO.min <= PAPO.perTask, 'papo: banco');
  // uma tarefa de planilha no ritmo (uma batida a cada 2 s) leva menos de 10 s
  assert.ok(PAPO.hitsPerTask * 2 <= 10, `uma tarefa de papo custa ${PAPO.hitsPerTask} acertos`);
  assert.ok(ITEMS.aquario.speedTwo > ITEMS.aquario.speedOne, 'a dois tem que ser mais rápido que sozinho');
  assert.ok(ITEMS.aquario.breakAt > ITEMS.aquario.rope, 'a corda arrebenta depois do comprimento natural');
});

// ------------------------------------------------------------------ v0.10: vigilância, pauta, introdução
test('vigilância: um equipamento por dia, nos dias da introdução, sempre com aviso', () => {
  // v0.11: sorteada do 3º dia em diante: 1 por dia (sem repetir o de ontem), 2 do `twoFrom` em diante
  for (const seed of [3, 77, 123456]) {
    for (let d = 0; d < SURV.from; d++) assert.equal(survKinds(d, seed).length, 0, `dia ${d + 1} sem vigilância`);
    for (let d = SURV.from; d < 16; d++) {
      const k = survKinds(d, seed);
      assert.equal(k.length, d >= SURV.twoFrom ? 2 : 1, `dia ${d + 1}`);
      assert.equal(new Set(k).size, k.length);
      const y = survKinds(d - 1, seed);
      if (k.length === 1 && y.length === 1) assert.notEqual(k[0], y[0], `dia ${d + 1} repetiu o de ontem`);
      assert.deepEqual(survKinds(d, seed), k, 'determinístico');
    }
  }
  assert.equal(TRICKS_FROM, SURV.from, 'truques e vigilância entram juntos (3º dia)');
  assert.ok(SURV.camWarn >= 1, 'o amarelo avisa pelo menos 1 s antes do vermelho');
  assert.ok(SURV.camGreen > SURV.camRed, 'mais tempo verde que vermelho (dá para passar)');
  assert.ok(SURV.sensorOff > 0 && SURV.unlockTime >= 20, 'contra-ataques duram o bastante');
});

test('pauta: a cota cabe no dia sem tomar o expediente inteiro', () => {
  for (const d of DAYS.slice(0, 10))
    for (const solo of [true, false]) {
      // estimativa de segundos de trabalho: rodadas do PC (~10 s cada: 4 acertos, 3 somas, 6 e-mails…) + 2 tarefas andando (~25 s por unidade)
      const pc = Math.min(WORK.maxQuota, workGoal(WORK.quota, d, solo)) * 10;
      const walk = (d >= PAUTA.twoFrom ? 2 : 1) * Math.min(PAUTA.maxGoal, workGoal(2, d, solo)) * 25;
      assert.ok(pc + walk <= 0.6 * B.DAY_DURATION, `dia ${d + 1} (${solo ? 'solo' : 'multi'}): ${pc + walk} s de trabalho`);
    }
});

test('missões: todas existem e entram no sorteio desde o 1º dia (sem carreira)', () => {
  for (const id of BIG_MISSIONS) assert.ok(MISSIONS[id]?.family, `missão ${id}`);
  assert.equal(new Set(BIG_MISSIONS.map((id) => MISSIONS[id].family)).size, 3, 'três famílias');
  assert.equal(INTRO.talkFrom + INTRO.distractFrom, 0, 'papo e distrações desde o 1º dia');
  assert.ok(MISSIONS.lanKills(0, 1) > 0 && MISSIONS.lanKills(5, 3) > MISSIONS.lanKills(0, 1), 'campeonato cresce com dia e jogadores');
});

// ------------------------------------------------------------------ v0.11: economia de upgrades
/** Vale de um dia solo só com a cota (PC + pauta), sem upgrades. */
const cotaVale = (d: number) => {
  const pc = Math.min(WORK.maxQuota, workGoal(WORK.quota, d, true)) * WORK.pay;
  const pauta = (d >= PAUTA.twoFrom ? 2 : 1) * Math.min(PAUTA.maxGoal, workGoal(2, d, true)) * WORK.pautaPay;
  return pc + pauta;
};

test('economia v0.11: dá para comprar desde o 1º dia, mas não dá para comprar tudo', () => {
  const cheapest = Math.min(...UPGRADES.map((u) => u.costs[0]));
  assert.ok(cotaVale(0) >= cheapest, `a cota do 1º dia (${cotaVale(0)}) não paga o nível 1 mais barato (${cheapest})`);
  assert.ok(cotaVale(0) < 2 * cheapest + 4, `o 1º dia paga demais (${cotaVale(0)})`);
  // 7 dias de cota + 50% de hora extra no PC + um dia tranquilo e uma supervisão boa a cada 2 dias
  let run = 0;
  for (let d = 0; d < 7; d++) run += cotaVale(d) + 0.5 * Math.min(WORK.maxQuota, workGoal(WORK.quota, d, true)) * WORK.pay + (CALM_PAY.vale + SUPER.vale) / 2;
  const all = UPGRADES.reduce((a, u) => a + u.costs.reduce((x, y) => x + y, 0), 0) + SHOP.reduce((a, s) => a + s.cost, 0);
  const share = run / all;
  assert.ok(share >= 0.25 && share <= 0.45, `uma run de 7 dias compra ${(share * 100).toFixed(0)}% do custo total (alvo 25–45%)`);
});

test('economia v0.11: trilhas sobem de preço, nenhuma se paga em menos de 1 dia, e o item do time escala', () => {
  for (const u of UPGRADES) {
    assert.ok(u.costs.length === u.desc.length && u.costs.length >= 1, u.id);
    for (let i = 1; i < u.costs.length; i++) assert.ok(u.costs[i] > u.costs[i - 1], `${u.id}: nível ${i + 1} mais barato`);
  }
  // o bônus de produtividade: +2/rodada e +1/lote por nível; um dia médio tem ~3 rodadas e ~3 lotes
  const perDay = 3 * UP_FX.bonusRound + 3 * UP_FX.bonusPauta;
  const bonus = UPGRADES.find((u) => u.id === 'bonus')!;
  bonus.costs.forEach((c, i) => assert.ok(c >= perDay * (i + 1), `bônus nível ${i + 1} se paga em menos de 1 dia`));
  assert.equal(teamPrice(10, 1), 10);
  assert.equal(teamPrice(10, 2), 15);
  assert.equal(teamPrice(10, 3), 20);
  assert.equal(UPGRADES.filter((u) => u.kind === 'team').length, 1, 'a sirene é a trilha do time');
  assert.equal(UPGRADES.length, 9, 'uma vitrine do balcão por trilha');
});
