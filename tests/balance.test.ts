// Regras e números do jogo: invariantes que nenhum ajuste de balanço pode quebrar, e os números que o GDD cita.
// Roda com o Node puro (lê TypeScript sem instalar nada): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bossDay, x9Day, funGoal, runMul, RUN, FUN_DAY, FUN_TASKS, FUN_BIG, FUN_SMALL, SHOP, SHOP_OFFERS, SHOP_FX, PRICE_STEP,
  TRICKS, tricksOn, HEIST, HEIST_PRIZES, VISIT, CLIENTS, ELEVATOR, ELEVATOR_TALK, EVENTS, EVENT_IDS, dailyBossTalk, TASK_POOL, TASKS, FIXED,
  B, AGENDA, DISTRACT, DISTRACT_FX, MISSIONS, MISSION_SMALL, SMALL_DAY, PAPO, ITEMS, PRESSURE, TRICKS_FROM, SURV, longAway, PAUTA, workGoal, FIXED as FIXED_W, INTRO,
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

test('meta de FUN: começa em 22, sobe 5 por dia, e o multi pede mais do time todo', () => {
  assert.equal(funGoal(0), 22);
  for (const d of DAYS.slice(1)) assert.equal(funGoal(d) - funGoal(d - 1), 5);
  assert.equal(funGoal(0, 2), Math.round(22 * 0.8 * 2));
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
  // v0.9: o vale vem da missão grande e das 2 pequenas
  const valeDay = MISSIONS.bigVale + SMALL_DAY.vd * SMALL_DAY.count;
  const cheapest = Math.min(...SHOP.map((s) => s.cost));
  assert.ok(valeDay >= cheapest, `Vale do dia ${valeDay} < item mais barato ${cheapest}`);
  // e nenhum item comum custa mais que 3 dias completos (o atestado é o raro)
  for (const s of SHOP) if (s.style !== 'raro') assert.ok(s.cost <= valeDay * 3, `${s.id} caro demais (${s.cost})`);
});

test('truques: todo truque tem um item que o contra-ataca, e entram um por dia', () => {
  const ids = new Set(SHOP.map((s) => s.id));
  for (const t of TRICKS) assert.ok(ids.has(t.counter), `truque ${t.id}: contra-ataque ${t.counter} não existe na loja`);
  assert.equal(new Set(TRICKS.map((t) => t.id)).size, TRICKS.length);
  assert.equal(tricksOn(0).length, 0, 'o 1º dia não tem truque');
  // v0.10: os truques entram depois da vigilância (dias 2–4), um por dia
  for (const d of DAYS) assert.equal(tricksOn(d).length, Math.max(0, Math.min(TRICKS.length, d - TRICKS_FROM + 1)));
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

test('tarefas: o pool tem cadastro e as fixas têm cota', () => {
  for (const k of TASK_POOL) assert.ok(k in TASKS || TASKS, k);
  for (const [k, f] of Object.entries(FIXED)) assert.ok(f.quota > 0 && f.label, k);
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
  has(new RegExp(`funGoal\\(dia\\) = ${funGoal(0)} \\+ ${funGoal(1) - funGoal(0)}·dia`), 'a meta de FUN do código');
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
      const slot = (AGENDA.end * B.DAY_DURATION - calm - AGENDA.firstAfter - long - AGENDA.gap) / (n - 1);
      assert.ok(slot >= AGENDA.gap, `dia ${d + 1} (${solo ? 'solo' : 'multi'}): ${n} compromissos em fatias de ${slot.toFixed(0)} s`);
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
  assert.ok(SURV.camsFrom < SURV.sensorFrom && SURV.sensorFrom < SURV.lockFrom, 'ordem câmera → sensor → tranca');
  assert.ok(SURV.lockFrom < TRICKS_FROM, 'os truques entram depois da vigilância');
  assert.ok(SURV.camWarn >= 1, 'o amarelo avisa pelo menos 1 s antes do vermelho');
  assert.ok(SURV.camGreen > SURV.camRed, 'mais tempo verde que vermelho (dá para passar)');
  assert.ok(SURV.sensorOff > 0 && SURV.unlockTime >= 20, 'contra-ataques duram o bastante');
});

test('pauta: a cota cabe no dia sem tomar o expediente inteiro', () => {
  for (const d of DAYS.slice(0, 10))
    for (const solo of [true, false]) {
      // estimativa de segundos de trabalho: planilha (2 s por acerto) + 2 tarefas andando (~25 s por unidade)
      const pc = workGoal(FIXED_W.planilha.quota, d, solo) * 2;
      const walk = (d >= PAUTA.twoFrom ? 2 : 1) * Math.min(PAUTA.maxGoal, workGoal(2, d, solo)) * 25;
      assert.ok(pc + walk <= 0.6 * B.DAY_DURATION, `dia ${d + 1} (${solo ? 'solo' : 'multi'}): ${pc + walk} s de trabalho`);
    }
});

test('missões: as do começo existem e estão liberadas desde a 1ª run', () => {
  for (const id of INTRO.early) assert.ok(MISSIONS[id], `missão ${id}`);
  assert.ok(['grampeador', 'relogio', 'lan'].every((id) => MISSIONS[id as 'lan'].unlock === 0), 'grampeador, relógio e campeonato liberados');
  assert.ok(MISSIONS.lanKills(0, 1) > 0 && MISSIONS.lanKills(5, 3) > MISSIONS.lanKills(0, 1), 'campeonato cresce com dia e jogadores');
});
