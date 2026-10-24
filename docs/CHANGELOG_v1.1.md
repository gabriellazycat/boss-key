# CHANGELOG — GDD v1.0 → v1.1

> Cada mudança vem com o **porquê**. Origem: revisão do `BOSS_KEY_GDD_TDD.pdf` + decisões do usuário. Numeração das seções refere-se ao GDD v1.1.

## 1. Decisões do usuário (substituem o v1.0)

| # | v1.0 | v1.1 | Por quê |
|---|---|---|---|
| 1 | Unity URP + Mirror + FizzySteamworks | **Three.js + TypeScript + Vite + Rapier + Colyseus** (navegador) | Engine livre; eu enxergo e testo no navegador; link compartilhável; co-op barato. Steam pode voltar via Electron. |
| 2 | "Sem áudio (corte aprovado)" | **Tem áudio** (SFX, ambiente, música leve); só **sem chat de voz** | O pilar "ouvir passo" depende de som. |
| 3 | 3 barras: FUN, SUS, Calor | **2 barras:** FUN (individual) + Suspeita (individual + do time). Calor virou **oculto** (efeito visual/sonoro) | Clareza em clipes de 5 s e balanceamento mais simples. |
| 4 | Solo primeiro; co-op na Fase 2 | **Co-op e Traição desde o início**; solo vira **treino com bots** | O diferencial (traição) precisa estar no produto desde o primeiro protótipo. |
| 5 | Review de sexta com votação de demissão | **Dois modos separados:** Coop (todos × chefe, 3 advertências) e Traição (times × times, pontos de culpa) | Pedido do usuário. A votação sai (travava em 2 jogadores). |
| 6 | Demitido = vira espectador até o fim | **Demitido só naquele dia**; vira **fantasma** que ajuda | Pedido do usuário; reduz frustração. |
| 7 | 1 mapa, 4-6 mesas | **Mapa B1**: salão 30×20 com 6 cabines nas paredes, anel de ronda, colunas; banheiro fem./masc. simétricos. B2 opcional | Escolha do usuário a partir das plantas desenhadas. |
| 8 | 2-4 jogadores | **Coop 2-6; Traição 1x1/2x2/3x3; Solo** | Pedido do usuário. |
| 9 | 1 minigame (tiro) | **8 atividades** de FUN, todas com **estoque finito** e **contraponto** | Evita farm e dá escolhas (tiro e pescaria são os dois minigames de tela). |
| 10 | Detecção por visão/audição simples | **Instinto oculto + rondas** com aviso (porta global + passos 3D + radar); **espiar para trás** | Ideia do usuário; fica justo e legível. |

## 2. Problemas do v1.0 corrigidos

| Problema | Onde estava | Correção v1.1 |
|---|---|---|
| Barra FUN 0-100 mas meta do Dia 5 = 120 | §9 | `FUN_META` = [40, 55, 65, 75, 85] ≤ 100 |
| Metas diferentes em GDD e TDD | §9 vs TDD §3 | Uma tabela mestra (GDD §14) |
| FUN "+2/s jogando" vs "score = FUN" no minigame | §8 e §11 | Taxa por atividade na tabela; tiro: +0,5/s vivo + 0,5/abate, teto 20/partida |
| Dia 1 fechava em 30 s (meta 60 / +2 FUN/s) | §8-9 | Estoques finitos + metas ajustadas + retorno decrescente |
| Café run (15 s) dentro do cone: SUS +10/s = morte | §8-9 | O cone (+6/s) só existe com o chefe **fora da sala**; a corrida da cozinha à bandeja leva ~10 s e a bandeja fica fora da porta; o café deixou de ser "tudo ou nada" (−20 para quem entrega, −8 para os demais) |
| Percepção sentado: 10 m (GDD) vs 8 m (TDD) | §12 vs TDD §5 | 10 m para sentados, regra única (§10.2) |
| Janela de clutch ambígua ("<0,35 s antes") | §8 | Regra única: **0,35 s antes da identificação**, com tempos definidos (§10.3) |
| Alt+Tab real como clutch automático (exploit) | §10, TDD §4 | Perder foco = trocar para planilha **sem** clutch |
| Fim do dia indefinido (o que acontece ao bater a meta?) | — | O dia termina em 300 s ou quando todos são demitidos; meta é verificada ao fim; excedente = ranking |
| Reiniciar o dia ao ser pego (12 min) frustrava | §8 | Demissão só no dia; todos demitidos = advertência, o dia não reinicia |
| Votação de sexta empata sempre com 2 jogadores | §13 | Eliminada; no Traição, pontos de culpa |
| "Dono (sem passo, só sombra)" quebrava o fair play | §12 | Chaves tilintando (som 3D) + sombra 2 s antes |
| Pilar "ouvir passo" sem áudio | §1-2 | Áudio ativado; radar de som e legendas de acessibilidade |
| Demo solo não mostrava o diferencial | §19 | Treino com bots + modos multiplayer no primeiro protótipo |
| Host migration via Steam P2P (caro) | TDD §8 | Servidor dedicado; sem migração |
| Estagiário X9 com arte, mas boss-D1 sem regras | §5, §12 | X9 com regras próprias (mais lento, grita, perdoa mais) |
| Texto em russo no TDD ("передвига") | TDD §10 | Removido (o TDD foi reescrito) |
| Anotação pessoal no TDD ("já existe no seu GitHub") | TDD §8 | Removida |
| Cor-só para Suspeita/seta | §16 | Ícones/formas + legendas de som |

## 3. Novidades do v1.1

- **Semana com tema por dia:** X9 → Chefe → Auditoria → Blecaute → Dono (§7), cada dia com um evento de meio-dia (§9).
- **Tédio** (meta não batida) como penalidade com consequência no dia seguinte (§6.1).
- **Comunicação sem voz:** sons/emotes que o chefe também ouve (§11.1).
- **Sabotagens** do modo Traição, **culpa** com janela de 10 s e **Julgamento** (§11.2, §12).
- **Café-garçom, sacrifício heroico, corpo-bloqueio, bolinha de distração** (§11.1).
- **Tarefa de relatório** (impressora, carimbo, bandeja) (§13.1).
- **Plantas ASCII** e tabela de posições (§15).
- **Roadmap por fases** com critério de pronto (TDD §8) e lista de assets (ASSETS.md).

## 4. O que foi removido ou adiado

- Unity, Mirror, FizzySteamworks, ParrelSync, Steam AppId/Next Fest/preço (v1.0 §20): adiado; o produto agora é web.
- Endless semanal com leaderboard: adiado.
- Votação de demissão da sexta: removida.
- Dia 0 como cena separada: absorvido pela segunda-feira (tutorial embutido).
- Menu "CO-OP desabilitado/wishlist": não faz sentido no novo escopo.

## 5. Pendências de decisão do usuário (opcional)

Itens que tomei por padrão e estão listados no GDD §24; revisar quando quiser. E hospedagem do servidor (TDD §5): decidir antes da Fase 10.
