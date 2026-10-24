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

| Sentado (na mesa) | | Em pé | |
|---|---|---|---|
| Clique no monitor | abrir apps / jogar | WASD | andar |
| **ESPAÇO** | ALT-TAB (planilha ↔ jogo) | SHIFT | andar com cuidado (não derrama café) |
| **F** | planilha no ritmo (baixa Suspeita) | E | interagir (café, bandeja, impressora, disjuntor, pizza) |
| B (segure/solte) | basquete de papel | Mouse | olhar (clique para travar o cursor) |
| G | lanche | | |
| C (segure) | limpar migalhas | Fantasma: ENTER | acelerar o tempo |
| H | fones de ouvido | | |
| Botão direito | espiar para trás | | |
| E | levantar | Esc / P | pausa |

## O que tem nesta versão (v0.2 — solo)

- **Semana de 5 dias** (Seg–Sex), cada um com chefe, meta de FUN, liberações e evento do meio-dia:
  X9 e boas-vindas · impressora travada · auditoria em ordem no quadro · blecaute com lanterna · pizza de sexta + **O Dono**.
- **Chefe com FSM** (Na sala → Porta → Ronda → Suspeito/Investigar → CheckScreen → Retorno), visão em cone com linha de visão, audição por raio de ruído, Instinto oculto + ronda de relógio, **aviso mínimo garantido** entre a porta e a primeira mesa.
- **CheckScreen + Clutch** (janela de 0,35 s): câmera lenta, flash, aberração cromática, confete e espiada automática no chefe.
- **BossOS no monitor** (canvas diegético, cursor 3D): Planilha no ritmo, **Ball Ops** (tiro top-down), **Pesca Zen** (silenciosa, visão de túnel), **ClipClop** (vídeo que vaza som sem fones).
- Café com **medidor de derramamento** e poças, relatórios com prazo, basquete de papel com física, lanche com migalhas, calor/cooler, tédio, flagrante, inspeção geral, demissão → fantasma, advertências do time.
- 3 colegas bots com rotina, reação à porta e 15% de vacilo.
- HUD: olho de Suspeita animado, barra de FUN com meta, radar de som, legendas direcionais, tarefas, dicas de tutorial (segunda).
- Menus com o escritório vivo ao fundo, briefing, relatório do dia, tela final com nota (S–F), opções salvas (volumes, sensibilidade, qualidade, duração do dia 5/3 min, gravata).

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

`http://localhost:5173/?debug` expõe `game`, `step(segundos)`, `key(code)`, `click(x, y)` e `quickstart(dia)` no console.

## Próximos passos

Multiplayer (Colyseus, Coop 2-6 e Traição), cadeira de rodinha, fofoca, banheiros, replay do melhor momento — ver `docs/TDD.md`.
