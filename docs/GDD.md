# BOSS KEY: Slack Off Together — GDD v1.1

> Substitui o GDD v1.0 (`BOSS_KEY_GDD_TDD.pdf`). Idioma: PT-BR. Documentos irmãos: [TDD.md](TDD.md) (técnica + roadmap), [ASSETS.md](ASSETS.md) (arte 3D e sons), [CHANGELOG_v1.1.md](CHANGELOG_v1.1.md) (o que mudou e por quê).

---

## 0. Como retomar (instrução para o Claude, e para quem abrir isto depois)

**Status (31/10/2026): v0.10 "Cota × Missão" implementada (§0.000: duas metas, missões com subtarefas, minigames, papo, vigilância, carreira); antes, v0.9 "Hitman de escritório" implementada (§0.00: missão grande + 2 pequenas, agenda do chefe, distrações, itens de missão, ritmo + crédito); antes, v0.8 implementada — etapas 1 a 3 (disfarce × exposição, hall com vendinhas e truques do chefe, clientes), multiplayer local e Steam, e uma bateria de testes automáticos (TDD §11, "Testes e ferramentas").** O que vale por cima de tudo está em §0.000, §0.00 e §0.0; o resto do documento é histórico onde §0.0/§0.1 o contradizem. O texto abaixo era a instrução de quando o projeto começou:

1. Leia, nesta ordem: este GDD inteiro, `TDD.md` (principalmente a seção **Roadmap**), `ASSETS.md`.
2. **Não refaça perguntas de design**: tudo que o usuário decidiu está aqui. Onde o documento diz "decisão minha, revisável", siga o texto e só mude se o usuário pedir.
3. Comece pela **Fase 0** do roadmap e siga a ordem. Cada fase tem "critério de pronto"; só avance quando passar.
4. Os números do jogo vivem **só** na seção 14 (Tabela mestra) e devem ser copiados para `shared/balance.ts`. Nunca espalhar números mágicos no código.
5. Ferramentas: navegador embutido (preview + screenshots + 2 abas para testar rede), Blender via MCP para os modelos (ver `ASSETS.md`), skills `threejs-*` para cena/luz/materiais/áudio/performance.
6. **Perguntar ao usuário antes de**: usar `generate_3d` (gasta crédito), instalar algo fora do stack do TDD, publicar/hospedar o servidor.
7. Marque o progresso no fim do `TDD.md` (checklist do roadmap).

---

## 0.000 v0.10 — "Cota × Missão" (vale por cima de tudo abaixo, inclusive §0.00)

Decidido com o usuário em 2026-10-31 (plano em `~/.claude/plans/preciso-ser-franco-e-melodic-kazoo.md`). Problema: no solo não dava para fazer a missão (o chefe saía ~10 s); o que funcionou foi a missão complexa (procurar a chave, esperar, roubar). **A decisão de cada momento agora é "trabalho agora ou missão agora?".** Números em `src/balance.ts` (`AGENDA`, `SOLO`, `PAUTA`, `PAPO`, `COAT`, `INTRO`, `SURV`, `MISSIONS`, `CAREER`).

**Duas metas, cada uma custa vida.**
- A **cota de trabalho** é obrigatória: a fixa do PC (planilha de ritmo, totais, e-mails, slides ou **triagem**) mais uma pauta de 1–2 tarefas andando (**arquivar pastas**, **xerox em lote**, **entregar na mesa do chefe**).
- A **meta de FUN** é feita com a missão grande (70%), as 2 pequenas e as diversões.
- O 1º dia continua sem custar vida.

**Missão grande com subtarefas** (painel "MISSÕES DE HOJE": ✓ feita · ▸ agora · ○ depois). Sete missões em três famílias. O sorteio não repete a família de ontem e só usa as desbloqueadas pela **carreira**.
- *Roubo*:
  - grampeador: chave extra → escrivaninha → esconder na sua mesa;
  - aquário;
  - salgadinho: moedas → descer de elevador em pleno expediente → balcão do térreo → subir → comer na mesa;
  - papel de parede: senha → PC do chefe, que mostra um meme.
- *Farra*: **campeonato de Ball Ops**. É uma arena todos contra todos no app de tiro (PvP no multi, com bots completando). Os abates do time contam só com a tela aberta.
- *Escritório*:
  - adiantar o relógio: banquinho → relógio → ponteiros → devolver. O dia acaba 30 s antes;
  - colar 4 pôsteres: minigame difícil; largado no meio fica torto, e o chefe acha.

**Minigames rápidos** (`src/ui/Minigame.ts`), estilo Among Us. Segurar E acabou (só a fofoca, que é conversa). Toda ação de tarefa, missão e distração abre um painel no centro da tela: fios, revirar, fechadura, código, arrastar, ritmo, sintonizar, discar, alavanca, balcão, ponteiros, pôster, comer. Você fica parado e meio cego (o som continua); **Q** sai sem progresso. Perseguido, o painel fecha.

**Agenda com ausência longa:** todo dia o chefe sai do andar pelo elevador. Almoço fora dura 80 s e a reunião no 11º, 55 s; os dois encurtam 5 s por dia até 45 s. No **solo** a ausência ganha +25 s e a cota é ×0,75. Essa é a janela do assalto. Fora do andar ele não vê nem persegue ninguém. As distrações ficaram mais fortes: a impressora prende o chefe 22 s e o rádio, 10 s.

**Papo com o chefe** (substitui o Crédito; T e V saíram):
- Cada tarefa de trabalho feita põe 8 s no seu banco (até 40 s). São 4 acertos de ritmo, uma rodada no app, um lote ou uma entrega.
- **E perto do chefe** puxa conversa: ele para, **virado para você** (quem está atrás dele fica livre). Na sala dele, não sai.
- O papo acaba quando o banco esvazia ou quando você se afasta.

**Casaco na cadeira:** pegue no cabideiro e pendure na sua cadeira. Por 60 s a mesa parece ocupada (o chefe não estranha a mesa vazia).

**Vigilância** (um equipamento por dia, sempre visível e com contra-ataque):
- **Dia 2: câmera semáforo.** Cone no chão que varre o salão: verde, depois amarelo piscando 1,2 s, depois vermelho por 5 s. Exposto ou com item da missão no vermelho = Suspeita; com item, o chefe vem ver. Contra: a fita.
- **Dia 3: sensor na porta.** Entrar com ele ligado faz o chefe voltar de onde estiver. Contra: fios no painel da porta (desliga por 60 s).
- **Dia 4: sala trancada.** Um código de 4 dígitos está escondido em 1 de 3 lugares e vira uma subtarefa a mais. Entregar um documento na mesa do chefe deixa entrar e revela o código.
- Os **truques** antigos entram do dia 5 em diante.

**Introdução gradual:**

| Dia | O que entra |
|---|---|
| 1 | cota + grampeador |
| 2 | papo e câmera |
| 3 | distrações e sensor |
| 4 | sala trancada |
| 5 | missões de qualquer família (antes: grampeador, relógio, aquário) |

**Carreira** (`src/game/Career.ts`, salva à parte): 1 XP por dia sobrevivido e 1 por missão grande. De início: grampeador, relógio e campeonato. Desbloqueiam aquário (3), pôsteres (6), salgadinho (10) e papel de parede (15).

**Robôs (31/10):** runs de 5–8 dias (a meta era 5–7). A maior causa de vida perdida é "pego na farra".

**Decisões minhas, revisáveis:**
- os números acima;
- quais ações viram qual minigame;
- o lote de pastas vem das caixas do canto oeste;
- as ações na sua mesa (moedas, rolo, esconder, comer, casaco) perdem para "sentar" quando você olha o monitor;
- o código da porta fica no painel da porta, junto com o sensor;
- a entrega revela o código.

**Ainda não feito:** itens portáteis de distração na loja; o 11º andar (depois do teste com pessoas).

---

## 0.00 v0.9 — "Hitman de escritório" (vale por cima de tudo abaixo, inclusive §0.0 e §0.1)

Decidido com o usuário em 2026-10-30/31 (plano em `~/.claude/plans/preciso-ser-franco-e-melodic-kazoo.md`). Problema: as tarefas não divertiam nem exigiam pensar, e o jogador só esperava o chefe agir para reagir — a iniciativa era do chefe. **Agora o jogador cria a brecha.** A decisão de cada momento é *quando e como me exponho para avançar a missão*. Números: `src/balance.ts` (`AGENDA`, `DISTRACT`, `ITEMS`, `MISSIONS`, `MISSION_SMALL`, `SMALL_DAY`, `CREDIT`).

**O dia (5 min).** 1 **missão grande** (do time, no multi) + 2 **pequenas** (de cada um). A meta de FUN continua (não bater = perde 1 vida); a grande paga 70% da meta (dividido pelo time), as pequenas pagam 5 FUN + 3 de vale cada, e as diversões/jogos do PC (todos liberados) completam. O cartão de objetivo mostra a etapa atual da grande; o painel "MISSÕES DE HOJE" lista grande, pequenas e o crédito.

**Missões grandes (1ª fatia; o banco cresce depois do teste com pessoas).** Sorteio do host (semente do dia); o 1º dia é sempre o grampeador.
- *Grampeador de ouro* (3 etapas): achar a chave (3 lugares sorteados entre 4 — casaco do cabideiro, caixas do canto, geladeira da copa, lixeira da impressora — revistar leva 1,6 s, à toa) → abrir a gaveta na sala do chefe (3 s, faz barulhinho, o grampeador vai para a mão) → guardar no armário sorteado (1 de 4, numerados).
- *Aquário a dois* (2 etapas): pegar na sala do chefe → colocar na bancada da copa. A dois (uma alça cada, presos por uma mola: 1,3 m; passou de 3,2 m alguém solta) anda a 62% e só chacoalha nos trancos; sozinho, 38% e chacoalha sempre. Chacoalhar demais = SPLASH (barulho e poça que o chefe nota).

**Itens de missão (o host decide).** E pega · **Q larga** · **botão direito passa** (carrega e solta como a bolinha; um colega perto da trajetória pega no ar) · armário guarda/pega. Mãos ocupadas: não senta nem pula. **Visto com o item na mão: "O QUE É ISSO?!" e perseguição** — passe, largue ou se esconda no banheiro; pego = demissão e o item volta (o grampeador para a gaveta, a missão volta uma etapa; a chave achada continua achada). Largado fora do lugar e visto pelo chefe: volta para o lugar e quem segurou por último leva Suspeita.

**Agenda do chefe.** 3 compromissos no 1º dia, +1 a cada 2 dias (máx. 5), com hora: ronda, café, almoço, buscar impressão, telefonema (fica na sala), reunião com cliente (os clientes chegam na hora marcada). Sempre uma ronda e uma pausa. Do 3º dia em diante um vem **rasurado** (nunca a ronda). Fica no **quadro ao lado da sala do chefe** (o próximo destacado); segurar E lá **anota** (vai para o TAB). O dado da ronda "por relógio" ficou 0,35× e não sai 20 s antes de um compromisso; o instinto (barulho) continua punindo. Ocupado na hora, o chefe cumpre atrasado.

**Distrações do mapa.** Impressora (trava de propósito: puxa o chefe; recarga 70 s) · rádio da copa (18 s de música; 55 s) · viva-voz da mesa de reunião (= ramal: na sala ele não sai, fora para; 60 s) · alarme de incêndio (1× por dia, 20 s: o chefe e os colegas vão para o hall do elevador e ele depois passa nas mesas). Acionar faz barulho ali; visto acionando = Suspeita.

**Trabalho com habilidade + Crédito.** A planilha de **ritmo** voltou (F na batida a cada 2 s, ±0,18 s, PERFEITO, combo; cota 12 acertos); os totais/e-mails/slides seguem no app Trabalho. Trabalho não dá FUN: enche o **🪙 Crédito com o chefe** (≈9 acertos ou 3 rodadas = 1 ficha, até 3). Errar o ritmo dá +1,5 de Suspeita. Sentado: **T** gasta 1 ficha e o chefe passa uma tarefa na hora (a **licença para andar**: com tarefa ativa você está disfarçado em pé) · **V** gasta 1 e desconta 8 de Suspeita. O telefone **não toca mais sozinho**.

**Pequenas (2 por pessoa, sorteadas):** 3 cestas, bolinha no chefe, assustar os pombos, soneca, Pesca Zen, máquina de lanche, corrida de cadeira e **post-it na cadeira do chefe** (nova, dentro da sala dele).

**Decisões minhas, revisáveis no playtest:** teclas Q/botão direito/T/V; os números acima; o aquário sozinho é "lento e barulhento" em vez do carrinho do plano (mesmo papel, sem objeto novo); ler a agenda conta como à toa; o grampeador substitui a rosquinha (o "Faro de assalto" agora soma +10 na missão grande); crédito zera a cada dia; itens portáteis de distração na loja ainda **não** foram feitos.

**Testes:** `npm run playtest:missions` (agenda, distrações, grampeador, flagrante, passe, aquário, crédito + prints), `mp-test.html` (agenda e missão iguais para todos, convidado pega/larga o item, distração do convidado), invariantes novos em `tests/balance.test.ts`.

---

## 0.0 v0.8 — "Se divertir disfarçado" (vale por cima de tudo abaixo, inclusive §0.1)

Decidido com o usuário em 2026-10-30 (plano em `~/.claude/plans/o-jogo-tem-um-cozy-hickey.md`). Problemas que motivaram: trabalho e diversão eram o mesmo minigame; ver o chefe exigia virar 180°; a Suspeita subia sem causa visível; a "dança" virava reflexo de apertar ESPAÇO quando a porta abria.

**O loop (pilar nº 1).** Você está sempre **disfarçado** ou **exposto** (ícone acima da barra de Suspeita):
- *Disfarçado*: sentado na tela de trabalho, ou com uma tarefa do chefe ativa / item dele na mão (ela é a sua **licença para andar** pelo escritório). O chefe não estranha.
- *Exposto*: qualquer diversão (PC, sofá, cesta, fofoca, corrida, lanche) ou estar dentro da sala do chefe. **Todo FUN vem do tempo exposto.**
- *À toa*: em pé sem motivo — o chefe estranha ("passeando à toa").
- O stealth é **se divertir sem ser pego**. O chefe faz ronda normal (sem marcadores); você o acompanha com os olhos e os passos.

**Trabalho = imposto.** Não paga nada (nem FUN, nem Vale); só protege. Visual das apps mantido (o jogador se reconhece nele). Mecânica sem habilidade: planilha = segurar F preenche célula a célula (cota em linhas); reunião = assentir (F) quando o chefe olha, com 2 s de folga. Entrega de trabalho = carimbo seco, sem confete nem moeda.

**Diversão = risco.** As diversões fora do PC valem todo dia (as sorteadas só pagam Vale a mais); no PC só abre o jogo que é a tarefa do dia — se a grande for soneca ou cadeira, o PC fica sem jogo. O PC rende pouco; as excursões rendem muito; **juntos rende mais** (+50% por colega por perto, fora da mesa) e **faz mais barulho** (+50% de raio por colega). **Assalto**: com o chefe fora, a sala dele abre; a rosquinha na mesa vale +15 FUN; ser visto lá dentro (ou ele voltar) = demissão.

**Suspeita sempre explicada.** Nada sobe sozinho com o tempo. Toda subida mostra "+N 👁 motivo" no mundo (onde aconteceu) e numa lista embaixo da barra. Cota fixa não fechada: o chefe cobra na manhã seguinte (+15 × curva), na tela.

**Meta de FUN + 3 vidas.** Meta do dia `funGoal(dia) = 22 + 5·dia` (multi: × 0,8 × jogadores, do time). Perde 1 vida: demissão (o dia acaba na hora; volta sem Suspeita) ou meta não batida ("ENTEDIADO"). O 1º dia não gasta vida. Multi: o host conta as vidas de cada um; sem vidas = espectador até o fim da run.

**Visão.** As mesas ficam soltas, em arco em volta da porta do chefe, giradas para a porta aparecer a 40° do centro do monitor (fora do monitor, dentro da visão). Teste: `visionTest()` no `?debug`.

**Etapa 2 — o dia como roguelike (implementada em 2026-10-30, "pode fazer tudo"; itens e números decididos por mim, revisáveis):**
- **Hall de entrada (térreo):** fica ao norte do prédio, fora da vista do escritório (`Office.buildLobby`, `LOBBY_DZ = −40`). Manhã: você entra pela porta da rua e anda até o elevador; quem manda hoje espera dentro da cabine. A porta fecha e você "sobe" (teleporte com o mesmo deslocamento) para o elevador de cima, onde o chefe passa o **briefing todo dia** (evento, meta, truque novo, cota de ontem, prêmio da mesa dele; elevador de 19 s, ESPAÇO pula do 2º dia em diante). Noite (18:00): o elevador desce, o hall tem **três vendinhas** (banca, café, camelô) com 5 vitrines; a **porta da rua** (segurar E) leva ao relatório. Demitido também desce para comprar; fim da run vai direto ao relatório final.
- **Loja:** 5 ofertas por noite sorteadas (peso por item, semente da run — no multi é a mesma para todos), itens **empilham** até `max`, cada cópia custa ×1,5. Estilos e itens (`SHOP` em `balance.ts`):
  - *Contra o chefe:* dobradiça (+2 s de aviso), planta (identifica ×1,5), post-it (1×/dia pula sua mesa), ramal falso (R sentado: na sala ele não sai por 25 s; fora para 8 s), tapete (+1,5 s de aviso), fita na lente (cega a câmera), panfleto (+1 cliente/dia).
  - *Furtivo:* pantufas (barulho ×0,5, até ¼), monte maior (+4 bolinhas).
  - *Álibi:* retrovisor, atalho de pânico (+0,3 s de CLUTCH), prancheta (nunca "à toa"), segunda tela (1×/dia salva um flagrante de tela).
  - *Ganância:* cupom (1×/dia: FUN ×2 por 20 s na 1ª diversão longe da mesa), faro de assalto (+10 no prêmio), energético (trabalho 30% mais rápido).
  - *Raro:* atestado (+1 vida).
- **Truques do chefe** (um novo por dia a partir do 2º, acumulam; `TRICKS`): ouvido apurado (audição ×1,5) → pantufas; porta lubrificada (−2 s de aviso, porta mais baixa; o aviso total nunca fica abaixo de 6 s, `B.MIN_WARN`) → dobradiça; câmera na copa (grava 6 s / pausa 7 s, luz vermelha; exposto na copa enquanto grava = Suspeita "câmera da copa gravou") → fita; volta rápida (40% de sair de novo 4 s depois de voltar) → ramal; olho de águia (identifica ×0,7) → planta; sapato macio (passos ×0,35) → retrovisor; estagiário (o X9 ronda junto) → post-it.
- **Prêmio do assalto** muda por dia (rosquinha, bombom, cupcake, macaron) e é anunciado no elevador.
- **Multi:** cofre único do time (o host soma o Vale, valida as compras e manda o estado; `shop`/`buy`/`vale`/`bought` no protocolo). Demitido (com vidas) volta como **visita**: anda pelo escritório, `E` perto do chefe puxa conversa (ele para 6 s, recarga 25 s), `F` avisa a sala. Sem vidas = fantasma até o fim da run.

**Etapa 3 — clientes (implementada):** 1 por dia (+1 por panfleto, até 3). Sobem pelo elevador do escritório, vão até a porta do chefe (esperam ali se ele estiver em ronda), entram e ficam 22–34 s em reunião: **enquanto isso o chefe não sai** (o estagiário, se houver, sim). Da mesa você vê o cliente entrar e sair pela porta. Só o host simula; os convidados veem o cliente pelo snapshot (posição, direção e visual, desde 30/10).

---

## 0.1 v0.6 — Run infinita (vale por cima de §5, §6, §7, §9, §13.1, §14.2, §14.4 e §14.6)

Decidido com o usuário em 2026-10-28. Onde o resto do documento contradiz esta seção, vale esta. Números: `src/balance.ts` (blocos `RUN`, `TASKS`, `FIXED`, `FUN_TASKS`, `EVENTS`).

**Pilares do loop:** risco por recompensa (o placar é FUN, e FUN só se faz arriscando) · trabalho é ferramenta de furtividade, não punição · cada dia é um quebra-cabeça novo (sorteio) · a derrota é legível (resumo de onde veio a Suspeita).

**Dia e run**
- Dias ilimitados de **180 s**. Tempos escritos para o dia de 300 s escalam ×0,6.
- 1º dia: sempre o **chefe**, com o tutorial no elevador. O chefe fica mais atento a cada dia: além da curva, ronda mais, anda mais rápido e identifica mais rápido (degraus nos dias 5 e 10).
- **Dia de X9:** do dia 2 em diante, "Ronda do X9" entra no sorteio do evento do dia com o mesmo peso dos outros (nunca dois dias seguidos, como todo evento). Quando sai, o X9 manda no dia no lugar do chefe (que fica na sala e só liga): rondas normais e, na hora do evento, a ronda longa pelo salão. Ele é mais lento (1,8 m/s + 0,04 por dia, até 2,4) e confere rápido (2 s), mas a identificação e o ritmo das rondas seguem a curva do dia (`x9Day`). Vale igual no multiplayer.
- **Curva:** toda Suspeita do dia × **1,15^(dia−1)** (tarefas esperando, chefe vendo, erro, fixa sem cota, tédio) — e o alívio das entregas também (tarefa e café na bandeja). A **passiva** cresce mais devagar: × **1,06^(dia−1)**.
- Demitido: só **metade** do FUN de hoje entra no placar (`firedKeepFun`) e você volta no dia seguinte com **30** de Suspeita.
- **Fim da run:** solo, na **3ª demissão** (a do 1º dia, o dia de aprender, não conta; as vidas aparecem no relatório do dia); multi, todos demitidos no mesmo dia. Placar = **FUN somado** ao longo dos dias.
- Elevador: painel com a fixa, o evento e as diversões do dia; **L** abre a lojinha (no solo o elevador espera).

**Suspeita (individual, passa de um dia para o outro)**
- Sobe com: o tempo (+0,18/s), **tarefa do chefe esperando** e **o chefe ver ou ouvir algo errado** (passear sem álibi, flagrante, perseguição que escapou, jogo aberto na mesa vazia, migalhas/poça/bolinha na vistoria, esbarrão, faltar à reunião surpresa, despistar no banheiro) e trabalho errado.
- Não sobe mais com: calor (removido), câmera fixa (removida), atividade em si (diversão só gera ruído e instinto — o chefe precisa perceber).
- Removidos: barra do time e inspeção geral. Mantidos: rondas, flagrante físico, perseguição, demissão em 100.
- Baixa com: tarefa do chefe entregue (−8 × curva), café solto na bandeja (−5 × curva), herói da impressora/disjuntor (−10) e −10 no fim do dia.
- **Arriscar compensa:** FUN ganho com uma chefia fora da sala (e sem estar na pausa) vale **×1,25** (`RISK_FUN_MUL`); a faixa "O CHEFE SAIU DA SALA" avisa.
- A rampa de uma tarefa **para enquanto você a executa** (na reunião, com o item da tarefa na mão, escolhendo o café do chefe).
- Fim do dia: fixa sem cota soma +15 e cada diversão do dia que faltou soma +5 (tédio), tudo × curva, para o dia seguinte. O que sobra do dia e a fixa param em **70**; o tédio soma por cima, até **85** (passar o dia parado também é risco).
- Álibi para andar: tarefa do chefe em andamento, algo na mão ou reunião surpresa convocada.

**Trabalho**
- **Fixa do dia** (sempre ativa, sorteada): planilha de ritmo (12 acertos), totais (3 rodadas), e-mails (3), slides (2 apresentações). Não sobe Suspeita enquanto pendente; só pune no fim do dia.
- **1 aleatória por dia** do pool (relatório, assinatura, galão, impressora, café do chefe, reunião): o telefone toca uma vez só e **só enquanto você se diverte** (chance por segundo `0,08 × Pressão`, ver 5.5), e a tarefa não volta depois de entregue. Sem diversão, sem ligação. **Sem prazo**: 5 s de folga quando toca e de novo ao atender; depois a Suspeita sobe numa rampa que acelera (`0,5 × (1 + t/20)`, até ×4, × curva).
- Multi: quem é demitido passa as tarefas pendentes para os colegas vivos (rodízio), que recebem como "tarefa extra" (não se repete).

**Diversão**
- Por jogador, sorteada por dia: **1 grande** (Ball Ops, Pesca Zen, ClipClop, soneca, corrida de cadeira) **+ 3 pequenas** (lanche na mesa, máquina de lanche, fofoca, 3 cestas, bolinha num colega, assustar os pombos, bolinha no chefe sem ele ver). **Só elas ficam liberadas**; o resto mostra "não é diversão de hoje".
- Grandes concluem ao juntar FUN na atividade (6–9); pequenas por uso. O FUN de cada atividade continua dependendo do desempenho (abates, peixes, distância da cesta…).
- **Vale-Diversão** só vem das diversões do dia (grande 6, pequena 2). Itens da loja valem até o fim da run.
- Pizza e bolo são bônus de evento, fora do sorteio. CLUTCH continua dando FUN.

**Eventos** — 1 sorteado por dia (pode tocar uma 2ª vez; a chance cresce com os dias, até 60%), desde o dia 1, sem repetir o de ontem:
boas-vindas (chefia passa em todas as mesas) · impressora travada · auditoria · blecaute (com tempestade e lanterna) · pizza (Dono julga 40 s depois) · **internet caiu** (25 s com os jogos do PC offline; o chefe sai para ver quem trabalha) · **reunião surpresa** (15 s para chegar à mesa de reunião; quem falta leva +10 × curva) · **aniversário** (bolo: +4 FUN por fatia, mas deixa migalhas na mesa).

**Multi:** o fantasma vê as chefias através das paredes e aperta **F** para avisar a sala onde o chefe está.

---

## 1. High concept

**Você não trabalha, você finge que trabalha — e se for pego, culpa seu amigo.**

Um escritório 3D cheio de bolas com olhos. Cada jogador é um funcionário que quer enrolar o dia inteiro (jogar, assistir vídeo, comer, andar de cadeira) sem o chefe perceber. O chefe sai da sala em rondas; você ouve a porta e os passos, esconde a tela no último segundo e segue enrolando. Em grupo, a Suspeita é compartilhada: um vacilo contamina todos. No outro modo, os times tentam **incriminar** o time rival.

- **Gênero:** stealth social de escritório / comédia física, multiplayer (2-6) + treino solo com bots.
- **Plataforma:** navegador (desktop, mouse+teclado). Link compartilhável, sem instalação.
- **Duração:** uma semana (5 dias) ≈ 25 min. Dia ≈ 5 min.
- **Tom:** paródia, humor físico, sem marca real, classificação livre. Sem gambling real (paródias apenas).
- **Áudio:** **tem** áudio (SFX, ambiente, música leve), é parte da mecânica. **Não tem chat de voz.**

## 2. Pilares

1. **Clutch legível em 3 segundos.** Joga escondido → ouve a porta/passo → ALT-TAB no limite → o chefe passa. Qualquer clipe de 5s explica o jogo.
2. **Enrolar é um recurso finito.** Toda fonte de FUN tem estoque limitado e um custo (barulho, brilho, visão de túnel, bagunça, posição). Nenhuma atividade é "a melhor sempre"; o jogador alterna.
3. **Aviso sempre justo.** O jogador sempre tem ≥ 6-8 s de aviso sonoro antes de uma ronda. Morrer deve parecer "eu vacilei", nunca "o jogo me enganou".
4. **Traição social.** FUN é individual; Suspeita é do grupo. No modo Traição, a graça é armar o rival.
5. **Física tosca intencional.** Café que derrama, bolinhas de papel, cadeira de rodinha. A comédia vem da física e da atuação dos olhos, não de cutscene.

## 3. Público e referências

- **Público:** 16-28 anos, grupos de amigos no Discord, fãs de PEAK, R.E.P.O., Lethal Company, Among Us.
- **Referências:** R.E.P.O. (bola-robô com olho que atua tudo), PEAK (legibilidade + gritaria co-op), Among Us (traição social), jogos de "esconder a tela do chefe" (provaram demanda, mas são genéricos e solo).
- **Diferencial:** esconder-se **jogando** (ALT-TAB cronometrado por som), com estoque de enrolação, em grupo, com modo de traição.

---

## 4. Modos de jogo

| Modo | Jogadores | Objetivo | Derrota |
|---|---|---|---|
| **Coop** | 2-6 | Todos contra o chefe: sobreviver à semana (Seg-Sex) com **menos de 3 advertências**. | 3 advertências |
| **Traição** | 1x1, 2x2, 3x3 (2/4/6) | Dois times; ganha o time com mais **pontos de culpa** ao fim da sexta (incriminar o time rival, sem deixar de enrolar). | — (vence quem tiver mais pontos) |
| **Solo (treino)** | 1 humano + 2-3 bots | Treino com as regras do Coop **ou** do Traição contra bots. Cabines sobrando ficam vazias. | igual ao modo escolhido |

**Mesmo mapa e mesmo chefe nos dois modos.** O Coop desliga as sabotagens (seção 11); o Traição liga tudo.

### 4.1 Coop em detalhe
> **v0.5 (implementado):** sala Steam de até 6 jogadores, sem bots; o lobby é o próprio elevador (PRONTO no botão, contagem de 5 s). Suspeita e demissão são **individuais**; o demitido vira fantasma e assiste até as 18h; ranking de FUN no fim do dia. Progresso e loja continuam locais em cada PC.

- Suspeita **do time** (uma só barra para todos).
- Pego pelo chefe = **demitido só naquele dia**: vira **fantasma** (seção 11.4), volta no dia seguinte.
- Se **todos** forem demitidos no mesmo dia: o dia termina na hora e o time recebe **1 advertência**. O dia **não reinicia**; a semana segue para o próximo dia.
- 3 advertências = fim da semana ("demissão em massa").
- Vitória: chegar ao fim da sexta com < 3 advertências. Bônus de ranking: zero demitidos na semana, nº de clutches.

### 4.2 Traição em detalhe
- Cada **time tem sua própria barra de Suspeita** (o chefe é um só e atende os dois).
- **Pontos de culpa** (seção 12): ganha quem causar a demissão de um rival.
- No fim de cada dia, o time com **menos FUN total** perde 10 pontos (não dá para só sabotar).
- Sexta: **Julgamento** (o Dono revê as maiores armações em câmera lenta; time com mais culpas confirmadas na semana ganha +20 pontos).
- Vence quem tiver mais pontos ao fim da sexta. Empate: time com mais clutches; persistindo, empate.

### 4.3 Solo (treino) em detalhe
- 2-3 bots completam as cabines; todas as regras valem.
- **Bots** seguem uma rotina simples: 70% do tempo na planilha, 30% em atividades (sorteadas dentro do estoque). Reagem à porta do chefe após 1,5-3 s e **falham em 15%** das rondas (podem ser demitidos). No treino de Traição, os bots podem ser incriminados com as mesmas ações.
- Tutorial embutido na **segunda-feira** (dicas em sequência, desligável nas opções). No elevador, o **chefe** entra na cabine e dá o tutorial em 5 falas curtas (~12 s) só no papel de chefe: aqui se trabalha, sente na mesa, atenda o telefone, TAB para ajuda. Ele não menciona FUN nem Suspeita (o jogador descobre sozinho). Depois volta andando para a sala dele.

---

## 5. Os dois medidores (e um oculto)

### 5.1 FUN (individual, 0-100, visível)
- É o seu "ganho". Sobe enrolando; **nunca desce** dentro do dia; **zera no início de cada dia**.
- Tem uma **meta por dia** (tabela mestra, seção 14). Excedente vira pontos de ranking.
- Meta de FUN já batida conta mesmo se você for demitido depois.

### 5.2 Suspeita (visível)
- **Individual (0-100):** o que você faz de errado. Aparece como uma barrinha logo abaixo do rótulo de Suspeita.
- **Do time (0-100):** `SUS_TIME = 0,6 × média + 0,4 × maior`, considerando os jogadores não demitidos. Aparece como o rótulo "SUSPEITA DO CHEFE %" no topo da tela (fica vermelho acima de 75%).
- **Sobe com:** atividade proibida (taxa por atividade), estar em pé no cone do chefe (+6/s; o cone só existe enquanto o chefe está **fora da sala**, em ronda), calor alto (+1/s extra), bagunça flagrada, relatório atrasado, sabotagem recebida (Traição).
- **Desce com:** planilha no ritmo (−2,5/s), café entregue (−20 para quem entrega, −8 para os demais), relatório entregue (−10), repouso sentado sem atividade (−0,3/s), clutch perfeito (−10).
- **Suspeita individual = 100 → "flagrante"**: o chefe vem direto (porta + ≥ 8 s de aviso) e demite quem estiver nesse nível; se você baixar a Suspeita abaixo de 100 antes de ele chegar, ele dá meia-volta ("falso alarme").
- **Suspeita do time = 100 → "inspeção geral"**: o chefe visita todas as mesas; quem tiver janela proibida aberta **ou** Suspeita individual > 50 é demitido. Depois a Suspeita do time cai para 40.

### 5.3 Calor (oculto, por jogador)
- Não existe barra. A bola **esquenta** com atividades pesadas; acima de 60 aparece um anel vermelho + **ventilador (cooler) audível**, e a audição do chefe sobe ×1,5.
- Sobe com tiro, cadeira, vídeo sem fone, pescaria; desce com planilha e repouso (taxas na seção 14).

### 5.4 Instinto do chefe (oculto, global)
- O chefe acumula **Instinto** a partir do que todos fazem (cada atividade tem um peso por segundo, seção 14). Ao atingir **120** e se já passou o **intervalo mínimo** desde a última ronda, ele **sai da sala para uma ronda**. O jogador não vê o número.
- Além do Instinto, há uma **ronda de relógio** sorteada: chance por segundo `Pressão / X` (X varia por dia; com Pressão 1 sai em média a cada X s), para que jogar "certinho" também seja checado.

### 5.5 Pressão e calmaria (v0.7)
- **Calmaria** depois do elevador: **60 s no 1º dia, 20 s nos outros**. Nada sai da sala, o telefone não toca, nenhum evento dispara e o Instinto não acumula (nem o dos colegas).
- **Pressão** (0–1, oculta) decide a chance de tudo o mais: tempo do dia (sozinho chega só a **0,5**) + FUN de hoje (até **+0,35** com 60 FUN) + **+0,15** enquanto você se diverte (ou até 3 s depois de ganhar FUN). Quem fica parado tem um dia lento; quem se diverte atrai a chefia.
- **Ronda de relógio** e **evento do dia** viram chance × Pressão; o evento anunciado no elevador acontece de qualquer jeito até **85% do dia**. A 2ª vez do evento só vem depois da 1ª.
- **Telefone:** só toca durante uma diversão, com a Pressão do próprio jogador.
- **Multi:** ronda e eventos usam a **maior** Pressão entre os jogadores; o telefone, a de cada um.

---

## 6. O dia de trabalho (5 min = 300 s)

| Fase | Tempo | Descrição |
|---|---|---|
| **Manhã** | 0-90 s | Chefe mais lento, rondas espaçadas. Hora de se ajeitar, pegar café, escolher tática. |
| **Meio-dia** | 90-180 s | **Evento do dia** (seção 9). Muda as regras e cria caos. |
| **Tarde** | 180-300 s | Rondas mais frequentes; a meta aperta. |

- O dia termina quando o relógio chega a 300 s **ou** quando todos estão demitidos (no Coop = advertência).
- Ao final: **Relatório do dia** (FUN por jogador, pico de Suspeita, clutches, demissões, culpas) + **replay do melhor momento** (8 s, câmera lenta).

### 6.1 Tédio (meta de FUN não batida)
No dia seguinte o jogador começa com **+15 de Suspeita individual** e fica mais barulhento (suspira e bate o pé a cada 20 s: som com 3 m de raio). No Traição, o time com menos FUN também perde pontos (seção 4.2).

---

## 7. A semana

| Dia | Chefe | Meta de FUN | Atividades liberadas | Evento do meio-dia | Novidade |
|---|---|---|---|---|---|
| **Seg** | **Estagiário X9** (lento, grita) | 40 | Tiro, lanche, basquete | **Boas-vindas**: reunião de 25 s na mesa central | Tutorial embutido; X9 **grita** (som global) quando fica Suspeito; perdoa mais |
| **Ter** | **Chefe** | 55 | + Pescaria, vídeos | **Impressora trava** (alarme alto atrai o chefe por 15 s) | **Relatórios** (2) |
| **Qua** | Chefe | 65 | + Cadeira | **Auditoria**: chefe inspeciona uma mesa por vez em ordem visível num quadro; só pescaria é permitida | **Câmera fixa** no corredor da sala do chefe; relatórios (3) |
| **Qui** | Chefe com **lanterna** | 75 | + Fofoca | **Blecaute**: luz apaga; telas brilham; o disjuntor fica na cozinha | Café intermitente (5 s ligado / 10 s desligado); relatórios (3) |
| **Sex** | Chefe + **o Dono** | 85 | Tudo (+ roubar lanche no Traição) | **Pizza de sexta** na cozinha | O Dono não faz barulho de passo (só tilintar de chaves + sombra); relatórios (4); Julgamento (Traição) |

Parâmetros exatos do chefe por dia: seção 14.

---

## 8. Controles (PC)

| Ação | Tecla |
|---|---|
| Andar | WASD (SHIFT = com cuidado, sem derramar o café) |
| Olhar | Mouse (câmera em 1ª pessoa) |
| Interagir / levantar | E (ou clique) |
| Sentar no seu PC | Clique no monitor (com algo na mão, o item fica na mesa e volta ao levantar) |
| Usar / clicar na janela | Botão esquerdo |
| Arremessar bolinha de papel | Botão direito (segure e solte) |
| **ALT-TAB** (alterna janela proibida ↔ planilha) | Espaço (em pé: pulinho) |
| Planilha no ritmo / concordar na reunião | F |
| Atender o telefone | T ou clique no telefone |
| Lanche / limpar migalhas | G / C (segure) |
| **Girar na cadeira** (olhar livre enquanto sentado; a mira é o cursor da tela) | Mouse |
| Fones de ouvido (vídeos) | H |
| Fantasma: acelerar o tempo ×6 (solo) / avisar a sala onde o chefe está (multi) | ENTER / F |
| Ajuda (segure) | Tab |
| Menu / opções (não pausa no multiplayer) | Esc ou P |
| Fechar o painel do café do chefe | Q |

- Sentado, a câmera encaixa no **monitor** (visão frontal da tela) e o cursor é a **mira no centro da vista**, com o mouse mais fino para acertar botões. Mexendo o mouse você **gira na cadeira** como andando: ao tirar a mira do monitor a cabeça recua, a vista fica livre para a sala e a atividade **congela** (mas a janela continua visível para o chefe).
- Perder o foco da aba (Alt+Tab real do navegador): o jogo troca para a planilha por segurança, **sem** contar como clutch.
- Câmera 100% em 1ª pessoa (em pé, sentado, no banheiro, demitido); as patinhas e o rosto dos colegas fazem a atuação.
- Nos e-mails as letras são do texto: **segure E** (0,5 s) para levantar; tocar o E digita a letra.

---

## 9. Eventos do meio-dia (detalhe)

- **Seg — Boas-vindas:** todos (e bots) se reúnem em volta da mesa central por 25 s. Atividades pausadas. Você pode **cochichar** (+3 FUN, ruído 3 m); a cada 6 s o X9 "olha": quem estiver cochichando nesse instante ganha +15 de Suspeita.
- **Ter — Impressora trava:** alarme de 20 s (raio 15 m). O chefe vai até a impressora e fica 15 s antes de continuar. Qualquer jogador pode **destravar** (segurar E por 4 s) para encerrar o alarme: −10 de Suspeita para quem destrava (herói) e o chefe volta mais cedo.
- **Qua — Auditoria:** o chefe senta na mesa central e chama os jogadores **um por vez** (8 s cada), numa ordem exibida num quadro. Quem não é chamado volta à mesa mas só pode usar **pescaria** (silenciosa). Estar com outra janela aberta na hora da conferência = demitido.
- **Qui — Blecaute:** luzes se apagam por 90 s. As telas brilham e iluminam a bola de quem joga (denuncia de longe); o chefe usa lanterna (cone 30°, 14 m). **Religar o disjuntor** (cozinha, segurar E por 6 s) acaba o blecaute e dá −10 de Suspeita ao herói, que fica em pé e vulnerável.
- **Sex — Pizza de sexta:** 6 fatias na cozinha (compartilhadas). Cada fatia: +6 FUN, 2 s para comer, ruído 4 m, deixa uma caixa/bagunça. No fim do meio-dia, o Dono confere a cozinha: com ≥ 4 bagunças, **demite quem comeu mais fatias**.

---

## 10. O chefe

### 10.1 Máquina de estados
`Na sala` → `Porta` (som global) → `Ronda` → (`Suspeito` → `Investigar`) → `CheckScreen` → `Retorno`.

- **Na sala:** parado na mesa dele. Acumula Instinto. Ouvindo ruído alto (≥ 10 m de raio) ele pode sair.
- **Porta:** som da porta abrindo, **global**, ouvido em todo o salão. Depois o chefe fica 2-3 s no batente "olhando o salão" (olho Alert).
- **Ronda:** percorre o **anel** do salão e visita as **3 mesas** com maior contribuição recente (menos se houver menos jogadores). Também visita qualquer mesa com **bandeira**: relatório vencido, dedurada (Traição), bagunça.
- **Suspeito (2 s):** olhou para algo estranho (jogador em pé no cone, cooler alto, poça de café). **Investigar (6 s):** vai até a fonte do ruído/ponto estranho.
- **CheckScreen:** para **atrás** do jogador (≤ 1,8 m, dentro de um arco de ±30° das costas dele) e olha o monitor.
- **Retorno:** volta à sala (ou à próxima mesa da ronda).

### 10.2 Percepção
- **Visão:** cone 70°, alcance 12 m (10 m para quem está sentado). Raycast contra paredes e divisórias. A bola de um colega **bloqueia** a linha de visão ao monitor (corpo-bloqueio): o chefe espera 2 s e depois empurra o bloqueador (+8 de Suspeita nele).
- **Audição:** cada atividade/emote tem um raio de ruído (seção 14). Calor > 60 multiplica por ×1,5. Ruído ouvido = ponto de interesse (Suspeito → Investigar).
- **Fair play:** a porta soa **≥ 8 s** antes de o chefe chegar à primeira mesa (Seg 10 s; Qui 7 s; Sex 6 s). Se o caminho for curto, o chefe espera na porta. Passos têm som 3D posicional (direção e distância).

### 10.3 O momento do CheckScreen (regra única, sem ambiguidade)
1. O chefe **chega** atrás de você → olhos dele ficam Alert, passos param.
2. Após o tempo de identificação (**0,5 s**; X9: 0,8 s) ele **identifica** a janela ativa na sua tela.
3. Se for uma janela proibida → **demitido**. Se for planilha → seguro.
4. Ele fica ao todo **3 s** (X9: 2 s). **Reabrir** uma janela proibida durante isso = demitido na hora.
5. **Clutch perfeito:** se você trocou para a planilha **nos últimos 0,5 s antes da identificação** → +5 FUN, −10 Suspeita individual, popup "CLUTCH!", câmera lenta de 0,5 s (só visual local), candidato a replay. Trocar **antes** dessa janela = "salvou", sem bônus.
6. Há ainda 1 s de "franzir a testa" depois da identificação: um colega a ≤ 2 m pode **assumir a culpa** (Coop, seção 11.1).

### 10.4 Outras formas de ser pego
- **Flagrante físico:** atividade física proibida (cadeira, basquete, lanche) no cone do chefe por 1 s.
- **Suspeita individual = 100** ou **time = 100** (seção 5.2).
- **Auditoria / Pizza** (seção 9).

### 10.5 O Dono (sexta)
Esfera grande preta com gravata dourada e olhos pequenos luminosos. Sem som de passo: **tilintar de chaves** (som posicional, raio 12 m) e **sombra** que cresce 2 s antes de ele chegar. Faz 2 rondas fixas (≈ 120 s e 240 s), independentes do Instinto, e confere a cozinha na pizza. Mesmas regras de CheckScreen.

### 10.6 Câmera fixa (qua em diante)
Câmera de segurança no teto do corredor da sala do chefe. Jogar (atividade proibida com janela aberta) dentro do cone dela soma +5 de Suspeita/s. Vê a bola, não vê a tela.

---

## 11. Interações entre jogadores

### 11.1 Cooperação (Coop e Traição, dentro do mesmo time)
- **Ping (Q):** seta visível aos aliados apontando a posição do chefe/da ameaça.
- **Sons de comunicação (1-4):** tossir, pigarro, bater na mesa, assobiar. Aliados ouvem em 12 m. **O chefe também ouve** (raios: pigarro 4 m, tossir 6 m, mesa 8 m, assobio 10 m). Combinem códigos.
- **Corpo-bloqueio:** posicionar a bola entre o chefe e a tela do aliado.
- **Bolinha de papel (distração):** arremessar uma folha para um ponto; o ruído ao cair atrai o chefe por 4 s (se ele estiver a ≤ 8 m). Gasta uma folha do estoque de basquete.
- **Garçom do café:** quem leva o café entregou à **bandeja** na porta da sala do chefe reduz a Suspeita de todos (seção 5.2).
- **Sacrifício heroico (Coop):** na janela de 1 s depois da identificação, um aliado a ≤ 2 m aperta E e **assume a culpa**: ele é demitido no lugar. Ganha a **coroa dourada** cosmética e pontos de ranking.

### 11.2 Sabotagens (apenas no Traição; Coop as desliga)
Todas deixam um registro "causado por X" por **10 s** para a atribuição de culpa (seção 12).

| Ação | Como | Efeito no alvo | Limite |
|---|---|---|---|
| **Empurrar** | E perto do alvo | Empurra com física; em pé no cone dá +6/s de Suspeita | recarga 1,5 s |
| **Ligar o som do monitor** | Ficar na mesa dele, segurar E 2 s | Ruído de 8 m por 8 s | 3/dia, recarga 40 s |
| **Trocar a tela dele** | Na mesa dele, segurar E 3 s | Abre uma janela proibida congelada; se o chefe checar nos próximos 20 s → demitido | 2/dia |
| **Derramar café na mesa** | Levar café e usar E | +10 de Suspeita (uma vez) e uma poça (evidência) na mesa | 1 por café |
| **Puxar a cadeira** | Na mesa dele, E, com ele em pé | Cadeira some 4 s: ele não consegue sentar | 3/dia |
| **Desligar o cooler** | Na mesa dele, segurar E 2 s | Calor +20 imediato (cooler ruidoso) | 2/dia |
| **Dedurar** | Interagir com o telefone do chefe | O chefe visita a mesa do alvo na próxima ronda, com certeza. Se pego: +15 de culpa. Se o alvo estava limpo: **−10 de culpa e +20 de Suspeita para você** | 2/dia |
| **Roubar lanche** | Segurar E 2 s na gaveta do alvo | Você: +6 FUN. Alvo: perde 1 lanche do estoque | 1 por alvo/dia |

### 11.3 Cooperação entre times (Traição)
Os aliados do mesmo time continuam podendo usar tudo de 11.1. Sabotagens só valem contra o time adversário.

### 11.4 Fantasma (demitido no dia)
Bola translúcida (40%), atravessa o cenário, não é vista pelo chefe e não ganha FUN. Pode: **ping** (3/dia) e **distração sonora** (1/dia: ruído em ponto escolhido, a ≤ 10 m do chefe → ele investiga 4 s). Volta no dia seguinte.

---

## 12. Culpa (Traição)

- Quando o chefe demite um jogador do time X, olha-se o registro dos **últimos 10 s**: cada **jogador rival** que causou algo naquele alvo (sabotagem, dedurada, empurrão) ganha **+10 de culpa** para o time dele (máx. +20 por demissão, divididos se houver mais de um autor).
- Dedurada certeira: **+15**. Dedurada em alvo limpo: **−10**.
- **Julgamento (sexta):** o Dono revê as 3 maiores incriminações da semana. Cada culpa confirmada rende +5 extras; o time com mais culpas ganha +20.
- **Pontuação final:** culpa + bônus − penalidades diárias de FUN. Vence o maior.

---

## 13. As atividades (fontes de FUN)

Toda atividade tem **estoque finito por dia** (renova só no dia seguinte, exceto reposições com risco). **Repetir a mesma atividade em sequência rende −25% a cada uso seguido** (retorno decrescente). A soma dos estoques supera a meta, mas fechar a meta exige **usar pelo menos 3 tipos** de atividade a partir de quarta.

| Atividade | O que é | Estoque/dia | Contraponto |
|---|---|---|---|
| **Tiro** (top-down) | Minigame 2D na tela do monitor (WASD + mouse, 1 vida/partida, ~35 s) | 2 partidas, recarga 60 s | Barulho de tiro (7 m), tela pisca, calor alto. Paródia, sem assets reais. |
| **Pescaria** | Minigame silencioso de pescar peixes | 6 peixes | **Visão de túnel**: a seta de aviso sonoro some do HUD e os passos ficam ×0,7 mais baixos. |
| **Vídeos curtos** | Vídeos na tela | 20 s | O áudio **vaza** (8 m). Com **fones (H)** o vazamento some, mas você ouve passos ×0,35 e porta ×0,5. |
| **Lanche** | Comer da gaveta | 3 + 4 compartilhados na cozinha | Deixa **migalha**; ≥ 2 migalhas na mesa em checagem = +15 de Suspeita. Limpar: E por 3 s. |
| **Basquete de papel** | Jogar bolas de papel na lixeira | 6 folhas | Bola errada vira **evidência no chão**; o chefe a ≤ 4 m dá +8 de Suspeita. Recolher devolve a folha (você sai da mesa). |
| **Corrida de cadeira** | Rolar com a cadeira pelo salão | 2 corridas de 10 s, recarga 45 s | Rodinhas barulhentas (6 m); você está **fora da mesa e no cone**. |
| **Fofoca na cozinha** | Duas+ bolas no balcão conversam 5 s | 3 por dupla | Ruído 5 m; todos em pé no cone. |
| **Roubar lanche** | Do estoque da cozinha (Coop) ou do rival (Traição) | 1 por alvo | Tira recurso do outro. |

### 13.1 Tarefas "puxa-saco" (baixam Suspeita)
- **Planilha no ritmo (F):** anel que fecha em 8 s com 4 batidas; acerto (±0,18 s): −2,5 de Suspeita/s e −8 de calor/s. Erro: +2 instantâneo. **Pausa o FUN.**
- **Café:** máquina na cozinha (recarga global 20 s). Levar o copo sem derramar. O **SpillMeter** (0-100) sobe com a velocidade; > 30 = poça (evidência + chama o chefe 8 s). Entregar na **bandeja** da sala do chefe: −20 para quem entrega, −8 para os outros.
- **Relatório (Ter em diante):** aparece um pedido no HUD (prazo 90 s). Fazer: planilha (8 s) → imprimir (E 4 s na impressora, ruído 6 m) → carimbar (E 1 s) → bandeja. Entregue: −10 de Suspeita. **Atrasado:** +20 de Suspeita e o chefe visita sua mesa. Quantidade por dia: Ter 2, Qua 3, Qui 3, Sex 4.

### 13.2 Esconderijo
Os dois banheiros (**feminino** no canto superior esquerdo, **masculino** no superior direito, simétricos): entrar esconde você do chefe por até 8 s, recarga 45 s. O som de descarga denuncia. Sair na frente do chefe é flagrante.

---

## 14. TABELA MESTRA (fonte única dos números; copiar para `shared/balance.ts`)

> Valores de partida, ajustáveis em playtest. Mudou aqui, muda no código e no TDD.

### 14.1 Global
| Chave | Valor |
|---|---|
| `DAY_DURATION` | 300 s (manhã 0-90 · meio-dia 90-180 · tarde 180-300) |
| `WEEK_DAYS` | 5 |
| `PLAYERS_COOP` | 2-6 |
| `PLAYERS_TRAICAO` | 2 / 4 / 6 (1x1, 2x2, 3x3) |
| `FUN_MAX` | 100 (zera a cada dia) |
| `FUN_META` | [40, 55, 65, 75, 85] |
| `SUS_MAX` | 100 |
| `SUS_TEAM_FORMULA` | 0,6 × média + 0,4 × maior (não demitidos) |
| `SUS_INSPECAO_RESET` | 40 |
| `TEDIO_SUS_START` | +15 |
| `ADVERTENCIAS_LIMITE` | 3 |
| `PLAYER_SPEED` | 4,0 m/s (acel. 16) |
| `CHAIR_SPEED` | 6,0 m/s |

### 14.2 Suspeita e calor (taxas por segundo)
| Chave | Valor |
|---|---|
| `SUS_PASSIVE` | +0,18/s sempre (v0.4: a Suspeita só cai com trabalho) |
| `PLANILHA_FALLOFF` | 15 — depois de a planilha baixar 15 no dia, ela rende metade (e assim por diante) |
| `SUS_STAND_IN_CONE` | +6/s |
| `SUS_PLANILHA` | −2,5/s ativo · +2 instantâneo no erro |
| `SUS_HOT_EXTRA` | +1/s quando calor > 60 |
| `HEAT_HOT` | 60 → cooler audível/visível; audição do chefe ×1,5 |
| `HEAT_DECAY` | −8/s na planilha · −2/s parado |
| `CAFE_DELIVER` | −20 (entregador), −8 (demais) |
| `CAFE_MACHINE_CD` | 20 s global · `CAFE_PLAYER_CD` 30 s |
| `SPILL_PUDDLE_AT` | 30% (poça, gatilho 1,5 m, chama o chefe 8 s) |
| `TASKS` (telefone) | ver 14.6 — tarefa feita −22 · errada +6 · atrasada +20 e conferência |
| `BATHROOM_HIDE` | 8 s · recarga 45 s |

### 14.3 Atividades
| Atividade | Estoque/dia | FUN | Suspeita ind. | Calor/s | Ruído (raio) | Peso Instinto |
|---|---|---|---|---|---|---|
| Tiro | 2 partidas · máx 35 s · recarga 60 s | +0,5/s vivo + 0,5/abate · máx 20/partida | +1,2/s | +6 | 7 m | 3,0/s |
| Pescaria | 6 peixes | +3/peixe (máx 18) | +0,5/s | +2 | 0 | 1,0/s |
| Vídeos | 20 s | +0,75/s (máx 15) | +0,8/s (fone +0,3) | +3 (fone +1) | 8 m (fone 0) | 2,0/s (fone 0,8) |
| Lanche | 3 + 4 cozinha | +4 | +2 por uso | 0 | 3 m | 2 por uso |
| Basquete | monte de 8 na mesa (+4 com a loja) · até 3 na mão · as erradas ficam no chão | +2 acerto · +0,5 erro | +0,3/lance | 0 | 2 m | 1 por lance |
| Cadeira | 2 × 10 s · recarga 45 s | +1,0/s (máx 10/corrida) | +3/s no cone, +0,5/s fora | +4 | 6 m | 4,0/s |
| Fofoca | 3 por dupla · 5 s | +5 cada | +2 cada | 0 | 5 m | 2,0/s |
| Roubar lanche | 1 por alvo | +6 | +3 | 0 | 2 m | 1 por uso |
| Pizza (sex) | 6 fatias | +6 | +1 | 0 | 4 m | 2 por uso |

### 14.4 Chefe por dia
| Dia | Chefe | Velocidade | Identificação | CheckScreen | Intervalo mín. entre rondas | Ronda de relógio | Aviso mín. (porta→1ª mesa) |
|---|---|---|---|---|---|---|---|
| Dia de X9 (sorteado, dia 2+) | X9 (rondas normais; na hora do evento "Ronda do X9", anda ~45–65 s seguidos com pausa a cada 30–45 s por 25–40 s, cego e surdo (era 70–100 s: 73% de demissão nos robôs, 30/10)) | 1,8 m/s (+0,04/dia, máx. 2,4) | curva do dia | 2 s | curva do dia | curva do dia | 10 s |
| Ter | Chefe | 3,0 | 0,5 s | 3 s | 45 s | 75 s | 8 s |
| Qua | Chefe | 3,0 | 0,5 s | 3 s | 40 s | 75 s | 8 s |
| Qui | Chefe + lanterna | 3,3 | 0,5 s | 3 s | 35 s | 70 s | 7 s |
| Sex | Chefe + Dono | 3,3 / Dono 3,5 | 0,5 s | 3 s | 30 s | 60 s | 6 s (Dono: 5 s por chaves) |

Na run infinita (v0.6) o aviso da porta segue `bossDay` em `src/balance.ts`: 8 s nos dias 1–3, 7 s nos dias 4–6 e **6 s do dia 7 em diante, nunca menos** (pilar 3).

| Chave comum do chefe | Valor |
|---|---|
| `BOSS_VISION` | cone 70° · 12 m (10 m para sentados) |
| `BOSS_HEARING_BASE` | por raio de ruído do evento; ×1,5 com calor > 60 |
| `INSTINCT_THRESHOLD` | 120 (zera ao iniciar a ronda) |
| `RONDA_TARGETS` | 3 mesas de maior contribuição recente (+ bandeiras) |
| `CHECK_ARC` | ±30° atrás do jogador · ≤ 1,8 m |
| `CLUTCH_WINDOW` | 0,5 s antes da identificação |
| `CLUTCH_REWARD` | +5 FUN · −10 Suspeita ind. |
| `HEROI_WINDOW` | 1 s depois da identificação · ≤ 2 m |
| `NOISE_EMOTES` | pigarro 4 m · tossir 6 m · mesa 8 m · assobio 10 m (aliados ouvem em 12 m) |
| `CAMERA_FIXA` | +5 Suspeita/s no cone (Qua+) |
| `FLASHLIGHT` | cone 30° · 14 m (Qui) |

### 14.5 Traição
| Chave | Valor |
|---|---|
| `BLAME_WINDOW` | 10 s |
| `BLAME_PER_FIRE` | +10 por autor (máx +20) |
| `DEDURAR_HIT` / `DEDURAR_MISS` | +15 culpa / −10 culpa e +20 Suspeita ao autor |
| `DAILY_FUN_PENALTY` | −10 ao time com menos FUN total |
| `JULGAMENTO_BONUS` | +5 por culpa confirmada rev. · +20 ao líder |

---

### 14.6 v0.4 — elevador, tarefas, desafios, bonk e loja
| Chave | Valor |
|---|---|
| `ELEVATOR` | 15 s no elevador antes de cada dia · do 2º dia em diante, segurar ESPAÇO 0,8 s pula |
| `X9_PATROL` | 1ª pausa assim que a porta abre (tempo para achar a mesa) · depois a cada 45–70 s · dura 30–45 s (café ou banheiro) |
| `TASKS.first` / `firstMonday` | 1ª ligação aos 25 s · na segunda, aos 60 s |
| `TASKS.interval` | 120 s (0% da meta) → 35 s (meta perto) · 2 tarefas ativas a partir de 75% da meta |
| `TASKS.ringTime` / `missSus` | 15 s para atender · não atendeu = +10 e conferência |
| `TASKS.susDone` / `susWrong` / `susLate` | −22 / +6 / +20 |
| `TASKS.deadline` | relatório 75 · assinatura 90 · galão 90 · impressora 60 · café 80 · planilha 70 · e-mails 60 · slides 60 · reunião 60 (s) |
| `TASKS.meeting` | 20 s · batida 1,6 s · errar +2 · cochilar (2 batidas sem F) +5 |
| `CHALLENGE` | 2 por dia · +8 FUN e +5 de vale cada · tarefa feita +2 de vale |
| `BONK` | colega +3 FUN (50% revida) · chefe pelas costas +15 FUN e ele investiga · se te vê, persegue |
| `SHOP` | Monte maior 10 · Dobradiça 12 · Planta 15 · Retrovisor 18 · Pantufas 10 · Post-it 14 (vale-diversão; vale pela semana) |
| `SHOP_FX` | +4 bolinhas · aviso +2 s · identificação ×1,5 · ruído ×0,5 |
| Vale-Diversão do dia | FUN acima da meta + 5 por desafio + 2 por tarefa |
| Clima por dia | Seg sol · Ter nublado · Qua sol · Qui chuva (o raio derruba a luz) · Sex dourado |

## 15. Plantas do escritório

**Mapa base: B1** (Coop e Traição). **Variante opcional B2** para Traição 3x3. Escala: salão **30 m × 20 m**.

### 15.1 Planta B1 (base)

```
+-----------+--------------------------+-----------+
| BANHEIRO  |       SALA DO CHEFE      | BANHEIRO  |
| FEMININO  |  [mesa]      [bandeja]   | MASCULINO |
+----[D]----+-------[ PORTA ]----------+----[D]----+
|                                                  |
|            #                        #            |
|=C1==                                        ==C4=|
|                                                  |
|          . . . . . . . . . . . . . . .           |
|          .                            .          |
|=C2==     .    [ MESA DE REUNIAO ]     .     ==C5=|
|          .                            .          |
|          . . . . . . . . . . . . . . .           |
|                                                  |
|=C3==                                        ==C6=|
|                                                  |
|            #                        #            |
|   +--------------+        +------------+         |
|   |   COZINHA    |        | IMPRESSORA |         |
|   |   (cafe)     |        |            |         |
+--------------------------------------------------+
```

> O desenho é esquemático. As posições exatas estão na tabela abaixo (origem no canto superior esquerdo; x → direita, z → para baixo; metros).

| Elemento | Posição / tamanho | Notas |
|---|---|---|
| Salão | 30 × 20 | Piso carpete azul, paredes claras, luz fluorescente quente |
| Sala do chefe | x 10-20 · z 0-4 | Porta voltada ao salão em (15, 4) · mesa elevada 0,4 m · **bandeja** do café fora da porta em (13,5; 4,6) |
| Banheiro feminino | x 0-4 · z 0-4 | Porta em (2, 4) |
| Banheiro masculino | x 26-30 · z 0-4 | Porta em (28, 4) |
| Cabines esquerda C1, C2, C3 | encostadas na parede x = 0, centros z = 7 / 11,5 / 16 | Bola senta de **costas para o salão**, monitor na parede |
| Cabines direita C4, C5, C6 | encostadas na parede x = 30, mesmos z | idem |
| Divisórias | altura 1,1 m, entre cabines | Bolas sempre visíveis por cima |
| Mesa de reunião | centro (15, 11,5) · 6 × 2,5 | Evento de seg e qua |
| Anel de ronda | retângulo x 8-22 · z 7-16 | Caminho do chefe |
| Colunas | (7,5) (23,5) (7,16) (23,16), 0,8 m | Pontos cegos |
| Cozinha | x 6-14 · z 17-20 | Máquina de café · estoque de lanche · disjuntor em (6, 19) · balcão de fofoca |
| Impressora | x 16-22 · z 17-20 | Mesa do carimbo ao lado |
| Câmera fixa (Qua+) | teto (15, 5) apontando ao sul | Cone cobrindo o início do anel |
| Lixeiras | uma por cabine | Basquete |

### 15.2 Planta B2 (opcional, Traição 3x3)

```
+-----------+--------------------------+-----------+
| BANHEIRO  |       SALA DO CHEFE      | BANHEIRO  |
| FEMININO  |  [mesa]      [bandeja]   | MASCULINO |
+----[D]----+-------[ PORTA ]----------+----[D]----+
| SALA DO TIME A  |  CORREDOR    | SALA DO TIME B  |
|=C1==            |              |            ==C4=|
|                 :              :                 |
|=C2==            |[ REUNIAO ]   |            ==C5=|
|                 :              :                 |
|=C3==            |COZ.   IMPR.  |            ==C6=|
+--------------------------------------------------+
```
Duas salas de time com portas para um corredor compartilhado onde ficam a mesa de reunião, a cozinha e a impressora. As mesmas peças do B1, reorganizadas. O chefe faz a ronda pelo corredor e entra em cada sala.

---

## 16. Direção de arte (mantida do v1.0, com ajustes)

- **Personagens:** esfera levemente amassada, cor chapada fosca, **visor preto + 2 olhos brancos + pupila**. Sem boca, nariz, dedos ou pernas.
- **Funcionário:** azul-acinzentado, escala 1,0, gravata em uma das 6 cores à escolha. **Anel de time** no chão (Traição).
- **Estagiário X9:** verde-claro, escala 0,8, **hélice** no topo.
- **Chefe:** vinho, escala 1,9, gravata preta, olhos menores e mais juntos.
- **O Dono:** preto fosco, escala 2,2, gravata dourada, olhos pequenos luminosos.
- **Fantasma:** funcionário a 40% de opacidade.
- **Atuação 100% pelo olho + squash/stretch:** Normal / Alert (1,25×) / Clutch (1,6×, gigante) / Caught (vira um traço X) / Tédio (pálpebra caída).
- **Cenário:** escritório low-poly claro, divisórias baixas, carpete azul, luz fluorescente quente, sombras suaves. Materiais foscos de cor chapada (roughness 0,6-0,9), sem textura realista.
- **Pós-processo (leve):** tone mapping, bloom suave nas telas dos monitores, vinheta sutil. Qualidade Baixa desliga bloom e sombras.

## 17. Áudio (parte da mecânica)

- **3D posicional** (Web Audio): passos do chefe, chaves do Dono, ruídos de atividades, emotes, impressora, cooler.
- **Globais:** porta do chefe abrindo, alarme da impressora, gongo da reunião, estalo do blecaute.
- **Chefe:** passos pesados (Chefe), leves e rápidos (X9), tilintar de chaves (Dono).
- **Fones (H)** abafam passos/porta para o jogador.
- **Música:** ambiente de escritório muito leve (loop curto), sem mascarar SFX. Volumes: master / SFX / música nas opções.
- **Legendas de som** (padrão ligado): "[passos à direita]", "[porta do chefe]" etc. — acessibilidade e leitura sem som.
- **Sem chat de voz.** Lista completa de sons em `ASSETS.md`.
- A fonte dos sons: **sintetizados no código (Web Audio)** + bibliotecas livres. Sem chave de API.

## 18. HUD

- **Embaixo-centro:** barra de **FUN** grossa com marca da meta do dia.
- **Topo-centro:** rótulo de Suspeita do time + barrinha da sua Suspeita individual (sem o olho).
- **Esquerda:** estoques (partidas de tiro, peixes, segundos de vídeo, lanches, folhas) + recarga do café.
- **Direita-baixo:** mini-janela da tela ativa (jogo/planilha) + pedidos de relatório com prazo.
- **Topo-direita:** relógio do dia e fase; no Coop, contador de advertências.
- **Centro:** popups "CLUTCH!" / "PEGO!" (0,8 s).
- **Placar (Tab):** FUN, Suspeita e culpas (Traição).
- **Acessibilidade:** Suspeita nunca depende só de cor (ícones e formas distintas); legendas de som.

## 19. Fluxo de telas

1. **Boot** (clique para liberar o áudio) → 2. **Menu principal**: Jogar · Como jogar · Opções · Créditos. Fundo: o escritório com bolas digitando e o chefe fazendo ronda em loop.
2. **Jogar:** Solo (treino Coop ou Traição vs bots) · Criar sala · Entrar com código.
3. **Lobby:** código de 4 letras + link, 6 vagas coloridas, nome e cor da gravata, o host escolhe modo, tamanho dos times e começa.
4. **Briefing do dia:** dia, chefe, meta, liberações novas, evento do meio-dia.
5. **Dia** → 6. **Fim de dia**: Relatório + replay → próximo dia / final da semana.
6. **Sexta:** Julgamento (Traição) → tela final com ranking.
- **Opções:** sensibilidade, inverter Y, qualidade (Baixa/Alta), volumes, idioma PT/EN, legendas de som, tutorial ligado/desligado, nome.
- **Esc:** overlay de menu; **não pausa** no multiplayer; no solo pausa o chefe.
- **Desconexão:** a bola do jogador que saiu vira bot (rotina simples); servidor dedicado, sem migração de host.

## 20. Progressão, cosméticos e save

- **Cosméticos** (sem pay-to-win): gravatas extras (listrada, bolinhas, borboleta), **coroa dourada** (sacrifício heroico, vencedor do Traição, semana sem demissões), chapéu de festa (sexta).
- **Save local (navegador):** nome, cor, opções, melhor semana, cosméticos desbloqueados. Sem contas, sem nuvem.
- **Fora do escopo desta versão:** Endless/leaderboard, loja, história, mobile, voz.

## 21. Escopo e prioridades

| Prioridade | Conteúdo |
|---|---|
| **P0 (protótipo)** | Mapa B1, bola, sentar/monitor, tiro, FUN/Suspeita, planilha, chefe com porta+passos+ronda+CheckScreen+clutch, demissão/fantasma, Seg completa, 2 abas conectadas (Coop). |
| **P1** | Semana completa, todas as atividades, café/relatório, eventos, Dono, Traição, bots, menus, lobby por código, opções, save. |
| **P2** | Replay do melhor momento, cosméticos, B2, polimento de arte/áudio, deploy. |
| **Cortado** | Chat de voz, Endless/leaderboard, loja, mobile, Steam (pode voltar via Electron no futuro). |

## 22. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Áudio no navegador só toca após um clique | Tela "clique para começar" (Boot). |
| Física/rede (café, papéis, cadeira) | Física local e cosmética; só **eventos finais** vão pela rede. |
| Chefe injusto | Porta global + passos 3D + olho Alert + aviso mínimo por dia. |
| Farm infinito | Estoques finitos + retorno decrescente + meta com ≥ 3 tipos + calor/Instinto. |
| Rondas imprevisíveis demais | Ronda de relógio + intervalo mínimo; a ordem de visita é por contribuição. |
| GPU fraca / bloom | Qualidade Baixa (sem bloom/sombras, resolução reduzida). |
| Servidor grátis "dorme" | Mostrar "acordando o servidor…" no lobby; teste local sem servidor externo. |
| Equilíbrio dos números | Tabela mestra única + playtest com amigos; ajustar só na tabela. |

## 23. Glossário

**FUN**: ganho individual de enrolação (0-100, zera por dia). **Suspeita**: risco; individual e do time. **Calor**: aquecimento oculto da bola. **Instinto**: acúmulo oculto do chefe que dispara a ronda. **Ronda**: saída do chefe da sala para inspecionar. **CheckScreen**: ele para atrás de você e olha o monitor. **Clutch**: ALT-TAB nos últimos 0,5 s antes da identificação. **Tédio**: penalidade por não bater a meta. **Advertência**: derrota parcial do time no Coop. **Culpa**: ponto de incriminação no Traição. **Fantasma**: jogador demitido no dia.

## 24. Decisões minhas, revisáveis

Tomadas para fechar pontos que o usuário deixou abertos; mude se discordar: a fórmula `SUS_TEAM`; os números da tabela mestra; metas de FUN por dia; câmera em 3ª pessoa; Esc não pausa no multiplayer; X9 com poder de demitir (porém mais fraco); regra de culpa dos últimos 10 s; Julgamento como bônus e não como eliminação; `Pizza` demite quem comeu mais; bots com 15% de falha; servidor dedicado sem migração de host.

## 25. A validar em playtest

Se 5 min por dia é o ideal; se as metas de FUN fecham com as atividades liberadas; se 0,35 s de janela de clutch é justo; se o intervalo entre rondas (30-50 s) cria tensão sem frustrar; se o Instinto 120 e os pesos geram rondas "orgânicas"; se a Suspeita do time 0,6/0,4 pune o suficiente os vacilões; se a visão de túnel da pescaria é divertida ou só injusta.
