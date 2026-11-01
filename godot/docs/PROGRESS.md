# Remake Godot: passagem de bastão

**Heartbeat:** 2026-11-01 ~21:40 (horário local)
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

## Próximo passo exato
1. Rodar com janela (`godot --path godot -- --solo --autoplay --fast --shots=<pasta>`), olhar os prints e corrigir o visual.
2. Rodar de novo o balanceamento: cota 95×0,7 e FUN 40×0,7 no dia 1. Usar os perfis ganancioso e desastrado.
3. Abrir o PR em rascunho.
4. M3: elevador de verdade + hall do térreo (ler antes a conversa "Funcionamento do elevador").
5. M4: multi ENet com 2 instâncias (`--host` / `--join`), depois o GodotSteam (asset 2445, v4.23.2).
6. M5: polimento, export `.exe`, README e PR pronto.

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
