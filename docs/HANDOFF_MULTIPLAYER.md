# PASSAGEM DE BASTÃO — Multiplayer do BOSS KEY (2026-11-01)

> Documento autossuficiente. Uma conversa nova deve ler isto de cima a baixo e seguir a seção "Ordem de trabalho". Nada foi alterado no código ainda; tudo abaixo veio de leitura do código (nenhum bug foi reproduzido rodando o jogo).

## 0. Decisões já tomadas pelo usuário
- **Não refazer no Godot.** Ficar no projeto atual (Three.js + TypeScript, branch `feat/boss-key-solo`). Motivo: os bugs são de arquitetura de estado/rede, o motor não tem culpa; reescrever levaria os mesmos bugs junto e custaria semanas. O Godot fica para depois, se o usuário quiser melhorar a arte para a Steam. Lançamento: **Steam (PC)**.
- **Hall e elevador continuam no multiplayer, sincronizados pelo host** (escolha do usuário).
- O usuário quer que **eu ache e corrija os bugs sozinho** (não só os 10 da lista). Por isso o primeiro passo é um robô de multiplayer que joga vários dias e acusa violações.
- O GDD (`docs/GDD.md`) "pode ser melhorado" — fora do escopo agora.
- Regras do CLAUDE.md global: responder em português do Brasil; **sem commit/push sem o usuário pedir**; sem comandos destrutivos; a skill `grilling` vale para planos/ideias novas (não para esta execução já definida).

## 1. A lista de bugs do usuário (10 itens)
1. O chefe tinha que passar na minha mesa às 11h e não apareceu.
2. O chefe sumiu em algum momento e nunca mais voltou.
3. Quero poder ver a tela das outras pessoas no multiplayer.
4. Eu estava destravando a impressora e o chefe considerou passeio; fui demitido fazendo tarefa de trabalho.
5. Elevador esquisito no MP: quem entra não vê os outros, a porta fecha só para ela, quem está fora não vê quem está dentro.
6. No dia 2 consegui ir para o elevador e para o trabalho sem os outros terem entrado.
7. Uma pessoa troca de dia sem os outros trocarem.
8. Diz "E para pegar item" na escrivaninha, mas a bola de papel estava na frente e não consegui.
9. HUD poluída: "M2 joga bolinha" aparece sem bola na mão; "chefe fora da sala" depois que ele voltou; multiplicadores que o jogador não quer ver.
10. Animação dos personagens não sincronizada.

## 2. Diagnóstico (causas de fundo, com arquivo:linha)

### Causa A — O fluxo do dia não é do host (bugs 5, 6, 7)
- Hall/cabine/porta rodam **em cada cliente**: a posição própria dispara a subida (`Game.ts:1166-1173`), fecha a porta só local (`o.lobby.open = 0`, `:1168`). `rideUp`/`shiftCabin` move a bola para o andar 12 (`Game.ts:885-897`) mas **pula jogadores remotos** (`:889`: `if (w.isPlayer || w.remote) continue`). Remotos são desenhados onde o cliente deles diz (`Multi.ts:677-686`). Resultado: um sobe, os outros ainda estão no hall, ninguém vê ninguém.
- `lobby.open` **não está no protocolo**. `elevatorOpen` é enviado (`Multi.ts:630`) mas o cliente só aplica em `phase === 'play'` (`Game.ts:1608`). `placeElevatorCast` põe remotos na cabine com lógica de bot e o próximo snapshot sobrescreve (`Game.ts:903`).
- **Ready herdado do dia anterior:** `resetForDay()` limpa só o flag do próprio jogador (`Multi.ts:245`), chamado em `enterElevator` (`Game.ts:1251`). `checkReady` (`Multi.ts:227`, `members.every(m => m.ready)`) vê os flags do dia 1 ainda `true` dos outros e inicia a contagem. Nada checa fase/dia/presença na cabine.
- **Troca de dia por conta própria:** `goHome()` (`Game.ts:1102-1114`) → `onDayEnd` → `main.ts:213` → `briefing(r.day+1)` → `game.startDay(i)` (`main.ts:207`, `Game.ts:657-660`). Quem sair primeiro avança. Cliente só segue o host dentro de `room` na fase `elevator` (`Multi.ts:397-398`); snapshots/inputs de outro dia são descartados (`Multi.ts:268`, `:451`) → quem avançou some/congela para os outros. `enterLeaving`/`rideDown`/`enterEvening` também são locais.
- **Fix:** mensagens do host `ride` e `day` (`{t:'day', d}`); `lobby.open` dentro de `EventState`; cliente só chama `rideUp()`/`startDay()` quando o host manda; `ready` atrelado ao dia (`m.ready === dayIndex`); host limpa o ready de todos ao entrar no elevador; contagem só com todos fisicamente na cabine; `shiftCabin` move remotos também; tela "esperando o time" no fim do dia (host avança quando todos foram para casa ou por timer). Alternativa mais simples (descartada pelo usuário): começar o dia no elevador de cima e pular o hall.

### Causa B — Pacote de cada jogador incompleto (bugs 3, 4, 10)
- `PlayerState` (`Protocol.ts:16-20`, montado em `Multi.ts:604-609`) tem: x, z, yaw, hover, seated, lying, act, physical, hidden, forbidden, fun, sus, carry, eye, ghost, work, cota. `carry` (`b[12]`) é enviado mas **`apply()` nunca lê** (`Multi.ts:663-713`).
- **Bug 4 (impressora):** o álibi só vale para o jogador do host: `const alibi = (w.isPlayer && (!!this.pc.carrying || this.tasks.active.length > 0 || this.shop.has('prancheta'))) || !!this.meetingCall;` (`Game.ts:2271-2272`). Cliente não tem álibi. `net.act('unjam')` só é enviado ao **terminar** o minigame (`Game.ts:3196`, tratado em `Multi.ts:282`); enquanto está na impressora, `w.act` é `null` (`p.act` só cobre apps proibidos, `cadeira`, `soneca` — `Game.ts:3323-3338`). O host vê alguém longe da mesa sem álibi e chama `seeing(..., 'passeando à toa')` (`Game.ts:2274`) todo frame → suspeita sobe → demitido. Categoria: caminho solo ≠ caminho de rede.
  - **Fix:** bit de álibi em `PlayerState` (carregando, tarefa ativa, prancheta, minigame de trabalho aberto: jam/breaker/d:*), lido em `w.netAlibi` no `apply()` e usado em `Game.ts:2272`. Opcional: avisar o início do `unjam`; tratar a área da impressora como zona de trabalho enquanto `printerJam > 0`.
- **Bug 10 (animações):** não enviados: gesto de mão (`pc.pawGesture('press'|'phone')`, `Player.ts:200`, usos `Game.ts:1828/1868/1935`), digitar (`computer.typing`), comer/carregar/cadeira/soneca (`pc.mode`), reações de bonk/impulso. O ciclo de caminhada é **inferido** da diferença entre posições interpoladas (`Multi.ts:680-685`), por isso atrasa/falha; snapshots a 15 Hz, input a 20 Hz. Olho/rosto só aplicado quando não demitido (`:698-705`). Fala no elevador roda no `elevT` de cada cliente (`Game.ts:1660-1681`) → fora de passo.
  - **Fix:** campos `mode` (seated/typing/nap/chair/eat/phone) e `paw` em `PlayerState`, aplicados no `apply()`; aplicar `carry` mostrando o objeto; opcional enviar velocidade; ligar a fala do elevador ao relógio do host.
- **Bug 3 (ver tela dos outros) — fácil:** cada mesa já tem canvas 1024×640 (só a sua) e as outras são redesenhadas a cada 0,1 s por `drawBotScreen` (`Computer.ts:300`) com modos planilha/tiro/video/pesca/off (`Game.ts:3469-3475`). `Game.ts:3472` desenha de `w.botScreen`, que só bots atualizam; remotos ficam em "planilha" (`Worker.ts:101`). O `act` do jogador já chega pela rede (`Protocol.ts:17-20`, `Multi.ts:699-703`). **Fix (~5 linhas):** em `Game.ts:3472`, para remotos usar a atividade (tiro/video/pesca; senão planilha); usar o mesmo valor no brilho do monitor (`Game.ts:3488`). Upgrade opcional: novo campo 20 com o app aberto de verdade.

### Causa C — Máquina de estados do chefe (bugs 1, 2) — vale também no solo
- **Bug 1 (11h):** só o host roda a agenda (`Agenda.update` retorna se `!g.auth`, `Agenda.ts:163`). (1) `updateSupervision` faz `this.sup = null` sempre que o alvo do chefe não é o ponto `super` e o estado não é walk/toDoor/door (`Game.ts:2594-2596`); ruído (`suspicious`), `check`, ramal ou perseguição encerram a supervisão do dia e o item já foi marcado `done` (`Agenda.ts:175`) → nunca roda. (2) Se o chefe está ocupado/perseguindo/com cliente/conversando (`Agenda.ts:174`) a visita atrasa. (3) `Agenda.ts:118` marca "SUA mesa" comparando o rótulo do host com `g.player.name` local, mas o host preenche `who` com `item.w.name` (nome da persona Steam, `Multi.ts:592` avisa que podem diferir) → dois jogadores com nome padrão veem "SUA mesa"; se `x.w` falta, `startSupervision` cai em `alive[0]`, que pode ser o host (`Game.ts:2575`); `people` em `Agenda.ts:81` só tem o host se o dia for sorteado antes dos remotos existirem.
  - **Fix:** não limpar `sup` enquanto o alvo `super` ainda está na fila do chefe (só ao descartar o alvo); adiar em vez de cancelar; mandar o **PeerId** do alvo no `AgendaNet` e comparar com `net.self`, não nomes.
- **Bug 2 (sumiu):** em `almocoFora`/`reuniaoAndar` o chefe fica escondido no elevador (`Boss.ts:556`) e só reaparece se o `stay` de `away` acabar normalmente (`Boss.ts:593-594`). Três caminhos saem de `away` sem voltar a ficar visível: `distract()` (`Boss.ts:239-245`, não checa `this.away`, chamado pelo ramal em `Game.ts:1393`); `investigate()` → `becomeSuspicious` (`Boss.ts:231, 319`, idem); e com `away=false`, `callBack()` (sensor de porta, `Boss.ts:121-127`) esvazia a fila e manda `return` ainda invisível. A limpeza das 18h ignora chefes invisíveis (`Game.ts:937`) → fica invisível até o reset do dia seguinte (`Game.ts:1209-1235`). Clientes copiam `b[1]` do host (`Multi.ts:623, 720`).
  - **Fix:** `return` antecipado em `this.away` em `distract`, `investigate` e `becomeSuspicious`; ao sair do estado `stay` de um alvo `away`, forçar `ball.root.visible = true`.

### Causa D — HUD e interação (bugs 8, 9)
- **Bug 8:** o seletor de alvo (`Player.ts:904-921`) é "mais próximo no raio": score = distância, −2 se o raio da mira acerta, −facing×0.8, −prio, +1.5 se não utilizável; menor vence. Prompt e ação **concordam** (mesmo pick: ação `Player.ts:964-976`, prompt `:978`). Bola no chão tem alcance 1.0/prio 0 (`Player.ts:630-642`); pilha na mesa alcance 2.4 (`:617-628`); item de mesa prio 2, sempre "utilizável" (`Items.ts:136-142`). **Causa provável real:** o E envia pedido de pegada (`Items.ts:141` → `:185`) e o host **rejeita em silêncio** (`Items.ts:199-205`): exige distância 3D < 2.4 e não estar segurando algo, enquanto o menu só checa distância 2D 1.6 + estado local (`Items.ts:131`). No MP o cliente ainda espera a ida e volta, sem feedback.
  - **Fix:** rodar as checagens do host dentro do `ok()` do item (prompt só aparece se a pegada pode dar certo); distância no plano do chão no host; mensagem curta "não deu" quando rejeitado; pular itens sem mira e de prioridade menor quando o raio acerta outro alvo.
- **Bug 9:** (a) "M2 joga" vem das dicas de **pegar** (pilha `Player.ts:620`, cesta do elevador `Toys.ts:111`, itens `Items.ts:139` "botão direito passa"), mostradas sempre que aquele alvo é o selecionado (`Player.ts:978`), antes de segurar algo; as dicas de "segurando" já estão certas (`Player.ts:1252`, `Game.ts:3725`). Fix: dicas de pegada falam de pegar; ajuda de arremesso só segurando a bola. (b) Aviso "chefe fora" (`Game.ts:3593`) usa a flag `busy` (`Boss.ts:84`), verdadeira para todo estado exceto "no escritório" (inclui `return` `Boss.ts:126/359`, `toDoor`, `door`, `check`) → fica ligado enquanto ele volta. No MP o cliente nunca recebe `patrolling` (`Multi.ts:623`, aplicado em `:725`), então `!b.patrolling` é sempre true e o aviso aparece em rondas que o host suprime; o cliente só aplica o estado se `b[7]` não vazio. Fix: usar "fora" (`Boss.ts:81`) excluindo return/leaving/waiting; incluir `patrolling` no estado de rede do chefe. (c) Multiplicadores: `FUN ×{RISK_FUN_MUL}` (`Game.ts:3611`), "juntos ×…" (`Game.ts:2100`, `:3545`), "Cada dia tudo sobe ×…" (`Game.ts:3792`) → remover ou trocar por palavra tipo "bônus". Relacionado: dica do tutorial em `Game.ts:3821` completa com `bosses[0].out` (só o primeiro chefe).

## 3. Por que esses bugs passaram (o teste atual)
- `npm run mptest` → `tools/playtest/mptest.mjs` (51 linhas) abre `mp-test.html` (várias janelas na mesma aba, `LocalLobby`, `w.step`). Tem ~60 checagens, **todas do dia 1 e em momentos soltos** (sala completa, mesas, itens da lojinha, item de missão, vale, etc.).
- As checagens do elevador estão **fixas em `true`**: `mp-test.html:190` (`'contagem começa quando todos marcam pronto', true`) e `:192` (`'o dia começa em todas as janelas', true`). Nada termina um dia, roda o dia 2, ou faz convidados trabalharem de verdade (impressora, tarefas), e ninguém olha a tela de cada janela. Por isso estes 10 bugs nunca apareceram.
- Também existem: `tools/playtest/{run,checks,tour,repro,missions}.mjs`, `bot.js` (robô solo), `analyze.mjs`, `docs/PLAYTEST.md`, `docs/TESTE_COM_PESSOAS.md`. `npm run verify` = typecheck + test + checks + mptest + playtest:repro + playtest:missions.

## 4. Ordem de trabalho (para a próxima conversa)
**Passo 0 — Auditoria de dono do estado.** Criar `docs/NET_OWNERSHIP.md`: tabela de cada pedaço de estado (fase, dia, porta/cabine, ready, chefe, agenda, supervisão, missões, itens, carteira, pose/anim, app aberto, álibi…) com dono, se vai no `Protocol`, se o cliente aplica. Cada "não enviado/não aplicado" é bug candidato; é assim que se acham os "vários outros".

**Passo 1 — Robô `mp-soak`.** Novo `tools/playtest/mpsoak.mjs` + página irmã do `mp-test.html` (reaproveitar `LocalLobby`, `w.step`, `bot.js`): 1 host + 2 convidados **também dirigidos por robô** (andam, sentam, desatolam a impressora, pegam item, jogam app proibido, entram no elevador, vão para casa); 3 dias completos acelerados (hall → elevador → dia → leaving → noite → dia seguinte). Regras checadas a cada segundo simulado, com log de violações (momento, janela, valor): mesma fase e dia em todas as janelas; cabine só sobe com todos dentro e todos se veem; porta igual em todas; chefe visível/igual ao host e nunca invisível fora de `away` por mais de N s; item de supervisão da agenda executado ou adiado, nunca perdido; ninguém "passeando" enquanto faz tarefa; mode/paw/carry/app aberto iguais à vista do host; prompt de E ⇒ pegada aceita pelo host. Capturas de tela de cada janela em `tools/playtest/out/` nos momentos-chave (cabine fechando, chegada, chefe voltando, fim do dia) para olhar o que regra não pega (HUD, animação). Consertar `mp-test.html:190,192` para checar de verdade. **O robô precisa reproduzir os bugs conhecidos antes da correção** (prova de que funciona).

**Passo 2 — Correções, um lote por causa** (reproduzir com o robô → corrigir → verde): 1) fluxo do dia no host (Causa A); 2) pacote completo do jogador + subir `NET_VERSION` (Causa B, incluindo a tela remota); 3) chefe (Causa C); 4) HUD/interação (Causa D). Ordem sugerida de valor/esforço: Causa B-álibi e tela remota (rápidos) → Causa C → Causa D → Causa A (maior).

**Passo 3 — Varredura.** Rodar `mp-soak` com sementes diferentes e analisar capturas; cada violação nova entra na tabela do Passo 0 e no lote certo.

## 5. Verificação final
- `npm run verify` verde + `mp-soak` verde nos 3 dias em 3 sementes.
- Antes/depois: log de violações do `mp-soak` mostra os 10 bugs antes e zero depois.
- Capturas do elevador e do chefe voltando olhadas e mostradas ao usuário.
- Playtest humano rápido com `docs/TESTE_COM_PESSOAS.md`.
- Nada de commit/push sem pedido do usuário.

## 6. Armadilhas (da memória do projeto)
- Um Chrome por run de playtest; arquivo editado por script precisa de `touch` (o Vite não percebe); editar `.js/.mjs` com Edit, nunca heredoc Python; molas de Euler: subpassos ≤ 1/60 s.
- Estado do git ao começar: branch `feat/boss-key-solo`; muitos arquivos modificados sem commit (`balance.ts`, `rig.ts`, `Renderer.ts`, `Ball.ts`, `Bots.ts`, `Game.ts`, `Multi.ts`, `Player.ts`, `main.ts`, `Protocol.ts`, `save.ts`, `style.css`, `HUD.ts`, `Screens.ts`, `Office.ts`, `missions.mjs`) e `src/game/Toys.ts` novo; último commit `7a86140` (v0.11). Há backup em `Desktop/JobSimulator-backups`. Sugira ao usuário um commit/backup antes de mexer no `Game.ts`.
- Tamanho: `Game.ts` 3932 linhas, `Office.ts` 2445, `Minigame.ts` 1686, `Player.ts` 1460, `Multi.ts` 694.

## 8. Execução de 2026-11-01 (Passos 0, 1 e 2) — o que foi feito, decisões e riscos

O usuário deu autonomia ("pode tomar qualquer decisão que faça os testes serem melhores"); a `grilling` foi pulada porque o plano já estava decidido aqui. Nada foi commitado. Backup antes de mexer: `Desktop/JobSimulator-backups/2026-11-01-pre-mp/` (src, docs, tests, tools, mp-test.html).

**Passo 0:** `docs/NET_OWNERSHIP.md` (tabela de dono de cada estado; cada ❌ aponta a regra do robô que pega).

**Passo 1 — robô `npm run mpsoak`:** `mp-soak.html` + `tools/playtest/mpsoak-page.js` (juiz e diretor) + `tools/playtest/mpsoak.mjs` (Chrome, capturas, `report.md`). 1 host + 2 convidados dirigidos pelo `bot.js`, em passo síncrono de 0,1 s; 3 dias ≈ 10 min reais. Opções: `--seeds 1,2,3 --days 3 --n 3 --noprov --trace --maxsim 30 --headed --root <cópia>`.
- Infra no jogo (só debug): `netClock` em `Protocol.ts` (a interpolação anda no relógio da simulação via `window.simClock()`), `step(secs, fps, render)` e `window.frozen = 'off'` (as janelas não desenham à toa), `Game.deskScreen(w)` (o que a mesa de alguém mostra), `bot.js` ganhou `PT.drive(fn)` (o diretor assume a janela com input real).
- Decisão: o diretor **provoca** cada bug conhecido uma vez por dia (atraso de 12 s no hall, impressora travada com convidado desatolando, café na mão, ramal com o chefe fora do andar e a caminho da supervisão, pegar item andando), porque esperar o acaso não reproduzia nada em 3 dias. Dois convidados com o MESMO nome (`Jogador`) de propósito.
- Decisão: a rodada "antes" roda numa cópia congelada (`tools/playtest/out/_antes/`, via `--root`) para corrigir o código de verdade em paralelo.
- `mp-test.html:190,192` agora checam de verdade (contagem não começa sem todos; as janelas abrem juntas).

**Achados novos do robô (além dos 10):** chefe ausente nunca voltava (o laço só atualizava chefe visível — causa principal do bug 2 e, via agenda parada, do bug 1); todos nasciam no mesmo ponto do hall (um empurrava o outro até a cabine); no hall o host só contava quem entrou depois do elevador (a meta do dia aparecia 15 × 37 no hall; no expediente já batia); trombar no chefe no elevador dava Suspeita; "Você" como nome de todo mundo no quadro da agenda; host podia empacar na noite do dia 2.

**Passo 2 — correções (lote → o que mudou):**
- B (pacote): `PlayerState` ganhou modo, álibi, app aberto e gesto (`NET_VERSION` 0.7.0); o host usa `Game.hasAlibi(w)` (mesma regra para todos: item na mão, tarefa, prancheta, painel de trabalho — impressora/disjuntor inclusos); o remoto mostra o que carrega (`Ball.setProp` com café/papéis/galão) e a tela da mesa dele mostra o app de verdade; `BossState` leva a ronda longa.
- C (chefe): chefias de hoje são atualizadas mesmo invisíveis em `away`, e qualquer outro caminho que as deixe invisíveis é desfeito no laço; `distract`/`investigate`/`becomeSuspicious` ignoram chefe fora do andar; supervisão desviada é adiada (volta para a fila), nunca cancelada; agenda manda o PeerId de quem será supervisionado ("SUA mesa" por id, nome da sala no quadro).
- D (HUD/interação): host mede a pegada no plano do chão com folga de 1 m para o remoto e avisa quando recusa (`toast`); a mira do E prefere o que o raio acerta; "Btn dir." só com algo na mão (modo `walkHolding`); dicas de pegar não falam de arremesso; faixa "saiu da sala" só com ele fora de verdade; multiplicadores da HUD viraram palavras ("FUN extra", "dobro", "juntos").
- A (fluxo do dia): o host fecha e sobe a cabine do hall quando todos entram (ou depois de `ELEVATOR.teamWait` = 30 s, puxando quem ficou); a porta do 12º abre por ordem do host (`flow: open`); às 18h o host desce com todos (`flow: down`); "próximo dia" vira "esperando o time (n/total)" e o host começa o dia seguinte para todos (`day`), ou depois de 90 s; o pronto vale só no dia (`readyDay`) e a contagem exige todos na cabine; o relógio do elevador vem do host (`snap.el`); cada um nasce no seu lugar do hall; quem entra durante o hall entra no time.

- Extras: o host anuncia eventos, clima e plano já no hall (`Multi.beginDay`) e o convidado os aplica no hall também (antes só no elevador; com o dia trocado pelo host ele sorteava os próprios); o aviso do ramal vai para quem ligou (`toast`); trombar no chefe só dá Suspeita no expediente; a dica do tutorial vale para qualquer chefia fora.
- Regressão pega pelas checagens solo e corrigida: o `skipElevator` do solo voltou a abrir o elevador na mesma chamada.

**Verificação até aqui:** typecheck e `npm test` (21) verdes; `npm run mptest` 53/53 (com as duas checagens novas do elevador); `npm run checks` 16/16; navegador do app com 2 janelas: hall → cabine juntos → elevador → expediente → 18h → descida → noite → "esperando o time" → dia 2 junto e com os mesmos eventos. Rodadas `mpsoak` antes/depois (3 sementes × 3 dias) em `tools/playtest/out/mpsoak-antes/` e `mpsoak-depois/`.

**Antes × depois (`mpsoak`, 3 jogadores, 3 dias, sementes 1/2/3, mesmo juiz):**

| # | bug | regra | antes | depois (1º pacote) | final |
|---|---|---|---|---|---|
| 1 | supervisão das 11h | `supervisao-perdida` / `sua-mesa` / `agenda-nao-cumprida` | 3·1·3 / 3·3·3 / 3·5·5 | 0·1·2 / 0·0·0 / 0·1·1 | 2·0·1 / 0 / 1·1·2 |
| 2 | chefe sumiu | `chefe-sumido` | 3·3·3 (nunca voltou em nenhum dos 9 dias) | 0 | 0 |
| 3 | tela dos outros | `tela-remota` | 0·17·7 | 0·2·0 | 0 |
| 4 | demitido na impressora | `passeando-com-alibi` | 1·3·4 | 0 | 0 |
| 5 | elevador | `cabine-com-todos` / `porta-igual` / `fase-sincronizada` | 6·6·6 / 2·3·2 / 4·5·4 | 0 | 0 |
| 6 | dia 2 sem os outros | `contagem-com-todos` | 3·2·2 | 0 | 0 |
| 7 | troca de dia sozinho | `dia-sincronizado` | 2·1·2 | 0 | 0 |
| 8 | E para pegar | `pegada-recusada` | **0·0·0 — não reproduzido** | 0 | 0 |
| 9 | HUD | `hud-arremesso` / `aviso-chefe` / `hud-multiplicador` | 24·17·15 / 32·22·27 / 14·7·8 | 0 | 0 |
| 10 | animação | `pose-remota` / `fala-do-elevador` | 25·13·31 / 3·1·2 | 9·10·6 (falso positivo do juiz) / 0 | 0 / 0 |
| + | novos | `suspeita-fora-do-expediente` / `travou` | 3·9·2 / 1·2·1 | 0 | 0 |
| | **total** | | **132 · 120 · 127** | **9 · 14 · 9** | **3 · 1 · 3** |

"Depois (1º pacote)" = cópia tirada antes dos últimos consertos; "final" = código e juiz atuais (`tools/playtest/out/mpsoak-final/`). As 7 que sobraram são todas a **cascata de atraso da agenda**: a agenda reserva `max(duração, 20 s) + 6 s` por compromisso, mas cada saída leva ~2× isso (porta, ida, volta; a ronda reservada com 20 s leva ~43 s). O atraso acumula e os compromissos do fim da tarde (ronda das 16:40, supervisão das 14:42) não começam até as 18h. **Decisão do usuário (01/11): folga realista.** `AGENDA.trip = 22` s (porta + ida + volta) em toda saída da sala e `AGENDA.rondaLen = 50` s para a ronda inteira (medidos pelo robô); telefone e cliente são na sala. Se ainda não couber, a pausa e os opcionais saem e, por último, a ausência longa encolhe (nunca abaixo de `longMin`; o teste de equilíbrio garante que encolhe no máximo 15 s). Medido em solo, 4 sementes × 3 dias, sem jogador: compromissos que nunca começaram 2/60 → **0/49**; atraso p90 32 → 28 s, máximo 51 → 42 s; ~5 compromissos por dia em vez de 6-7 (o custo: o chefe sai um pouco menos).
- `npm run verify` verde no código atual: typecheck, 21 testes, checks 16/16, mptest 53/53, repro 0 presentes, missions ok.
- Bug 8 apareceu só depois, na rodada com a folga (semente 2, dia 2, uma pegada espontânea do robô): o convidado apertou E no item que o prompt ofereceu e o host o via **3 m atrás** (vinha andando) e recusou — a folga de 1 m não bastava. Correção: o pedido leva a posição do convidado (`item.at`) e o host a usa se estiver a até 4 m de onde ele o vê (folga de 0,5 m). Rerodada da semente 2: 0 violações, mas a mesma pegada espontânea pode não ter se repetido — confirmar no teste com pessoas.
- Folga realista, 3 sementes × 3 dias: **1 · 2 · 1** (3 supervisões "pendentes às 18h" que já estavam na mesa — regra ajustada para só acusar quem nem chegou — e o bug 8 acima).
- O caso `agenda` do `npm run playtest:missions` passava POR CAUSA do bug 2 (media "sumiu tempo suficiente" numa janela fixa, e ele nunca voltava). Reescrito para exigir a volta: falha na cópia de antes ("164,5 s e NÃO voltou"), passa depois ("75,0 s e voltou").
- O caso `esbarrao-ao-levantar` do `playtest:repro` media outra coisa desde que a 1ª sentada abre a aba ★ Objetivos (janela "proibida"): +33 por "jogo aberto na mesa vazia", igual antes e depois. O teste agora volta ao trabalho antes do chefe chegar e mede só o esbarrão (+0).

**Riscos assumidos:** quem fica AFK no relatório é puxado para o dia seguinte depois de 90 s; quem não entra na cabine em 30 s é teleportado para dentro ("o time segurou a porta"); a folga de 1 m na pegada do remoto deixa pegar um pouco mais longe que no solo; os nomes das telas e a ordem dos lotes foram decididos sem perguntar.

## 7. Prompt para colar numa conversa nova
> Leia `docs/HANDOFF_MULTIPLAYER.md` (ou o arquivo de plano `C:\Users\gabri\.claude\plans\vou-ser-bem-sincedo-quizzical-owl.md`) inteiro e continue o trabalho a partir da seção 4 "Ordem de trabalho". Comece pelo Passo 0 e o Passo 1 (robô mp-soak que reproduz os bugs), depois os lotes de correção do Passo 2. Não faça commit sem eu pedir. Avise quando terminar cada passo.
