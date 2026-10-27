# BOSS KEY: Slack Off Together — GDD v1.1

> Substitui o GDD v1.0 (`BOSS_KEY_GDD_TDD.pdf`). Idioma: PT-BR. Documentos irmãos: [TDD.md](TDD.md) (técnica + roadmap), [ASSETS.md](ASSETS.md) (arte 3D e sons), [CHANGELOG_v1.1.md](CHANGELOG_v1.1.md) (o que mudou e por quê).

---

## 0. Como retomar (instrução para o Claude, e para quem abrir isto depois)

**Status: v0.2 solo implementada (ver TDD §11).** Quando o usuário disser "pode colocar em prática" (ou equivalente):

1. Leia, nesta ordem: este GDD inteiro, `TDD.md` (principalmente a seção **Roadmap**), `ASSETS.md`.
2. **Não refaça perguntas de design**: tudo que o usuário decidiu está aqui. Onde o documento diz "decisão minha, revisável", siga o texto e só mude se o usuário pedir.
3. Comece pela **Fase 0** do roadmap e siga a ordem. Cada fase tem "critério de pronto"; só avance quando passar.
4. Os números do jogo vivem **só** na seção 14 (Tabela mestra) e devem ser copiados para `shared/balance.ts`. Nunca espalhar números mágicos no código.
5. Ferramentas: navegador embutido (preview + screenshots + 2 abas para testar rede), Blender via MCP para os modelos (ver `ASSETS.md`), skills `threejs-*` para cena/luz/materiais/áudio/performance.
6. **Perguntar ao usuário antes de**: usar `generate_3d` (gasta crédito), instalar algo fora do stack do TDD, publicar/hospedar o servidor.
7. Marque o progresso no fim do `TDD.md` (checklist do roadmap).

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
- Tutorial embutido na **segunda-feira** (dicas em sequência, desligável nas opções).

---

## 5. Os dois medidores (e um oculto)

### 5.1 FUN (individual, 0-100, visível)
- É o seu "ganho". Sobe enrolando; **nunca desce** dentro do dia; **zera no início de cada dia**.
- Tem uma **meta por dia** (tabela mestra, seção 14). Excedente vira pontos de ranking.
- Meta de FUN já batida conta mesmo se você for demitido depois.

### 5.2 Suspeita (visível)
- **Individual (0-100):** o que você faz de errado. Aparece como um marcador pequeno na barra de olho.
- **Do time (0-100):** `SUS_TIME = 0,6 × média + 0,4 × maior`, considerando os jogadores não demitidos. É o **olho vermelho** grande no topo da tela.
- **Sobe com:** atividade proibida (taxa por atividade), estar em pé no cone do chefe (+6/s; o cone só existe enquanto o chefe está **fora da sala**, em ronda), calor alto (+1/s extra), bagunça flagrada, relatório atrasado, sabotagem recebida (Traição).
- **Desce com:** planilha no ritmo (−2,5/s), café entregue (−20 para quem entrega, −8 para os demais), relatório entregue (−10), repouso sentado sem atividade (−0,3/s), clutch perfeito (−10).
- **Suspeita individual = 100 → "flagrante"**: o chefe vem direto (porta + ≥ 8 s de aviso) e demite quem estiver nesse nível; se você baixar a Suspeita abaixo de 100 antes de ele chegar, ele dá meia-volta ("falso alarme").
- **Suspeita do time = 100 → "inspeção geral"**: o chefe visita todas as mesas; quem tiver janela proibida aberta **ou** Suspeita individual > 50 é demitido. Depois a Suspeita do time cai para 40.

### 5.3 Calor (oculto, por jogador)
- Não existe barra. A bola **esquenta** com atividades pesadas; acima de 60 aparece um anel vermelho + **ventilador (cooler) audível**, e a audição do chefe sobe ×1,5.
- Sobe com tiro, cadeira, vídeo sem fone, pescaria; desce com planilha e repouso (taxas na seção 14).

### 5.4 Instinto do chefe (oculto, global)
- O chefe acumula **Instinto** a partir do que todos fazem (cada atividade tem um peso por segundo, seção 14). Ao atingir **120** e se já passou o **intervalo mínimo** desde a última ronda, ele **sai da sala para uma ronda**. O jogador não vê o número.
- Além do Instinto, há uma **ronda de relógio** garantida a cada X segundos (varia por dia), para que jogar "certinho" também seja checado.

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
| Mover a bola | WASD (a bola desliza) |
| Olhar | Mouse (câmera em 3ª pessoa) |
| Sentar / levantar / interagir | E |
| Usar / atirar / clicar na janela | Botão esquerdo |
| **ALT-TAB** (alterna janela proibida ↔ planilha) | Espaço |
| Planilha no ritmo | F |
| **Espiar para trás** (câmera livre enquanto sentado) | Segurar botão direito |
| Fones de ouvido (vídeos) | H |
| Ping "chefe vindo!" (seta visível aos aliados) | Q |
| Sons de comunicação: tossir / pigarro / bater na mesa / assobiar | 1 / 2 / 3 / 4 |
| Placar | Tab |
| Menu / opções (não pausa no multiplayer) | Esc |

- Sentado, a câmera encaixa no **monitor** (visão frontal da tela). Segurando o botão direito você "sai da tela" e olha a sala (a atividade **congela**, mas a janela continua visível para o chefe).
- Perder o foco da aba (Alt+Tab real do navegador): o jogo troca para a planilha por segurança, **sem** contar como clutch.
- Câmera 3ª pessoa em pé; ver a atuação dos olhos da bola faz parte do jogo.

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
5. **Clutch perfeito:** se você trocou para a planilha **nos últimos 0,35 s antes da identificação** → +5 FUN, −10 Suspeita individual, popup "CLUTCH!", câmera lenta de 0,5 s (só visual local), candidato a replay. Trocar **antes** dessa janela = "salvou", sem bônus.
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
| `SUS_IDLE_DECAY` | −0,3/s sentado sem atividade |
| `SUS_STAND_IN_CONE` | +6/s |
| `SUS_PLANILHA` | −2,5/s ativo · +2 instantâneo no erro |
| `SUS_HOT_EXTRA` | +1/s quando calor > 60 |
| `HEAT_HOT` | 60 → cooler audível/visível; audição do chefe ×1,5 |
| `HEAT_DECAY` | −8/s na planilha · −2/s parado |
| `CAFE_DELIVER` | −20 (entregador), −8 (demais) |
| `CAFE_MACHINE_CD` | 20 s global · `CAFE_PLAYER_CD` 30 s |
| `SPILL_PUDDLE_AT` | 30% (poça, gatilho 1,5 m, chama o chefe 8 s) |
| `RELATORIO_DEADLINE` | 90 s · entregue −10 · atrasado +20 e visita |
| `BATHROOM_HIDE` | 8 s · recarga 45 s |

### 14.3 Atividades
| Atividade | Estoque/dia | FUN | Suspeita ind. | Calor/s | Ruído (raio) | Peso Instinto |
|---|---|---|---|---|---|---|
| Tiro | 2 partidas · máx 35 s · recarga 60 s | +0,5/s vivo + 0,5/abate · máx 20/partida | +1,2/s | +6 | 7 m | 3,0/s |
| Pescaria | 6 peixes | +3/peixe (máx 18) | +0,5/s | +2 | 0 | 1,0/s |
| Vídeos | 20 s | +0,75/s (máx 15) | +0,8/s (fone +0,3) | +3 (fone +1) | 8 m (fone 0) | 2,0/s (fone 0,8) |
| Lanche | 3 + 4 cozinha | +4 | +2 por uso | 0 | 3 m | 2 por uso |
| Basquete | 6 folhas | +2 acerto · +0,5 erro | +0,3/lance | 0 | 2 m | 1 por lance |
| Cadeira | 2 × 10 s · recarga 45 s | +1,0/s (máx 10/corrida) | +3/s no cone, +0,5/s fora | +4 | 6 m | 4,0/s |
| Fofoca | 3 por dupla · 5 s | +5 cada | +2 cada | 0 | 5 m | 2,0/s |
| Roubar lanche | 1 por alvo | +6 | +3 | 0 | 2 m | 1 por uso |
| Pizza (sex) | 6 fatias | +6 | +1 | 0 | 4 m | 2 por uso |

### 14.4 Chefe por dia
| Dia | Chefe | Velocidade | Identificação | CheckScreen | Intervalo mín. entre rondas | Ronda de relógio | Aviso mín. (porta→1ª mesa) |
|---|---|---|---|---|---|---|---|
| Seg | X9 | 2,5 m/s | 0,8 s | 2 s | 50 s | 90 s | 10 s |
| Ter | Chefe | 3,0 | 0,5 s | 3 s | 45 s | 75 s | 8 s |
| Qua | Chefe | 3,0 | 0,5 s | 3 s | 40 s | 75 s | 8 s |
| Qui | Chefe + lanterna | 3,3 | 0,5 s | 3 s | 35 s | 70 s | 7 s |
| Sex | Chefe + Dono | 3,3 / Dono 3,5 | 0,5 s | 3 s | 30 s | 60 s | 6 s (Dono: 5 s por chaves) |

| Chave comum do chefe | Valor |
|---|---|
| `BOSS_VISION` | cone 70° · 12 m (10 m para sentados) |
| `BOSS_HEARING_BASE` | por raio de ruído do evento; ×1,5 com calor > 60 |
| `INSTINCT_THRESHOLD` | 120 (zera ao iniciar a ronda) |
| `RONDA_TARGETS` | 3 mesas de maior contribuição recente (+ bandeiras) |
| `CHECK_ARC` | ±30° atrás do jogador · ≤ 1,8 m |
| `CLUTCH_WINDOW` | 0,35 s antes da identificação |
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
- **Topo-centro:** **olho** de Suspeita do time (abre conforme sobe) + marcador da sua Suspeita individual.
- **Esquerda:** radar de som (seta indicando a direção do último som do chefe; **some** durante a pescaria) + estoques (partidas de tiro, peixes, segundos de vídeo, lanches, folhas) + recarga do café.
- **Direita-baixo:** mini-janela da tela ativa (jogo/planilha) + pedidos de relatório com prazo.
- **Topo-direita:** relógio do dia e fase; no Coop, contador de advertências.
- **Centro:** popups "CLUTCH!" / "PEGO!" (0,8 s).
- **Placar (Tab):** FUN, Suspeita e culpas (Traição).
- **Acessibilidade:** Suspeita e radar nunca dependem só de cor (ícones e formas distintas); legendas de som.

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
| Chefe injusto | Porta global + passos 3D + radar + olho Alert + aviso mínimo por dia. |
| Farm infinito | Estoques finitos + retorno decrescente + meta com ≥ 3 tipos + calor/Instinto. |
| Rondas imprevisíveis demais | Ronda de relógio + intervalo mínimo; a ordem de visita é por contribuição. |
| GPU fraca / bloom | Qualidade Baixa (sem bloom/sombras, resolução reduzida). |
| Servidor grátis "dorme" | Mostrar "acordando o servidor…" no lobby; teste local sem servidor externo. |
| Equilíbrio dos números | Tabela mestra única + playtest com amigos; ajustar só na tabela. |

## 23. Glossário

**FUN**: ganho individual de enrolação (0-100, zera por dia). **Suspeita**: risco; individual e do time. **Calor**: aquecimento oculto da bola. **Instinto**: acúmulo oculto do chefe que dispara a ronda. **Ronda**: saída do chefe da sala para inspecionar. **CheckScreen**: ele para atrás de você e olha o monitor. **Clutch**: ALT-TAB nos últimos 0,35 s antes da identificação. **Tédio**: penalidade por não bater a meta. **Advertência**: derrota parcial do time no Coop. **Culpa**: ponto de incriminação no Traição. **Fantasma**: jogador demitido no dia.

## 24. Decisões minhas, revisáveis

Tomadas para fechar pontos que o usuário deixou abertos; mude se discordar: a fórmula `SUS_TEAM`; os números da tabela mestra; metas de FUN por dia; câmera em 3ª pessoa; Esc não pausa no multiplayer; X9 com poder de demitir (porém mais fraco); regra de culpa dos últimos 10 s; Julgamento como bônus e não como eliminação; `Pizza` demite quem comeu mais; bots com 15% de falha; servidor dedicado sem migração de host.

## 25. A validar em playtest

Se 5 min por dia é o ideal; se as metas de FUN fecham com as atividades liberadas; se 0,35 s de janela de clutch é justo; se o intervalo entre rondas (30-50 s) cria tensão sem frustrar; se o Instinto 120 e os pesos geram rondas "orgânicas"; se a Suspeita do time 0,6/0,4 pune o suficiente os vacilões; se a visão de túnel da pescaria é divertida ou só injusta.
