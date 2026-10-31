# BOSS KEY — Playtest automático (relatório final)

29/10/2026 · branch `feat/boss-key-solo` em `04d16bc` + mudanças locais não commitadas (o código testado é o da pasta, não o do commit).

## 30/10 (tarde) — preparação para o teste com pessoas

Autonomia total, sem commit. Backup da pasta antes de começar: `Desktop/JobSimulator-backups/boss-key-2026-10-30-antes-autonomia.tgz`. Roteiro do teste com gente: `docs/TESTE_COM_PESSOAS.md`. Ferramentas novas: TDD §11, "Testes e ferramentas".

**Bugs do jogo achados e corrigidos**

| O quê | Como apareceu | Correção |
|---|---|---|
| A navegação não entrava nem saía dos **banheiros**: a folga de 0,42 m fechava o vão de 1,2 m. Valia para colegas, chefe e robôs. | 69 "robô preso" em 8 de 12 runs, sempre dentro do banheiro leste. | `Nav` com portais nos vãos de porta. A perseguição do chefe usa a grade sem portais, então fugir para o banheiro continua igual. |
| O truque **porta lubrificada** (−2 s) furava o pilar 3: aviso de 5,07 s. | 16 de 97 conferências abaixo de 6 s. | `B.MIN_WARN = 6`: o aviso total nunca fica abaixo disso. Depois: 3 de 94 abaixo de 6 s. |
| **Dia de "Ronda do X9"** pesado demais. | 73% de demissão (os outros eventos ficam em 11–45%). | Ronda de 70–100 s virou 45–65 s, com pausas mais frequentes (30–45 s). Depois: 22%. |
| **Pombos** atrás do balcão da copa: só dava para chegar por um corredor de 1 m. | Robô preso indo "bater no vidro". | Os pombos foram para as janelas livres. |
| A **porta fechada** da sala do chefe não tapava a visão dele. | Leitura do código, ao investigar o assalto. | A `lineOfSight` respeita a porta fechada. Com o chefe fora, a porta fica aberta e continua sendo o sinal de "ele saiu". |
| **Multi:** os convidados não viam os clientes. | Limitação conhecida. | `ClientState` no snapshot. `mptest`: 42/42. |
| **Hall:** o marcador do elevador tapava o letreiro e as etiquetas das vitrines se encavalavam. | Tour visual. | Marcador ao lado da porta. Etiquetas que colidem viram só ícone ou somem. |

**Melhorias:** lambri, quadros e placa do andar no hall; "rigor ×1,32" no lugar do "×1,32" solto ao lado da Suspeita; botão **Salvar relatório** na tela final (.json da run para o teste com pessoas).

**Robôs:** agora tentam o **assalto** (só com a chefia a mais de 14 m da porta), usam o **ramal**, fazem **clutch de propósito** (esperam o batimento), destravam a impressora quando o relatório precisa dela e saem da sala do chefe quando desistem. O relatório ganhou a tabela "Meta, vidas e assalto", e o susto "ele me viu" passou a contar na tensão (antes a nota dava 0 na v0.8).

**Achado de design (para decidir com gente jogando):** o assalto é muito arriscado. Com a porta aberta durante a ronda e as mesas em arco em volta dela, quase toda ronda passa olhando para dentro da sala. Nos robôs: 0 assaltos feitos e 9 demissões dentro da sala em 74 dias, antes da regra "chefia longe da porta". Num cenário controlado (ronda de 4 mesas, chefe ~40 s fora), o robô pegou o prêmio em 4 de 6 tentativas.

**Mais dois bugs achados no fim:**
- **A soleira da porta do chefe contava como "dentro da sala".** Quem passava rente à porta, ou era empurrado pelo chefe saindo, era demitido ("Pego dentro da sala do chefe", 8–9 por suíte, quase todas sem nenhum assalto). Agora a sala começa 0,5 m depois da parede: 1 caso em 54 dias.
- **O painel do café do chefe aberto ia junto para o hall** e prendia o jogador (a run travou na noite do dia 3). Agora ele fecha no fim do dia, na demissão e na virada do dia. Ganhou uma reprodução: `painel-cafe-preso-na-noite`.

**Instrumentos consertados:** as reproduções do café e da reunião não faziam o telefone tocar (a v0.7 mudou isso), então não testavam nada. A da reunião ainda apertava F no ritmo antigo. Agora as duas avisam se a tarefa não ativar, e cada uma foi conferida contra o defeito: sem assentir, a reunião acusa "erro +19,8".

**Resultado (robôs, `tools/playtest/out/pos-v08c` e `pos-v08d`):**

| | Linha de base (manhã) | Agora |
|---|---|---|
| Robô preso | 69 ocorrências em 8 de 12 runs | 0–11, numa run só |
| Conferências com menos de 6 s de aviso | 9–16% | 1–5% |
| Demissão no dia de "Ronda do X9" | 73% | 22% |
| "Pego dentro da sala do chefe" sem assaltar | 8–9 por suíte | 1 |
| Tensão (sustos/min) | 0 (métrica cega na v0.8) | 0,7–1 (alvo 0,5–2) |
| Erros de página | 0 | 0 |

Placar por perfil (variação grande com 2–3 runs): cauteloso ≈ 190–290, equilibrado ≈ 260–290, arriscado ≈ 180–200, caótico ≈ 135–210. **Arriscar ainda não compensa nos robôs.** O arriscado faz mais FUN por dia (52–57 contra 42–46), mas é demitido em 50–60% dos dias. Não mexi nos números: a decisão depende de ver gente arriscando (`docs/TESTE_COM_PESSOAS.md`).

`npm run verify`: typecheck, 12 testes, 16 rodadas de verificação do mundo, multiplayer 42/42 e 7 reproduções (0 presentes).

> **v0.8 (30/10) — primeira rodada do núcleo novo** (`tools/playtest/out/20261030-0024`, 8 runs solo, até 8 dias). Meta de FUN e vidas por perfil (FUN do dia / meta):
> - cauteloso: bate a meta até o dia ~6 e depois perde vidas por **tédio** (jogar seguro deixa de bastar);
> - arriscado: faz o maior FUN (até 92 num dia) mas perde vidas por **demissão**;
> - equilibrado: mistura das duas causas, runs de 6–8 dias; caótico: acaba no dia 4–5.
> As vidas foram perdidas pelas duas causas (≈ metade cada) — a pressão das duas pontas funciona. Robôs ainda não sabem fazer o **assalto** nem buscam colegas (multiplicador "juntos"). Achados: robô preso andando no balcão da cozinha e no banheiro (mesmo defeito do robô já descrito abaixo), Duda travada "walking" perto da máquina (1 run) e o E não sentou na mesa girada 3 vezes (1 run) — a investigar.
>
> **v0.8 etapas 2–3 (30/10)** — `tools/playtest/out/20261030-1251` e rodadas curtas seguintes: o robô passa pelo hall (anda até o elevador), sobe, joga e à noite compra nas vendinhas e vai para casa. Vale de 8–12 por dia ≈ um item por noite. O robô ficava preso no hall (a navegação só cobre o escritório) e uma run travou à noite: corrigido no robô (no hall ele anda em linha reta, passando pela porta da cabine). Os robôs ainda não usam o ramal (R) nem a visita no multi. `mp-test.html` (3 janelas) ganhou o passo do hall e o cofre do time: 41/41.
>
> **Atualização (29/10, à noite): os bugs abaixo foram corrigidos.** Veja a seção "Correções aplicadas" logo a seguir. O resto do documento é o relatório original, de antes das correções.

## Correções aplicadas

Nada foi commitado. `npm run playtest:repro`: **0 de 6 presentes**. Typecheck e build ok.

| Bug | O que mudou | Onde |
|---|---|---|
| 1.1 ENTER trava | As molas do rosto, do balão, do "squash" e da cabeça rodam em subpassos de no máximo 1/60 s; `disc`/`ring` não saem da grade. Achado no caminho: a mola do squash também divergia no ×6 e deixava a cabeça do chefe em NaN, o que derrubava o áudio na demissão seguinte (o 1.1 escondia isso). | `Face2D.ts`, `rig.ts` |
| 1.2 X9 parado no dia 1 | O X9 desce do elevador, vai para a sala e faz as rondas normais. O que entra na fila enquanto ele volta (boas-vindas, auditoria…) não se perde mais. **Depois, a seu pedido:** o dia 1 é sempre do chefe (com o tutorial), e o dia de X9 virou o evento sorteado "Ronda do X9", do dia 2 em diante, com o mesmo peso dos outros. | `Game.ts` (`openElevator`, `setupBosses`), `Boss.ts` (`leave`), `balance.ts` (`x9Day`) |
| 1.3 café do chefe | "Fazer o café do chefe" tem prioridade no E. Objeto que não pode ser usado agora não rouba o E de quem pode. | `Tasks.ts`, `Player.ts` (`updateInteract`) |
| 1.4 espiral | Demitido volta com **30** (era 50). Teto de **70** na Suspeita do começo do dia (era 95). A passiva cresce **1,06×** por dia (era 1,15×). Tarefa e café entregues aliviam **× curva**. A run solo acaba na **3ª demissão**; a do 1º dia não conta. O relatório do dia mostra as vidas. | `balance.ts` (`RUN`), `Game.ts`, `Screens.ts` |
| 1.5 reunião sobe Suspeita | A rampa da tarefa para enquanto você a executa: na reunião, com o item na mão, escolhendo o café. | `Tasks.ts` (`working`) |
| 1.6 aviso de 5 s | Aviso mínimo de 6 s em qualquer dia. | `balance.ts` (`bossDay`) |
| 1.7 esbarrão ao levantar | Esbarrão no chefe não conta no primeiro 1 s depois de levantar. | `Player.ts`, `Game.ts` (`separateBalls`) |
| 1.8 mãos ocupadas | Dá para sentar carregando algo: o item fica na mesa e volta para a mão ao levantar (a tarefa não se perde). | `Player.ts` (`stashOnDesk`) |
| 1.9 E nos e-mails | Segurar o E por 0,5 s levanta; tocar continua sendo a letra. A tela do e-mail diz isso. A 1ª versão ("E levanta se a próxima letra não for e") quebrava com erros de digitação, e só os robôs pegaram. | `Player.ts`, `Trabalho.ts` |
| 1.10 `?debug` em produção | Só funciona no dev ou num build com `VITE_PLAYTEST=1`, que o `run.mjs` usa. Conferido: o build de produção não tem os atalhos. | `main.ts`, `run.mjs` |
| 1.12 GDD | §8 reescrita (1ª pessoa, teclas reais); regras novas da run, do aviso e do clutch. | `docs/GDD.md` |
| 1.13 textos | Saiu "ele vai pedir de novo". Comer sentado na frente do chefe dá uma bronca na hora (+25, aviso âmbar), sem "CORRE!!!". "ESCAPOU" ficou âmbar e sem confete. O demitido não vê a faixa do chefe. A dica do fantasma desceu (não fica mais embaixo do carimbo). No multi, o fantasma mostra "F avisar a sala" em vez de ENTER. Aviso grande na tela apaga as listas laterais. | `Game.ts`, `HUD.ts`, `style.css` |
| 1.14 fantasma por engano | Snapshots levam o número do dia (os de outro dia são ignorados). Os buffers são limpos na virada. O `setTimeout` que deixava o colega com cara de fantasma não age se o dia já virou (causa provável). | `Multi.ts`, `Protocol.ts`, `Game.ts` |
| Multi, estado do chefe | O snapshot leva `state`, então faixa, batimento e vinheta do convidado usam o estado real. | `Multi.ts` |
| P1, arriscar compensa | Clutch com janela de **0,5 s** (era 0,35). FUN **×1,25** com uma chefia fora da sala, avisado na faixa. | `balance.ts`, `Game.ts` |

**Robôs depois das correções** (`tools/playtest/out/pos-fix3/`: 12 runs solo de até 10 dias, robôs apertando ENTER quando demitidos):
- **Estabilidade:** 0 erros e 0 travamentos (antes: o ENTER travava, e depois o áudio estourava).
- **Fim da run:** 9 das 12 runs acabaram por **fim da run** (3 vidas). Os 3 cautelosos chegaram ao dia 10.
- **Dia 1:** 12 de 12 com o X9 rondando (antes: 7 de 32). O tempo como fantasma caiu de 49% para 14%.
- **Café do chefe:** 6 de 7 entregues (antes: 0 de 36).
- **Aviso:** 0 de 146 conferências com menos de 6 s.

Multiplayer (`pos-fix-mp`, salas de 2 e 3, rodadas antes do último ajuste):
- 0 erros e queda percebida em 3,1–3,6 s;
- o relógio chega a 1 s de diferença (antes ≤ 0,1 s), provavelmente só na virada do dia, quando o convidado ignora os snapshots do dia novo até trocar de dia. Vale olhar.

**Ajuste de balanço "arriscar compensa"** (depois da rodada acima; `tools/playtest/out/balanco1/`):
- **O que estava errado:** o arriscado fazia 53 de FUN por dia, mas levava ~52 de Suspeita por dia do chefe vendo, era demitido e perdia o dia inteiro. O cauteloso ficava parado no teto de 70, que o protegia do tédio (+29/dia), e somava 9 por dia durante 10 dias. A nota "Tensão 0" não era defeito da métrica: ela é a mediana por dia, e mais da metade dos dias não tinha nenhum susto.
- **O que mudou:**
  - o demitido guarda **metade** do FUN do dia (`RUN.firedKeepFun`; no multi também);
  - o tédio soma **por cima** do teto de 70, até **85** (`RUN.maxStartSusBored`).
- **Resultado (3 runs por perfil):**

| Perfil | Placar antes | Placar agora |
|---|---|---|
| equilibrado | 70,2 | **96,9** |
| arriscado | 17,7 | **85,2** |
| cauteloso | 84,9 | **50,5** |
| caótico | 11,4 | **43,6** |

  - Tensão foi de 0 para 6,2 (0,4 susto por minuto); a nota-indicador, de 6,7 para 7,7; 0 erros.
  - Com 3 runs por perfil a variação é grande: vale confirmar com a suíte completa (`npm run playtest`).

**X9 sorteado** (`tools/playtest/out/x9-sorteado/`, 12 runs solo + 1 sala de 2 jogadores; 0 erros):
- **Dia 1:** foi do chefe nas 12 runs.
- **Dias de X9:** "Ronda do X9" saiu em 5 dos 76 dias jogados. Nesses dias, 80% dos robôs foram demitidos (amostra pequena: vale ver jogando se o dia de X9 ficou pesado demais).
- **Placar:** arriscado 111 > equilibrado 91 > cauteloso 76 > caótico 73.
- **Dia 1 com o chefe:** ficou mais duro que com o X9. O equilibrado é demitido pela 1ª vez, em média, no dia 1,7, e a nota "Curva de dificuldade" caiu para 3,7. A demissão do dia 1 continua sem gastar vida.
- **Multiplayer:** a sala de 2 acabou no dia 1, com os dois demitidos.

**Ainda não resolvido:** os robôs quase não fazem clutch; a tensão ainda está um pouco abaixo do alvo (0,5–2 sustos/min).

**Não mexi:** desempenho (1.11; precisa medir numa máquina mais fraca) e o fim de run em grupo (continua "todos demitidos no mesmo dia").

**Ferramenta de teste:**
- o analisador lia o placar do "dia" vazio da tela final e dava 0;
- o robô segura o E para sair do e-mail e não acusa mais "mãos ocupadas";
- o `run.mjs` guarda a pilha do erro.

**Decisões que tomei no seu lugar** (você deu autonomia total, então pulei a `grilling`):
- os números da espiral (30 / 70 / 1,06 / 3 vidas);
- o 1º dia não gasta vida;
- o bônus ×1,25;
- segurar E nos e-mails;
- a bronca na hora para quem come sentado;
- no ajuste de balanço, demitido guarda metade do FUN e o tédio soma até 85.

Todos estão em `src/balance.ts` (e no `Game.ts`) e são fáceis de ajustar.

**Como refazer:** `npm run playtest` (suíte completa, ~2h), `npm run playtest -- --suite smoke` (~3 min) e `npm run playtest:repro` (reproduções isoladas; aceita nomes, ex.: `npm run playtest:repro -- cafe-do-chefe-inalcancavel`). A saída fica em `tools/playtest/out/` (agora no `.gitignore`).

## Resumo

- **14 bugs com passos de reprodução** (seção 1). Os mais graves:
  - o jogo trava quando o demitido aperta ENTER, que é justamente o que a tela manda fazer;
  - o X9 não ronda no dia 1;
  - o café do chefe é impossível (0 de 36 entregues);
  - a espiral de demissão faz a run solo nunca acabar.
- As 6 reproduções isoladas continuam **PRESENTE**.
- **Novos nesta suíte:** o aviso cai para 5 s no dia 10 (1.6); textos que contradizem o jogo (1.13); um convidado vê como fantasma quem foi demitido no dia anterior (1.14); o E disputado entre objetos também atinge a máquina de lanche (1.3).
- **Descartados:** o "segundo travamento" do handoff era defeito do teste (Chrome compartilhado), não do jogo. Estão descartados também quatro "bugs" que eram defeitos do robô.
- **Diversão:** 5,8/10 pelos robôs; ≈ 4,7/10 na minha leitura dos prints e vídeos. Os primeiros minutos são bons. Do dia 3 em diante, o jogo vira assistir como fantasma, e jogar com cuidado rende mais que arriscar.
- **Multiplayer:** sincronia excelente (relógio ≤ 0,1 s), quedas percebidas em ~4 s, 0 erros. A run em grupo acaba cedo (metade das salas no dia 2).
- **Sugestão de ordem para corrigir:** 1.1 → 1.4 → 1.2 → 1.3 → 1.5 → 1.6 → 1.8 → 1.7 → 1.14 → 1.13 → 1.10 (detalhes na seção 4).

---

## 1. Bugs, do mais grave ao mais leve

Cada item traz o que acontece, como reproduzir jogando, a reprodução automática (quando há), a causa no código e o que a suíte mediu. "PRESENTE" quer dizer que `npm run playtest:repro` reproduziu o bug nesta data.

### 1.1 CRÍTICO — Demitido + ENTER trava o jogo

- **O que acontece:** demitido (fantasma), o jogador aperta ENTER para acelerar o tempo ×6. Em poucos segundos a aba congela e o Chrome a derruba. **O próprio jogo pede o ENTER:** a tela de demitido mostra "ENTER para acelerar o tempo" e a barra de teclas mostra "ENTER acelerar o tempo". Quem segue a instrução trava o jogo.
- **Passos:** 1) começar uma run solo; 2) ser demitido (Suspeita em 100 com o chefe vendo); 3) como fantasma, apertar ENTER; 4) esperar alguns segundos perto das colegas Telinha (Duda e Fê, que estão sempre no solo).
- **Reprodução automática:** `fantasma-enter-trava` → **PRESENTE**. Em 6 s a 60 fps, o "tamanho do olho" chega a 4,2×10^118 (o normal é ≈ 1).
- **Causa:** as molas do rosto 2D são integradas com Euler (rigidez 260, amortecimento 14; `src/characters/Face2D.ts:168-169`). Com o tempo ×6, o passo fica grande demais e a mola diverge. Com o tamanho gigante, os laços `disc`/`ring` do `pixelFace` da Telinha (`Face2D.ts:1102-1115`) percorrem um raio enorme, e a aba fica presa. Reproduzi forçando o tamanho: a pilha para em `pixelFace`.
- **Correção sugerida:** integrar as molas em subpassos de no máximo 1/60 s (ou fazer o ×6 rodar vários `update` pequenos) e limitar o raio em `disc`/`ring`.

### 1.2 ALTO — No dia 1 o X9 fica parado no elevador

- **O que acontece:** o dia que deveria ensinar a esconder a tela passa sem nenhuma chefia na sala, salvo quando o evento sorteado é "Ronda do X9". As boas-vindas, a auditoria e a impressora entram na fila e nunca acontecem.
- **Passos:** começar uma run nova e jogar o dia 1 inteiro. Se o evento do elevador não for "Ronda do X9", ninguém ronda.
- **Reprodução automática:** `x9-parado-dia1` → **PRESENTE**. Com o evento "bolo", o X9 fica em `wait` por 150 s, sem abrir nenhuma porta.
- **Na suíte:** 25 de 32 runs sem nenhuma ronda no dia 1. "Ronda do X9" saiu em só 2 delas.
- **Causa:** `enterElevator` deixa o X9 em `wait` (`src/game/Game.ts:579`). Como o chefe ocupado não inicia ronda, o `updateDirector` nunca o põe para andar. Só o evento "ronda" chama `startPatrol`.
- **Correção sugerida:** ao abrir o elevador no dia do X9, chamar `startPatrol(true)` (ou deixá-lo voltar ao estado normal de ronda).

### 1.3 ALTO — A tarefa "café do chefe" não pode ser cumprida

- **O que acontece:** na máquina de café, o E sempre pega um café comum. "Fazer o café do chefe" nunca é escolhido. Com a máquina esquentando, o E não faz nada. A Suspeita sobe em rampa até o fim do dia.
- **Passos:** esperar o telefone sortear "café do chefe" (ou repetir dias até sair), atender, ir até a máquina e apertar E. Aparece "Pegar café (segure)", e você sai com um café comum.
- **Reprodução automática:** `cafe-do-chefe-inalcancavel` → **PRESENTE**. A tela mostra "Pegar café (segure)", o painel do café do chefe não abre e você fica com um café comum na mão.
- **Na suíte:** 36 tarefas de café sorteadas no solo, **0 entregues**. Somando solo e multiplayer, o robô viu "Pegar café" no lugar de "Fazer o café do chefe" 70 vezes, em 27 partidas. O café comum na mão ainda alimenta o bug 1.8: ele é o item mais comum de quem é perseguido sem poder sentar.
- **Causa:** `coffee` (`src/game/Player.ts:402`) e `cafeMake` (`src/game/Tasks.ts:335`) ficam no mesmo ponto e com o mesmo alcance (`P.coffee`, z − 0,6, r 1,4). O `updateInteract` (`Player.ts:764`) dá nota pela distância e pela direção do olhar; no empate, ganha o primeiro da lista.
- **Mesmo defeito, outro caso:** um objeto que não pode ser usado agora (`ok()` falso) disputa o E em pé de igualdade. Uma cadeira de corrida largada perto da máquina de lanche mostra "sem corridas por hoje" no lugar de "Comprar lanche" (3 vezes numa partida multiplayer).
- **Correção sugerida:** esconder `coffee` enquanto a tarefa de café está pendente (ou dar `prio` ao `cafeMake`) e, no `updateInteract`, preferir objetos com `ok()` verdadeiro.

### 1.4 ALTO (design) — Espiral de demissão e uma run solo que nunca acaba

- **O que acontece:** do dia 2–3 em diante, quase todo dia termina em demissão, e a run não chega ao fim.
- **Por quê:** quem é demitido volta com 50 de Suspeita, e só o tempo passando (0,18/s × 1,15^(dia−1) × 180 s) já soma ~32 no dia 1, ~65 no dia 6 e mais de 110 no dia 10. A run só acaba quando todos são demitidos no mesmo dia, mas os colegas-NPC quase nunca são.
- **Na suíte (32 runs × 10 dias):**
  - nenhuma run terminou: as 32 pararam no limite de 10 dias;
  - demitidos por dia: 0% no dia 1, 56% no dia 2, 81% no dia 3, 88–100% do dia 6 em diante;
  - FUN dos dias sem demissão: 44 no dia 1, 5 no dia 3, **0 nos dias 7, 9 e 10**;
  - dos 28 dias que começaram com Suspeita ≥ 85, 25 terminaram em demissão;
  - 49% do tempo das runs solo foi como fantasma.
- **Correção sugerida:** ver as melhorias de P0 na seção 4 (fim de run legível e quebra da espiral).

### 1.5 MÉDIO — A "reunião relâmpago" feita sem erro aumenta a Suspeita

- **O que acontece:** a rampa da tarefa continua correndo durante os ~20 s da reunião, e o −8 da entrega não cobre isso.
- **Passos:** num dia 3 ou mais tarde, esperar o telefone sortear "reunião relâmpago", atender, ir à mesa de reunião e acertar todos os acenos (F no ritmo). Compare a Suspeita de antes e de depois.
- **Reprodução automática:** `reuniao-perfeita-sobe-suspeita` → **PRESENTE**. No dia 3, com 13 acenos certos, a Suspeita vai de 1,1 para 16,4 (+15,3, já com o −8). Só o tempo passando daria +4,8.
- **Na suíte:** é a tarefa mais cara do jogo. Dá em média +22,1 de Suspeita de rampa no dia, contra 3–7 nas outras, e só 17 das 31 foram entregues. O mesmo vale, em menor grau, para o relatório e o galão (andar devagar com o galão).
- **Correção sugerida:** pausar a rampa enquanto a tarefa está sendo executada.

### 1.6 MÉDIO (achado novo) — A partir do dia 10 o aviso antes da conferência cai para 5 s

- **O que acontece:** o pilar 3 do GDD ("aviso sempre justo: ≥ 6–8 s antes de uma ronda") deixa de valer no dia 10.
- **Na suíte:** 9 de 302 conferências tiveram menos de 6 s de aviso. **8 delas foram no dia 10**, todas com ~5,1 s. A nona foi um caso isolado de 1,1 s no dia 4, com pizza, sem padrão.
- **Causa:** é o número do balanceamento: `warn: Math.max(5, 8 - Math.floor(day / 3))` em `src/balance.ts:171` dá 8 s nos dias 1–3, 7 s nos dias 4–6, 6 s nos dias 7–9 e **5 s do dia 10 em diante**.
- **Correção sugerida:** `Math.max(6, …)`, ou mudar o pilar no GDD se 5 s for intencional.

### 1.7 MÉDIO — Levantar da cadeira dá esbarrão automático no chefe

- **O que acontece:** o chefe confere a tela parado atrás da cadeira, exatamente onde o jogador aparece ao levantar. O esbarrão dá +8 × curva de Suspeita, sem o jogador ter como evitar.
- **Passos:** sentado no PC, esperar o chefe vir conferir a sua tela e apertar E para levantar enquanto ele está atrás de você.
- **Reprodução automática:** `esbarrao-ao-levantar` → **PRESENTE**. Com o chefe em "check" a 1,85 m da cadeira, apertar E dá +10,7 de Suspeita.
- **Causa:** `Game.separateBalls` (`src/game/Game.ts:2073`) trata a sobreposição na hora de levantar como esbarrão.
- **Correção sugerida:** levantar empurra o jogador para um lado livre, ou não contar esbarrão no primeiro meio segundo depois de levantar.

### 1.8 MÉDIO — Perseguido com as mãos ocupadas não tem saída

- **O que acontece:** sentar no PC e entrar na cabine exigem mãos livres, e não existe tecla para largar o que se carrega. Perseguido com um café ou um relatório na mão, o jogador só pode correr.
- **Passos:** pegar um café (ou um relatório de uma tarefa), chamar a atenção do chefe até ele correr atrás de você e tentar sentar no seu PC. Aparece "mãos ocupadas".
- **Reprodução automática:** `perseguido-com-maos-ocupadas` → **PRESENTE**. Com um relatório na mão, na frente do PC, o aviso é "mãos ocupadas" e o jogador continua em pé.
- **Na suíte:** 31 vezes em 21 partidas, quase sempre com café (ver bug 1.3).
- **Correção sugerida:** sentar já larga o item na mesa, ou uma tecla para largar.

### 1.9 BAIXO — Com os e-mails abertos, o E vira letra

- **O que acontece:** enquanto o app Trabalho está com a fixa "e-mails", o E (e também G, H, C e Espaço) vai para o texto. Para levantar, é preciso trocar de janela antes.
- **Passos:** sentar no PC num dia cuja fixa é "e-mails", abrir o Trabalho e apertar E para levantar. Um "e" entra no e-mail e você continua sentado.
- **Na suíte:** 11 vezes em 8 runs.
- **Causa:** `typing` (`src/apps/Trabalho.ts:46`) desliga os atalhos em `src/game/Player.ts:1076`. É intencional para digitar, mas não há saída sem trocar de janela.
- **Correção sugerida:** usar Esc ou o clique fora do monitor para levantar, ou mostrar "troque de janela para levantar" no aviso.

### 1.10 RELEASE — O `?debug` funciona no build de produção

- **O que acontece:** qualquer jogador que abrir o jogo com `?debug` ganha `game`, `step`, `tp`, `fakeLock` e os outros atalhos no console.
- **Passos:** `npm run build`, `npm run preview` e abrir `http://localhost:4173/?debug`. No console, `game` existe.
- **Causa:** `src/main.ts:259` testa só `location.search`, sem `import.meta.env.DEV`. O playtest automático depende desses atalhos e roda no build, então a trava precisa de uma exceção para ele (por exemplo, uma flag de build só para o playtest).

### 1.11 DESEMPENHO — IA dos colegas e HUD

- **O que acontece (medido na sessão anterior, não remedido nesta):** `bots.update` custa ~1 ms por quadro, e o HUD ~0,6 ms por quadro quando o aviso troca muito.
- **Nesta suíte (Chrome sem janela, RTX 2060):** solo em tempo real com 106–124 fps de média (71 nos 5% piores). No multiplayer, com todas as abas na mesma GPU: 2 abas ~72/48, 3 abas ~44/36, 4 abas ~27–32/23. A queda vem de dividir uma GPU entre 4 jogos; com cada jogador na sua máquina, o número relevante é o do solo. Ainda assim, vale medir a IA e o HUD numa máquina mais fraca.

### 1.12 DOCUMENTAÇÃO — O GDD §8 (Controles) está desatualizado

- O ping no **Q** e os sons de comunicação **1–4** não existem no código. O Q só fecha o painel do café do chefe (`src/game/Tasks.ts:361`).
- O texto ainda fala em **câmera em 3ª pessoa**. O jogo é 100% em primeira pessoa desde o commit `c78a63c`.
- **Tab** está como "placar". Hoje Tab segura a ajuda (`src/game/Game.ts:2301`).

### 1.13 BAIXO — Textos da tela que contradizem o jogo ou se sobrepõem

- **"ele vai pedir de novo":** ao entregar uma tarefa do telefone, o aviso diz "TAREFA FEITA! −8 Suspeita · ele vai pedir de novo" (`src/game/Game.ts:1189`). Desde a v0.6 a tarefa não volta: `Tasks.complete` a tira do dia (`src/game/Tasks.ts:215-217`). O texto induz o jogador a esperar o telefone de novo.
- **Tela de demitido:** o carimbo "DEMITIDO", o aviso "⚠ O CHEFE…" e a dica do fantasma ficam um por cima do outro no centro da tela. A dica, justamente a do ENTER, quase não se lê (print `tools/playtest/out/final/shots/real-equilibrado-0/d1-t061-ghost-ghost.jpg`).
- **"CORRE!!!" para quem já está sentado:** comer o lanche (G) sentado com o chefe olhando dispara a perseguição com "sente na SUA mesa antes que ele te alcance!" (`src/game/Game.ts:1402`). Logo em seguida vem "ESCAPOU! por um triz", em verde, com confete e som de clutch, mas com +25 × curva de Suspeita (`Game.ts:1510-1521`). A mensagem manda fazer o que o jogador já fez e comemora uma punição. No vídeo da run em tempo real, isso aparece três vezes em 2 s antes da demissão.
- **Faixa do chefe para o fantasma:** demitido, o jogador continua vendo "⚠ O CHEFE SAIU DA SALA — volte para a mesa ou pegue um café (álibi)". `updateAlert` (`src/game/Game.ts:2306`) não confere se ele foi demitido. Visto no solo e no multiplayer.
- **ENTER no multiplayer:** a barra de teclas do fantasma sempre mostra "ENTER acelerar o tempo" (`src/ui/HUD.ts:35`), mas no multiplayer o ENTER não faz nada (`src/game/Player.ts:682`). Ali a tecla útil é F, que avisa a sala.
- **Não confirmado:** num convidado demitido, a barra "☕ derramando 0% (SHIFT = andar com cuidado)" continuou na tela como fantasma (`tools/playtest/out/final/shots/mp2-0/Beto-d1-t108.jpg` e `…-t139.jpg`). A causa não foi isolada: no código, `fire` chama `dropCarry`, que limpa a barra.

### 1.14 MÉDIO (multiplayer) — Num convidado, quem foi demitido ontem continua fantasma no dia seguinte

- **O que acontece:** na sala de 4 jogadores `mp4-0`, uma das janelas viu dois colegas como demitidos (fantasmas) desde o começo do dia 3 (t = 0,7 s). Na verdade os dois jogavam normalmente. A janela só voltou a bater com a realidade quando os dois foram demitidos de novo (t ≈ 79 e 86 s). Foram 42 amostras de sincronia divergentes; as outras 5 salas deram 0.
- **Passos:** sala com 3 ou 4 jogadores; um convidado é demitido no dia N; no dia N+1, olhar esse colega pelas outras janelas. Em pelo menos uma, ele aparece como fantasma enquanto joga. É intermitente.
- **Causa provável (não isolada):** no convidado, `markRemoteFired` só é chamado quando o snapshot diz "demitido" (`src/game/Multi.ts:544`), e nenhum caminho desfaz isso dentro do dia. Um snapshot atrasado do fim do dia anterior, chegando logo depois da virada, deixa o colega como fantasma até o fim do dia. O efeito fica naquela janela: o colega aparece como fantasma. O rodízio de tarefas e o placar rodam no anfitrião (`Multi.ts:413`, `Multi.ts:434`), que não aplica esse flag, então não são afetados.
- **Correção sugerida:** levar o número do dia junto no snapshot e ignorar snapshots de outro dia, ou sincronizar o "demitido" nos dois sentidos.

### Descartados depois de triagem (não são bugs do jogo)

| Achado | Veredito | Como foi conferido |
|---|---|---|
| "Segundo travamento" do perfil cauteloso (item 12 do handoff) | **Defeito do teste.** Com um Chrome só para 5 runs paralelas, a página ficava sem responder na virada do dia e abas novas não abriam. Não há laço infinito no jogo. | A pilha "travada" tinha um único quadro, `Ac`, que é o laço principal do jogo desenhando no modo acelerado. A página respondeu de novo minutos depois. Um controle **sem nenhuma aba travada**, com 4 abas jogando no mesmo Chrome, também impediu abas novas de abrir. Com um Chrome por run, as sementes 1000 e 1010 (a run travada usou a 1000, não a 1010 do handoff) e outras 30 runs fizeram 10 dias sem travar. |
| Robô "preso andando" (421 vezes nas runs solo, 381 delas fugindo para a cabine do banheiro) | **Defeito do robô.** Ele usa a navegação dos colegas-NPC, que não cobre o interior do banheiro. | Teste isolado: andando da porta até a frente da cabine, nos dois banheiros, o jogador chega e o E esconde (modo `hide`). Efeito colateral: **o esconderijo não foi testado pelos robôs** (0 esconderijos em 17 tentativas). |
| Demitido sentado, de 50 a 100 em 4 s (vídeo da run em tempo real, dia 2) | **Defeito do robô.** Ele comeu o lanche mais duas vezes com o chefe parado na mesa dele, e cada lanche visto vira perseguição e "escapou" (+29). As mensagens desse caso estão no item 1.13. | Quadros do vídeo entre 11:20 e 11:54 do relógio do jogo; o FUN subiu +4 (lanche) nos segundos 57 e 58; `updatePlayerAct` (`src/game/Game.ts:2056`) marca comer sentado como farra física. |
| "E não pegou a bolinha do monte" (4 runs) | **Defeito do robô** (já descartado na sessão anterior com cena isolada). | — |
| "E não sentou no PC" (1 vez) | **Defeito do robô:** sentar é clique ("CLIQUE Sentar no seu PC"), não E. | Texto do aviso registrado pelo robô. |

---

## 2. Diversão: nota por critério

A coluna "Robôs" é a nota automática do `analyze.mjs`, sobre 369 dias jogados (32 runs solo × 10 dias, 2 runs em tempo real e 6 salas multiplayer). A coluna "Minha leitura" ajusta essa nota com o que os prints e os vídeos mostram, e com onde a métrica automática engana. As duas são indicadores; a confirmação vem de gente jogando.

| Critério | Robôs | Minha leitura | Por quê |
|---|---|---|---|
| Recompensa | 7,7 | **7,5** | O primeiro FUN chega aos ~6 s e rende 9,3 FUN por minuto jogado. Os prints mostram retorno caprichado: combo ×7 no Ball Ops, confete, "TAREFA FEITA!", lanche com som e migalhas. |
| Tensão | 7,1 | **6** | 0,8 momento de perigo por minuto, dentro do alvo (0,5–2). Mas quase tudo é perseguição (286): **só 2 clutches e 7 quase-flagras em 369 dias**. O momento do pilar 1 ("ALT-TAB no limite") quase não acontece. |
| Variedade e agência | 6,6 | **6,5** | 2,3 fontes de FUN por dia, e 49% das diversões sorteadas concluídas (31% no cauteloso, 70% no equilibrado). |
| Justiça | 6,1 | **4** | O aviso cumpre o pilar 3 em 97% das conferências (as falhas estão no dia 10, bug 1.6). Mas 97% das demissões são por "Suspeita no máximo", que acumula sozinha: 46% vem do tempo passando e 21% de tarefa esperando. Dos dias que começam com ≥ 85, 25 de 28 acabam em demissão. Isso parece "o jogo me pegou", não "eu vacilei". Somam-se as mensagens contraditórias (1.13). |
| Ritmo | 5,7 | **4** | Pouco tempo morto com o jogador ativo (3%), mas **45% do tempo como fantasma** (49% no solo), e os dias 7 a 10 rendem 0 FUN. |
| Escolhas importam | 9,8 | **3** | A métrica só mede se os perfis terminam diferentes, e eles terminam. Mas quem ganha é o **cauteloso** (69,6 pontos), à frente do equilibrado (67), do arriscado (61,6) e do caótico (36,1). O arriscado faz quase o dobro de FUN por dia (35 contra 19), mas é demitido mais vezes e perde tudo. É o contrário do pilar "risco por recompensa". |
| Curva de dificuldade | 0 | **1** | Dia 1 sem chefia em 25 de 32 runs; depois, demissões em 56% dos dias 2 e 81% dos dias 3. Não há subida: é um degrau. |
| Estabilidade técnica | 3,5 | **5** | A nota automática conta as 3 salas multiplayer que acabaram por "fim da run" como interrompidas; corrigido isso, dá 8,0. Mas há um travamento conhecido que o próprio jogo induz (ENTER do fantasma, 1.1), que os robôs não acionam porque não apertam ENTER quando demitidos. Fora isso: 0 erros de página e 0 exceções em 52 jogadores-run. |
| Clareza da tela (só pelos prints) | — | **5** | Até seis blocos de texto ao mesmo tempo no dia 1; carimbo, faixa e dica sobrepostos na demissão; "CORRE!!!" para quem já está sentado. |

**Nota-indicador:** 5,8/10 pelos robôs (6,4 corrigindo as 3 salas); **≈ 4,7/10 na minha leitura**. A prévia de ontem dava ≈ 5,4.

**O que funciona:** os primeiros minutos. O FUN vem rápido, as tarefas fluem (assinar com o Caio levou 12,7 s, do telefone à bandeja), a ronda avisa com folga (mediana de 14 s) e o multiplayer está bem sincronizado.

**O que tira a graça:** do dia 3 em diante, o jogo vira assistir como fantasma. A Suspeita começa o dia em ~55, só o tempo já a empurra para 100, e nada que o jogador faça bem compensa na mesma escala.

**Perfis (solo, 8 runs × 10 dias cada):**

| Perfil | 1ª demissão (dia) | Demitido por dia | Placar (FUN total) | FUN por dia sem demissão | Diversões do dia | Perseguições por dia | Esperando o chefe voltar |
|---|---|---|---|---|---|---|---|
| cauteloso | 3 | 64% | 69,6 | 19,2 | 31% | 0,8 | 21% |
| equilibrado | 2,6 | 80% | 67 | 33,5 | 70% | 0,9 | 13% |
| arriscado | 2,6 | 83% | 61,6 | 35,2 | 68% | 0,9 | 5% |
| caótico | 2 | 85% | 36,1 | 24 | 42% | 0,9 | 4% |

**Curva da run (solo, todos os perfis):**

| Dia | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Demitidos | 0% | 56% | 81% | 84% | 81% | 88% | 97% | 94% | 100% | 97% |
| Suspeita ao chegar | 0 | 34 | 60 | 58 | 56 | 58 | 56 | 51 | 53 | 50 |
| FUN (não demitidos) | 44 | 22 | 5 | 19 | 4 | 3 | 0 | 2 | 0 | 0 |

**De onde vem a Suspeita (solo):** tempo passando 46% · tarefa do chefe esperando 21% · chefe viu ou ouviu 20% · trabalho errado 6% · tédio 6% · fixa sem cota 1%.

**Tarefas do telefone (solo):** relatório 97/105 entregues · impressora 46/49 · assinatura 53/65 · galão 28/34 · reunião 17/31 (a mais cara: +22 de Suspeita de rampa no dia) · **café 0/36**.

Relatório completo dos robôs: `tools/playtest/out/final/report.md`.

## 3. Multiplayer (sala local, uma aba por jogador)

| Sala | Jogadores | Como acabou | Relógio (máx) | Posição (mediana/máx) | Chefe (máx) | Eventos diferentes | Queda / saída | FPS médio / 5% piores |
|---|---|---|---|---|---|---|---|---|
| mp2-0 | 2 | 3 dias (limite) | 0,05 s | 0,3 / 1,6 m | 0,4 m | 0 | — | 71 / 48 |
| mp2-1 | 2 | **fim da run no dia 2** | < 0,1 s | 0,2 / 1,6 m | 0,7 m | 0 | anfitrião saiu: aviso em **3,6 s** | 73 / 48 |
| mp3-0 | 3 | 3 dias (limite) | 0,04 s | 0,4 / 1,6 m | 0,8 m | 0 | — | 46 / 36 |
| mp3-1 | 3 | **fim da run no dia 2** | 0,1 s | 0,4 / 1,6 m | 0,8 m | 0 | convidado caiu: percebido em **4,1 s** | 43 / 36 |
| mp4-0 | 4 | 3 dias (limite) | 0,08 s | 0,7 / 1,7 m | 1,8 m | 0 | — | 27 / 23 |
| mp4-1 | 4 | **fim da run no dia 2** | 0,1 s | 0,7 / 1,3 m | 0,5 m | 0 | convidado caiu: percebido em **3,5 s** | 32 / 24 |

O relatório automático registra as três salas "fim da run" como "tempo esgotado". Era o orquestrador esperando o limite de dias; a tela final do jogo estava certa (prints `tools/playtest/out/final/shots/mp2-1/*-d1-t363.jpg`). Já está corrigido no `run.mjs`.

**Bom:** todos entram na sala na hora, o relógio fica a ≤ 0,1 s, as posições a 0,2–0,7 m de mediana e o chefe a ≤ 1,8 m. Os eventos do dia batem sempre. A queda de um convidado e a saída do anfitrião são percebidas em 3,5–4,1 s, com aviso claro ("O ANFITRIÃO SAIU — a sala fechou"). Nenhum erro de página.

**Achados:**
- **Demitido fantasma por engano num convidado** (bug 1.14).
- **O estado do chefe não vai para os convidados.** O snapshot leva visibilidade, posição, direção, olhos e lanterna (`src/game/Multi.ts:473-476`), mas não `state`. No convidado, `busy`/`out` usam um estado local velho, e o detector do robô viu o chefe "parado em `leave`" por 962 quadros em 2 salas. É o que decide a faixa "O CHEFE SAIU DA SALA", o batimento e a vinheta de perigo (`src/game/Game.ts:2239-2248` e `2310`). Os prints não mostraram faixa errada com certeza, mas é o primeiro lugar a olhar se um convidado reclamar de aviso falso.
- **Run curta em grupo:** como a run acaba quando todos são demitidos no mesmo dia, metade das salas acabou no dia 2. Com a espiral do solo (1.4), isso vira a regra. Vale decidir se o grupo deve continuar enquanto alguém tiver vidas.
- **FPS com 3–4 abas** cai para ~45 e ~27–32, porque é uma GPU para quatro jogos; não representa jogadores em máquinas separadas.
- A sala Steam não foi testada.

## 4. Melhorias por prioridade

**P0 — antes de qualquer pessoa jogar**

1. **Tirar o travamento do ENTER (bug 1.1).** Subpassos de no máximo 1/60 s nas molas e teto no raio do `pixelFace`. Enquanto isso não sai, desligar o ×6.
2. **Quebrar a espiral e dar fim à run solo (bug 1.4).** Hoje, do dia 3 em diante, 81–100% dos dias acabam em demissão, os dias 7–10 rendem 0 FUN e metade do tempo se passa como fantasma. Propostas (combinar 2 ou 3):
   - a run solo acaba com 2 demissões seguidas (ou 3 no total), em vez de depender dos NPCs;
   - voltar da demissão com 30–35, não 50;
   - a entrega de tarefa e o café também aliviam × curva (hoje só a punição escala);
   - teto de 80 na Suspeita com que se começa o dia.
3. **Dia 1 com o X9 rondando de verdade (bug 1.2).** É o dia de aprender a esconder a tela; hoje 78% dos dias 1 não têm chefe.
4. **Café do chefe possível (bug 1.3).** 0 de 36 entregues.

**P1 — justiça, clareza e "arriscar compensa"**

5. **Arriscar tem que render mais.** O cauteloso fez mais pontos que o arriscado (69,6 contra 61,6), e os robôs conseguiram só 2 clutches em 369 dias. Ideias:
   - bônus de FUN por jogar com o chefe fora da sala;
   - clutch mais alcançável: janela maior que 0,35 s ou um som de "agora!";
   - placar que valorize o FUN por dia, não só o FUN somado de quem sobreviveu.
6. **Pausar a rampa das tarefas enquanto o jogador as executa (bug 1.5).** A reunião perfeita deixaria de ser a tarefa mais cara.
7. **Aviso de no mínimo 6 s em todos os dias (bug 1.6)**, ou mudar o pilar no GDD.
8. **Mãos ocupadas:** sentar larga o item na mesa (bug 1.8). **Levantar sem esbarrão** (bug 1.7).
9. **Textos (bug 1.13):** tirar "ele vai pedir de novo"; separar o carimbo de demitido da dica; não mandar "sente na sua mesa" a quem está sentado nem mostrar "ESCAPOU" em verde quando custa Suspeita; esconder a faixa do chefe para o fantasma; trocar a dica do ENTER pela do F no multiplayer.
10. **Menos texto na tela ao mesmo tempo.** No dia 1 chegam a aparecer seis blocos (tutorial, diversões, tarefas, aviso grande, aviso do objeto, "✓ boa!"), e o aviso grande cobre o nome do objeto (`tools/playtest/out/final/shots/real-equilibrado-0/d0-t020-walk-fun.jpg`). Sugestão: com um aviso grande na tela, recolher as listas laterais.

**P2 — release, desempenho e manutenção**

11. **Bloquear o `?debug` no build de produção (bug 1.10)**, com uma flag de build só para o playtest.
12. **Multiplayer:** enviar o estado do chefe aos convidados (ver seção 3) e rever o fim de run em grupo. Com todos demitidos no mesmo dia, 2 das 4 salas medidas acabaram no dia 2.
13. **Desempenho:** a IA dos colegas (~1 ms por quadro) e o HUD (~0,6 ms); com 3–4 abas na mesma GPU, o jogo fica em ~45 fps.
14. **Atualizar o GDD §8** (bug 1.12).
15. **Ferramenta de teste**, se você quiser continuar usando:
    - o robô não deveria comer na frente do chefe;
    - precisa de um caminho próprio até a cabine do banheiro, para testar o esconderijo;
    - a nota "Escolhas importam" deveria medir se arriscar compensa, não só se os perfis terminam diferentes.

## 5. Sobre o teste

**O que rodou** (`npm run playtest -- --parallel 5 --max-days 10 --out final`, ~2h, no build de produção servido pelo `vite preview`, Chrome sem janela com a GPU RTX 2060):

| Parte | O que foi | Resultado |
|---|---|---|
| Solo acelerado | 4 perfis (cauteloso, equilibrado, arriscado, caótico) × 8 runs × 10 dias, sementes 1000–1073 | 32/32 runs completas, 0 travamentos, 0 erros de página |
| Solo em tempo real | 2 runs × 3 dias, com vídeo e prints a cada 20 s | 2/2 completas |
| Multiplayer local | salas de 2, 3 e 4 jogadores × 2 runs × 3 dias, uma aba por jogador, sala local por BroadcastChannel; testes de queda de convidado e de saída do anfitrião | ver seção 3 |
| Reproduções isoladas | `npm run playtest:repro` | 6/6 bugs presentes |

**O que mudou na ferramenta nesta sessão** (`tools/playtest/run.mjs`; o jogo não foi tocado):

- **Um Chrome por run** (ou por sala multiplayer). Com 5 runs dividindo o mesmo Chrome, abas novas não carregavam e a virada de dia demorava mais de 30 s. Um controle sem nenhuma aba travada deu a mesma falha, e o problema sumiu com Chromes separados. As runs também ficaram ~2,5× mais rápidas (~28 s por dia de jogo, contra 60–94 s).
- **Depurador ligado desde a abertura da página.** Com a aba presa num laço, o `Debugger.enable` não responde, então ligá-lo só depois do tempo-limite nunca trazia a pilha (ou trazia a errada). Agora a pilha vem na hora e a aba presa é derrubada para liberar a máquina.
- **Fim de run no multiplayer.** Quando todos os jogadores são demitidos no mesmo dia, a sala termina como "fim da run". Antes, o orquestrador esperava o limite de dias e registrava "tempo esgotado".
- `tools/playtest/_hang.mjs` usa os mesmos passos do `run.mjs` (20 quadros/s com o jogador demitido).
- `npm run playtest` e `npm run playtest:repro` no `package.json`; `tools/playtest/out/` no `.gitignore`.

**Armadilhas para quem mexer na ferramenta:**

- Nunca rodar várias runs no mesmo Chrome: abas novas param de carregar. O `run.mjs` abre um Chrome por run de propósito.
- Ligar o depurador quando a página abre. Depois de um travamento, o `Debugger.enable` não responde mais.
- Uma pilha com um quadro só, o `requestAnimationFrame` do jogo, quer dizer "a página estava ocupada e voltou", não "travou aqui".
- Editar `bot.js` e `run.mjs` com um editor, nunca por script Python com heredoc: os `\n` viram quebras de linha reais e quebram o JS.
- Copiar sementes e números do JSON da run (`tools/playtest/out/<pasta>/runs/`), nunca recalcular de cabeça.

**Limites — leia antes de confiar nos números:**

- A nota de diversão é um **indicador feito de comportamento de robôs**. Ela aponta onde olhar; a confirmação vem de gente jogando.
- Os robôs **quase nunca conseguem um clutch** (2 em 369 dias; janela de 0,35 s) e **nunca se esconderam na cabine** (a navegação deles não entra no banheiro). Esses dois momentos ficaram praticamente sem teste.
- Às vezes o robô **come o lanche na frente do chefe**, o que infla um pouco as demissões dos perfis equilibrado e arriscado.
- **A semente não repete uma partida.** O jogo continua desenhando entre os passos do robô, e o desenho também gasta números aleatórios. A semente aproxima, mas não reproduz.
- O FPS foi medido num Chrome sem janela, com várias abas na mesma GPU. Serve para comparar, não como número final.
- Nada foi testado com a sala Steam.
