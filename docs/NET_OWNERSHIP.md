# Dono de cada estado no multiplayer (auditoria do Passo 0)

> Feita em 2026-11-01 lendo `src/net/Protocol.ts`, `src/game/Multi.ts`, `src/game/Game.ts` e vizinhos (antes das correções).
> Cada linha diz **quem decide** o estado, **se ele vai na rede** e **se o outro lado aplica**. Linha marcada ❌ = bug
> candidato; a coluna "Regra do mp-soak" diz qual regra do robô `npm run mpsoak` pega a falha.
> Legenda: **H** = host decide · **C** = cada cliente decide o próprio · **L** = cada janela decide sozinha (sem rede).

## 1. Fluxo do dia (Causa A)

| Estado | Dono hoje | Vai na rede? | Cliente aplica? | Problema | Regra do mp-soak |
|---|---|---|---|---|---|
| Fase (`lobby/elevator/play/leaving/evening`) | **L** | não | — | ❌ cada janela anda sozinha: sobe, abre a porta, sai às 18h, desce e vai para casa pelo próprio relógio | `fase-sincronizada` |
| Dia (`dayIndex`) | **L** (`goHome` → relatório → `briefing(d+1)`) | `room.day`, `snap.d` | só na fase `elevator` e só se `!playing` (`Multi.ts:397`) | ❌ quem sai primeiro troca de dia sozinho; snapshots de outro dia são descartados (o outro "congela") | `dia-sincronizado` |
| Porta da cabine do térreo (`lobby.open`) | **L** | não | — | ❌ fecha só para quem entrou | `porta-igual` |
| Subida da cabine (`rideUp`/`shiftCabin`) | **L** (posição própria) | não | — | ❌ sobe sem os outros; `shiftCabin` pula remotos | `cabine-com-todos` |
| Porta do elevador do escritório (`elevatorOpen`) | H no dia, L no elevador/saída | `ev[5]` | só em `play` (`Game.ts:1608`) | ❌ no elevador e na saída cada um abre/fecha a sua | `porta-igual` |
| Pronto (`ready`) | C (meta do lobby) | sim (meta) | host lê | ❌ `resetForDay` zera só o próprio; o host vê o "pronto" de ontem dos outros e conta | `contagem-com-todos` |
| Contagem do elevador | H | `count` | sim | ❌ começa sem checar quem está na cabine nem de que dia é o pronto | `contagem-com-todos` |
| Descida das 18h (`rideDown`) | **L** | não | — | ❌ cada um desce quando entra | `fase-sincronizada` |
| Relógio do dia (`time`) | H | `snap.clock` | só em `play` | ok | — |
| Fim do dia (`endDay`) | H | `end` | sim | ok (o `end` chega e cada um vai para a saída) | — |
| Fala do chefe no elevador (`elevTalkIdx`) | **L** (`elevT` de cada um) | não | — | ❌ fora de passo entre janelas | `fala-do-elevador` |
| Eventos e clima do dia | H | `room.evs/wx`, `ev[8]` | sim | ok | — |

## 2. Jogador (Causa B)

| Estado | Dono | Vai na rede? (`PlayerState`) | Cliente aplica? | Problema | Regra do mp-soak |
|---|---|---|---|---|---|
| Posição, yaw, altura, mira, emote | C | `[0..3]`, `[17..19]` | sim | ok (interpolado com 100 ms) | `remoto-no-lugar` |
| Sentado / deitado | C | `[4]`, `[5]` | sim | ok | `pose-remota` |
| Atividade (`act`), físico, escondido | C | `[6..8]` | sim | `act` só cobre app proibido, cadeira e soneca | `pose-remota` |
| Item na mão (`carry`: café, relatório, galão) | C | `[12]` | ❌ **nunca lido** | o host não dá álibi e ninguém vê o café na mão do outro | `pose-remota`, `passeando-com-alibi` |
| Tarefa do chefe ativa, prancheta, minigame de trabalho aberto | C | ❌ não | — | ❌ host julga o convidado "passeando à toa" desatolando a impressora | `passeando-com-alibi` |
| Gesto da pata (`pawGesture`), digitando, comendo | C | ❌ não | — | ❌ animação não aparece para os outros | `pose-remota` |
| App aberto no PC | C | só como `act` (proibido) | parcialmente | ❌ a tela da mesa do remoto é desenhada de `w.botScreen` (só bots mudam): sempre "planilha" | `tela-remota` |
| FUN, Suspeita, cota | C (o host soma o que o chefe dá via `sus`) | `[10]`, `[11]`, `[16]` | sim | ok | — |
| Demitido | H | `[14]` + `fired` | sim | ok | — |
| Olho/rosto | C | `[13]` | só se não demitido | ok | — |

## 3. Chefias, agenda e supervisão (Causa C)

| Estado | Dono | Vai na rede? | Cliente aplica? | Problema | Regra do mp-soak |
|---|---|---|---|---|---|
| Posição, yaw, olho, lanterna, estado | H | `BossState` | sim | `state` só se não vazio | `chefe-igual` |
| Visível | H | `b[1]` | sim | ❌ três caminhos tiram o chefe de `away` sem deixá-lo visível (ramal/visita → `distract`, `investigate`, `callBack` depois disso) | `chefe-sumido` |
| `patrolling` (ronda longa do X9) | H | ❌ não | — | ❌ cliente mostra "X9 saiu da sala" em rondas que o host esconde | `aviso-chefe` |
| Agenda | H | `shop.plan.ag` | sim | ❌ "SUA mesa" compara nome (`player.name`) em vez de PeerId; dois nomes iguais = os dois veem "SUA mesa" | `sua-mesa` |
| Supervisão (`sup`) | H | não (só o efeito: `sus`/`pop`) | — | ❌ zerada para sempre quando o chefe é desviado (barulho, ramal, perseguição) no caminho; o item já ficou `done` | `supervisao-perdida` |
| Toast do ramal | H | ❌ não | — | o aviso "o chefe parou para atender" aparece para o host, não para quem ligou | (ver Passo 3) |

## 4. Objetos do escritório

| Estado | Dono | Vai na rede? | Cliente aplica? | Problema | Regra do mp-soak |
|---|---|---|---|---|---|
| Luz, pizza, impressora, blecaute, internet, reunião, cafeteira | H | `EventState` | sim | ok | — |
| Itens de missão | H | `snap.it` + pedido `item` | sim | ❌ o prompt "E pegar" do cliente usa 1,6 m no plano e o host exige 2,4 m em 3D e mãos livres, e recusa calado | `pegada-recusada` |
| Missão, vigilância, distrações, clientes do chefe | H | `snap.m/sv/ds/c` | sim | ok | — |
| Cofre, carteira, upgrades | H | `shop` | sim | ok (teste do `mptest`) | — |
| Bolinhas de papel no chão | C (quem jogou) | só o arremesso | parcialmente | cada janela tem as suas bolinhas no chão | (ver Passo 3) |

## 5. Achados do robô que não estavam na leitura

| Estado | Problema | Regra |
|---|---|---|
| Atualização das chefias (`Game.update`) | ❌ só chefe **visível** era atualizado: em `away` ele some, o relógio da ausência para e ele nunca volta — e a agenda (que espera ele livre) para junto, supervisão inclusive | `chefe-sumido`, `agenda-nao-cumprida`, `supervisao-perdida` |
| Time no hall (`applyRoster`) | ❌ quem entra na sala durante o hall só entrava em `workers` do host ao chegar no elevador: no hall a meta do dia aparecia diferente (15 × 37) e o host não contava o time — o que a subida da cabine pelo host (lote A) passou a precisar | (só no hall; `meta-igual` olha o expediente e deu 0 antes e depois) |
| Lugar de entrada no hall | ❌ todos nasciam no mesmo ponto e um empurrava o outro (o empurrão de `separateBalls`) até a cabine | `cabine-com-todos` (com o diretor) |
| Eventos do dia no convidado | ❌ com o dia trocado pelo host, o convidado começa o dia antes do `room` e sorteia os próprios; `playing` de ontem fazia o `room` ser ignorado no hall | `eventos-iguais` |
| Trombar no chefe | ❌ dava Suspeita também no elevador (antes do expediente) | `suspeita-fora-do-expediente` |
| Nome no quadro da agenda | ❌ `player.name` é "Você" em toda janela: o host mostrava "Você" e todos os convidados viam "SUA mesa" | `sua-mesa` |

## 6. Situação depois das correções (Passo 2, 2026-11-01)

Todas as linhas ❌ das seções 1 a 5 foram tratadas no código (detalhe por lote em `docs/HANDOFF_MULTIPLAYER.md` §8; o toast do ramal agora vai para quem ligou), menos estas, que ficam para o Passo 3:
- **Agenda atrasa em cascata** (host, vale no solo também): o sorteio reserva ~metade do tempo real de cada saída do chefe; os compromissos do fim da tarde não começam até as 18h (`agenda-nao-cumprida`, `supervisao-perdida`: 3·1·3 na rodada final). Decisão de design pendente.
- **Bolinhas de papel no chão** continuam sendo de cada janela (o arremesso é espelhado, a bolinha parada não).
- **Ofertas da lojinha** são sorteadas em cada janela filtrando pelo que *aquele* jogador já comprou: as vitrines podem diferir entre janelas (a compra é validada no host pela conta de quem pediu, então não há perda — só vitrines diferentes).

## 7. HUD (Causa D) — local, mas lê estado de rede

| Texto | Fonte | Problema | Regra do mp-soak |
|---|---|---|---|
| Barra de controles "Btn dir. arremessar papel" | `CONTROLS.walk` fixo | ❌ aparece sem bola na mão | `hud-arremesso` |
| Dica do monte "segure o botão direito…" | prompt de pegar | ❌ fala de arremesso antes de pegar | `hud-arremesso` |
| Faixa "O CHEFE SAIU DA SALA" | `b.busy` | ❌ fica ligada enquanto ele volta (`return`) e, no cliente, nas rondas longas | `aviso-chefe` |
| "FUN ×1,5", "juntos ×…", "rigor ×…" | `updateAlert`, `updateHUD`, `setSus` | ❌ multiplicadores que o jogador não quer ver | `hud-multiplicador` |
