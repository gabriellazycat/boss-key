# BOSS KEY — Slack Off Together

> Você não trabalha, você finge que trabalha.

Stealth de escritório no navegador: você é uma bola com olhos que quer enrolar o dia inteiro (jogar, ver vídeo, pescar, comer, jogar papel no lixo) sem o chefe perceber. Ouça a **porta** e os **passos**, aperte **ESPAÇO** (ALT-TAB) no último segundo e ganhe um **CLUTCH!**

Feito em **Three.js + TypeScript + Vite**. Arte procedural e áudio 100% sintetizado (Web Audio) — sem assets de terceiros.

## Rodar

```bash
npm install
npm run dev
```

Abra <http://localhost:5173>. Build de produção: `npm run build` (saída em `dist/`).

## Controles

| Andando | | Sentado no PC | |
|---|---|---|---|
| WASD / mouse | andar / olhar (clique para travar o cursor) | Mire e clique no monitor | abrir apps / jogar |
| **Clique no seu PC** | sentar | **ESPAÇO** | ALT-TAB (planilha ↔ jogo) |
| **E no monte de papel** | pegar bolinha (até 3 na mão) | **T** | atender o telefone |
| **E perto do telefone** | atender o chefe | app **Trabalho** | tarefas de PC (totais, e-mails, slides) |
| No elevador: segure **ESPAÇO** | pular a subida (do 2º dia em diante) | **F** na reunião | concordar no ritmo |
| CLIQUE / E | interagir (café, sofá, cadeira, máquina, fofoca, cabine do banheiro…) | **F** | planilha no ritmo (baixa Suspeita) |
| Botão direito (segure/solte) | arremessar papel em qualquer lixeira/cesta | Sentado: clique no monte / telefone | pegar bolinha / atender (silhueta branca) |
| SHIFT | andar com cuidado (não derrama café) | G / C | lanche / limpar migalhas |
| ESPAÇO | pulinho | H | fones de ouvido |
| Fantasma: ENTER | acelerar o tempo | Mouse (sentado) | girar na cadeira; a mira é o cursor da tela |
| ESC / P | pausa | E | levantar |

## Novidades da v0.4

- **Elevador**: todo dia começa com o time subindo até o 12º andar (música de elevador, display de andar, espelho e um painel com meta, evento e desafios do dia). A porta abre e o expediente começa; do 2º dia em diante dá para pular segurando ESPAÇO. Os botões da cabine têm reações bobas (e um alarme que assusta todo mundo).
- **Suspeita que só cai trabalhando**: ela sobe sozinha o dia todo. A planilha rende cada vez menos; CLUTCH e ficar parado não baixam mais.
- **Telefone do chefe e tarefas dinâmicas**: quanto mais diversão, mais o telefone toca (até 2 tarefas de uma vez perto da meta). Relatório, assinatura de colega, galão do bebedouro, impressora travada, café "do jeito dele", puzzles no app Trabalho (totais, e-mails, slides) e reunião relâmpago no viva-voz. Errou puzzle ou estourou o prazo = Suspeita e conferência.
- **X9 na segunda**: fica na sala e sai em rondas normais; num dia sorteado (evento "Ronda do X9") ele anda pelo escritório por ~70–100 s e faz pausas de café e banheiro (só dá para saber pelo som e pela caneca/rolo de papel na mão dele).
- **Papel físico**: monte de bolinhas ao lado do PC, até 3 na mão, as erradas ficam no chão para recolher; mira nova com arco legível e anel no ponto de queda.
- **Bonk**: bolinha na cabeça de colega (às vezes ele revida) ou do chefe pelas costas (ele vai investigar).
- **Desafios do dia** (2 por dia) e **lojinha do almoxarifado** entre os dias, com Vale-Diversão: monte maior, dobradiça barulhenta, planta, retrovisor no monitor, pantufas e post-it "Em reunião".
- **Escritório vivo**: luz que acompanha o dia (manhã fria → fim de tarde dourado → 18h roxo), clima por dia (chuva com raios na quinta, o raio derruba a luz), pombos no parapeito, nuvens, avião, prédios acendendo à tarde, mesas com a cara de cada colega e bagunça de escritório.
- **Patinhas em 1ª pessoa**, **HUD de papelaria** (post-its, carimbo, marca-texto, relatório em memorando), **tela que reage ao perigo** (vinheta da Suspeita, susto na porta, linhas de velocidade), **colegas expressivos** (balões, olhar para o telefone, dancinha da meta) e **contorno** no que dá para usar.
- Correções: cadeiras com o encosto certo (e giram quando você espia), geladeira encostada na parede, cozinha arrumada, bolinha não bate mais em "parede invisível" acima de mesas.

## O que tem desde a v0.3 (solo)

- **Tudo em primeira pessoa**: você vê pelos olhos da sua bola — andando, sentado, na cadeira, deitado no sofá, espiando pela fresta da cabine do banheiro e até sendo demitido. O que você carrega (café, relatório, bolinha de papel) aparece na mão.
- **Ande livre pelo escritório**: o dia começa em pé; você só senta quando clica no seu PC.
- **Sala de descompressão** com diversões "físicas": soneca no sofá, corrida de cadeira de rodinha, máquina de lanche; **fofoca** com colegas na cozinha. Se o chefe te **ver** na farra = flagrante.
- **Perseguição**: se o chefe te vê na farra, ele **corre atrás de você**. Sente na sua mesa a tempo (escapa por um triz) ou **esconda-se na cabine do banheiro** para despistá-lo.
- **Escritório**: mesa de reunião no meio do salão; banheiros fundos com porta de abrir, cabine com privada, bancada com pias e espelho de verdade (reflete a cena).
- **Colegas vivos**: os bots trabalham, jogam no PC, levantam para café/sofá e voltam correndo quando a porta range (às vezes tarde demais).
- **Visual estilo PEAK**: sol entrando pelos janelões com feixes de luz e poeira, céu e cidade lá fora, forro de ripas e varal de luzinhas, oclusão de ambiente (GTAO), grade de cor quente, personagens com shading toon, contorno, sobrancelhas, bochechas e acessórios próprios. Chefe de terno e topete, X9 de boné-hélice, Dono de cartola.
- **Semana de 5 dias** (Seg–Sex) com eventos: X9 e boas-vindas · impressora travada · auditoria · blecaute com lanterna · pizza de sexta + **O Dono**.
- **Chefe com FSM** (porta → ronda → suspeito/investigar → CheckScreen → retorno), visão em cone, audição por raio, Instinto + ronda de relógio, aviso mínimo garantido; agora também patrulha a sala de descompressão.
- **CheckScreen + Clutch** (0,35 s): câmera lenta, flash, confete e espiada automática no chefe.
- **BossOS no monitor**: Planilha no ritmo, Ball Ops, Pesca Zen, ClipClop.
- Café com derramamento, relatórios, calor, tédio, inspeção geral, fantasma, advertências, esbarrões no chefe.
- Áudio 100% sintetizado (porta, passos 3D, ronco, fofoca, rodinhas, música lounge), HUD com barra de Suspeita e mira; menus com mascote.

Os números do jogo vivem em [`src/balance.ts`](src/balance.ts) (espelho da tabela mestra do GDD §14).

## Estrutura

```
src/
  balance.ts        tabela mestra
  core/             Renderer (bloom + passe final), Audio (síntese), Input, Juice (tremor, câmera lenta, partículas)
  world/            Office (planta B1 procedural), Nav (A*), texturas procedurais
  entities/Ball.ts  bola com olhos, squash/stretch, acessórios
  game/             Game (dia/semana/jogador/eventos), Boss (FSM), Worker
  apps/             BossOS + minigames do monitor
  ui/               HUD e telas
docs/               GDD, TDD, ASSETS
```

## Debug

`http://localhost:5173/?debug` expõe `game`, `step(segundos)`, `key(code)`, `click(x, y)`, `quickstart(dia)`, `tp(x, z, yaw)`, `cam(...)` e `fakeLock()` no console.

## Multiplayer (v0.5)

**No navegador (teste rápido):** abra duas abas em <http://localhost:5173>. Numa, **Criar sala**; na outra, **Entrar com código** com o código que aparece no painel do elevador. Aperte **E** no painel de botões do elevador para marcar **PRONTO**; quando todos estiverem prontos, as portas abrem em 5 s.

**Com um amigo pela Steam (Spacewar, AppID 480):**
1. `npm run dist:win` gera `release/BOSS KEY-win.zip`; mande o zip.
2. Os dois com a Steam aberta e logada. Descompacte e abra `BOSS KEY.exe` (a Steam mostra "jogando Spacewar" — é normal).
3. Quem hospeda clica **Criar sala** e convida pelo **Shift+Tab** (ou passa o código). O amigo aparece no elevador.
4. O Windows SmartScreen pode avisar (exe não assinado): **Mais informações → Executar assim mesmo**.

Detalhes técnicos: `docs/TDD.md` §5.

## Testes

| Comando | O que faz |
|---|---|
| `npm test` | Regras do balanço e os números do GDD (< 1 s). |
| `npm run checks` | Alcance de cada objeto, escolha do E, visão das mesas e o hall (~2 min). |
| `npm run tour` | Prints dos momentos principais em `tools/playtest/out/tour/` (~1 min). |
| `npm run mptest` | Checagem do multiplayer local sem janela (~1 min). |
| `npm run playtest` | Robôs jogando runs inteiras e relatório de diversão (20 min–2 h). |
| `npm run verify` | Tudo o que é rápido, em sequência (~6 min). |

Teste com pessoas: veja `docs/TESTE_COM_PESSOAS.md`. No fim da run, **Salvar relatório** baixa um `.json` com os dias.

## Próximos passos

Traição, voz por proximidade, minigames compartilhados (pebolim 1×1), replay do melhor momento.
