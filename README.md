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
| WASD / mouse | andar / olhar (clique para travar o cursor) | Clique no monitor | abrir apps / jogar |
| **Clique no seu PC** | sentar | **ESPAÇO** | ALT-TAB (planilha ↔ jogo) |
| CLIQUE / E | interagir (café, sofá, cadeira, máquina, fofoca, cabine do banheiro…) | **F** | planilha no ritmo (baixa Suspeita) |
| Botão direito (segure/solte) | arremessar papel em qualquer lixeira/cesta | B (segure/solte) | papel na lixeira da mesa |
| SHIFT | andar com cuidado (não derrama café) | G / C | lanche / limpar migalhas |
| ESPAÇO | pulinho | H | fones de ouvido |
| Fantasma: ENTER | acelerar o tempo | Botão direito | espiar para trás |
| ESC / P | pausa | E | levantar |

## O que tem nesta versão (v0.3 — solo)

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
- Áudio 100% sintetizado (porta, passos 3D, ronco, fofoca, rodinhas, música lounge), HUD com olho de Suspeita, radar e mira; menus com mascote.

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

## Próximos passos

Multiplayer (Colyseus, Coop 2-6 e Traição), replay do melhor momento — ver `docs/TDD.md` e `docs/V03_PLAN.md`.
