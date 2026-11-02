# Remake Godot: passagem de bastão

**Heartbeat:** 2026-11-01 ~23:05 — PR #3 pronto para revisão (tirado do rascunho); cron de retomada apagado.
**Plano:** `C:/Users/gabri/.claude/plans/apos-essa-mudan-do-goofy-knuth.md`
**Worktree:** `C:/Users/gabri/Desktop/boss-key-godot`, branch `feat/godot-remake`, remoto `lazycat` (`gabriellazycat/boss-key`)
**Uso no último checkpoint:** 5 h = 49%, semanal = 20%

## Pronto
- **M0:** projeto, autoloads (`B`, `Settings`, `Sfx`, `Net`, `Game`), fontes OFL, 48 SFX (`tools/gen_sfx.py`), templates de export 4.7.2 instalados.
- **M1:** núcleo jogável de ponta a ponta. O robô headless joga um dia inteiro sem erro de script.
  - escritório procedural (`world/office.gd`)
  - Telinha com rosto em shader
  - PC BossOS com 4 apps
  - chefe com agenda, ronda, conferência de tela, clutch, perseguição, distração, instinto/espiada
  - HUD, relatório, loja, pausa, menu
  - assaltos (4) com 8 painéis
  - robô `tools/autoplay.gd`

## Feito depois da M1 (heartbeat 2026-11-01 ~22:15; uso 5 h = 68%, semanal = 23%)
- PR em rascunho: [gabriellazycat/boss-key#3](https://github.com/gabriellazycat/boss-key/pull/3).
- **M3:** briefing do chefe dentro do elevador; às 18h todos descem juntos para o hall (balcão de upgrades e porta da rua).
- **M4:** multi ENet testado com 2 instâncias headless (estado idêntico nos dois lados); GodotSteam 4.23.2 instalado em `addons/godotsteam`.
- Testes de lógica: `res://tests/tests.tscn`, 178 verificações passando.
- Export Windows: `godot/build/BossKey.exe` (fica fora do git) + `Abrir BOSS KEY (Godot).bat` + README.

## Feito na 2ª leva (heartbeat 2026-11-01 ~22:45; uso 5 h = 77%, semanal = 24%)
- Avaliação "jogador novo" (Haiku, só prints). Corrigido:
  - faixa de controles no 1º dia;
  - marcador SUA MESA;
  - instrução de cada app na barra de título;
  - objetivo e suspeita com fundo;
  - relatório legível.
- **Bug grave corrigido:** no solo o chefe não enxergava ninguém, porque o `pstate` só era publicado online.
- **Novo:** o brilho do jogo visto de longe deixa o chefe curioso e ele vem conferir a tela (é aí que nasce o clutch). De perto (3,2 m) ele lê a tela.
- **Balanceamento atual, robô no dia 1:**
  - cuidadoso: Suspeita 0;
  - ganancioso: Suspeita 27, sobrevive;
  - meta de FUN 70 (+8/dia).
- Prints para o PR em `godot/docs/shots/`.

## Próximo passo exato
1. Conferir o teste de 2 dias seguidos (o dia 2 precisa começar depois do hall). Se falhar, ver `_hall()` no robô e `Game.next_day`.
2. Teste multi mais longo (2 instâncias, ~1 dia), olhando o assalto e a ronda com o convidado.
3. Exportar o `.exe` de novo (`godot/build/BossKey.exe`).
4. Descrição final do PR #3 com os prints (`godot/docs/shots/*.png`), tirar do rascunho (`gh pr ready 3`) e apagar o cron.

## Como testar
- Headless: `godot --headless --path godot --quit-after 30000 -- --solo --autoplay --fast`
- Com janela e prints: `godot --path godot -- --solo --autoplay --fast --shots=C:/.../shots`
- Multi local: `godot --path godot -- --host --autoplay` + `godot --path godot -- --join=127.0.0.1 --autoplay --name=Bot2`

## Decisões tomadas sozinho (usuário AFK)
Estão no plano e em `docs/JOGO_ATUAL.md`. Em resumo:
- dia de 8 min;
- duas barras que contam no fim do dia (Trabalho e FUN), 3 strikes por run, 1º dia de treino;
- assaltos: grampeador, relógio, papel de parede, salgadinho;
- cortados: papo, casaco, supervisão, clientes, X9, eventos, truques e ClipClop;
- o Ball Ops faz barulho e enche o instinto do chefe (espiada); a Pesca é silenciosa;
- o brilho laranja do jogo na mesa denuncia de até 9 m.
