# BOSS KEY — TDD v1.1 (Technical Design + Roadmap)

> Companheiro do [GDD.md](GDD.md). **Nada deste documento foi implementado ainda.** Números de jogo: sempre da tabela mestra do GDD (seção 14), copiada para `shared/balance.ts`.

---

## 1. Stack (travada)

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | **TypeScript** (strict) | Tipos compartilhados cliente/servidor |
| Bundler / dev | **Vite** | HMR rápido, build estático |
| 3D | **Three.js** (WebGL2) | Eu consigo ver, testar e iterar no navegador embutido |
| Física | **Rapier** (`@dimforge/rapier3d-compat`, WASM) | Café, papel, cadeira, empurrão |
| Servidor | **Node + Colyseus** (rooms, schema com delta sync) | Salas por código, estado autoritativo |
| Transporte | WebSocket (Colyseus) | Sem Steam/P2P |
| Áudio | **Web Audio API** (`PannerNode` HRTF para sons 3D) | Passos 3D são mecânica |
| UI/HUD | HTML/CSS sobre o canvas (+ canvas 2D para os minigames) | Rápido, acessível |
| Modelos | **glTF/GLB** exportados do **Blender** (via MCP) | Ver `ASSETS.md` |
| Testes | Vitest (lógica pura: Suspeita, Instinto, culpa) + Playwright/navegador embutido (smoke e 2 abas) | |
| Pacotes | npm workspaces | |

Skills úteis ao implementar: `threejs-fundamentals`, `threejs-gameplay-systems`, `threejs-lighting`, `threejs-materials`, `threejs-postprocessing`, `threejs-loaders`, `threejs-asset-pipeline`, `threejs-performance`, `threejs-debug-profiler`, `threejs-qa-release`, `threejs-game-ui-designer`.

## 2. Estrutura do repositório

```
JobSimulator/
  docs/                    # GDD, TDD, ASSETS, CHANGELOG (este material)
  package.json             # workspaces: client, server, shared
  shared/
    src/balance.ts         # espelho da tabela mestra (UM lugar para números)
    src/protocol.ts        # tipos das mensagens e do estado
    src/rules/             # lógica pura compartilhada (suspicion.ts, blame.ts, instinct.ts)
  server/
    src/index.ts           # Colyseus bootstrap
    src/rooms/OfficeRoom.ts# sala: lobby → dia → fim de dia → semana
    src/sim/               # BossAI.ts, DayDirector.ts, Events.ts, Bots.ts
  client/
    index.html
    src/main.ts
    src/engine/            # renderer, loop, input, câmera, pointer lock
    src/world/             # OfficeMap.ts (monta o mapa B1/B2), Props.ts, Lighting.ts
    src/entities/          # Ball.ts (visual + squash + olhos), Boss.ts, Ghost.ts
    src/activities/        # TiroGame.ts, PescariaGame.ts, VideoPlayer.ts, Snack.ts, PaperBasket.ts, ChairRide.ts, Gossip.ts
    src/tasks/             # Planilha.ts, Cafe.ts, Relatorio.ts
    src/net/               # client.ts (Colyseus), interpolation.ts, prediction.ts
    src/audio/             # AudioEngine.ts, synth/*.ts (sons sintetizados), library/ (arquivos livres)
    src/ui/                # HUD, Menu, Lobby, Briefing, DayReport, Settings, Subtitles
    src/save/              # localStorage
    public/models/*.glb    # vindos do Blender
    public/audio/*         # sons de biblioteca livre
```

## 3. Arquitetura

### 3.1 Princípios
- **Servidor autoritativo para o que decide o jogo:** chefe (FSM + percepção), Suspeita, Instinto, relógio do dia, demissões, culpa, estoques, eventos.
- **Cliente autoritativo para movimento da própria bola** (com *clamp* de velocidade no servidor) e para a física cosmética (café, papel, cadeira).
- **Física nunca é sincronizada por corpo rígido.** Só eventos finais viajam: `cup_spilled(pct)`, `paper_landed(x,z,hit)`, `chair_ride(start/stop)`.
- **Lógica pura em `shared/rules/`**, usada pelo servidor (autoridade) e por testes. O cliente só **exibe** estado.
- O **solo** roda o mesmo código de servidor **no processo local** (cliente e "servidor" no mesmo navegador via transporte em memória) para não ter duas implementações. Se isso complicar, usar um servidor local `node` iniciado por script.

### 3.2 Loops
- **Servidor:** simulação a **20 Hz** (`setSimulationInterval(50)`); o chefe decide a **10 Hz**.
- **Cliente:** render à taxa do monitor; entrada enviada a **30 Hz**; interpolação de entidades remotas com buffer de ~100 ms; correção suave da posição própria se o servidor discordar.
- **Rapier** local a 60 Hz fixo.

### 3.3 Estado (Colyseus schema)
```
OfficeState {
  phase: "lobby" | "briefing" | "day" | "dayEnd" | "judgement" | "weekEnd"
  mode: "coop" | "traicao"
  dayIndex: 0..4
  clock: number               // segundos do dia
  warnings: number            // advertências (coop)
  teamSus: map<teamId, number>
  players: map<id, PlayerState>
  boss: BossState
  dono: BossState?            // sexta
  event: EventState           // impressora travada, blecaute, auditoria...
  task: map<id, ReportState>  // pedidos de relatório
}
PlayerState {
  name, color, teamId, seat, connected, bot: boolean
  x,z,yaw, seated, ghost
  window: "planilha" | "tiro" | "pescaria" | "video" | "none"
  fun, susInd, heat (servidor; heat só para efeitos)
  stock: { tiro, peixes, videoSec, lanches, folhas, cadeiraRuns, ... }
  eye: "normal" | "alert" | "clutch" | "caught" | "tedio"
  tedio: boolean
}
BossState { x,z,yaw, state, targetSeat, kind: "x9"|"chefe"|"dono" }
```
Cliente nunca recebe `heat` de outros além do efeito visual (anel/cooler).

### 3.4 Mensagens (cliente → servidor)
`input{dx,dz,yaw,seated}` · `sit{seat}` / `stand` · `window{to}` (ALT-TAB) · `activity_start{kind}` / `activity_tick{kind,delta}` / `activity_end{kind,score}` · `emote{id}` · `ping{x,z}` · `cafe_take` / `cafe_deliver{spillPct}` · `report_step{id,step}` · `hide{bathroom}` · `sabotage{kind,targetId}` · `snitch{targetId}` · `assume_blame{targetId}` · `ghost_ping` / `ghost_noise{x,z}`.

Servidor → cliente (além do estado): `door_open` · `boss_steps{x,z,speed}` (som posicional é gerado no cliente a partir de `boss`) · `fired{playerId,by[]}` · `clutch{playerId}` · `event_start/end` · `day_end{report}` · `replay{frames}` (opcional).

**Validação mínima (anti-erro, não anti-cheat):** o servidor limita FUN por segundo à taxa máxima da atividade, respeita estoques, e confere distância para interações.

### 3.5 O cérebro do chefe (servidor)
- **FSM:** `idle → door → ronda(path) → suspicious → investigate → checkScreen → return`.
- **Navegação:** grafo de waypoints pré-definido no anel e junto às mesas (sem NavMesh); suavizar com *steering* simples. Nenhum NavMesh em tempo real.
- **Percepção:** cone (70°, 12/10 m) + raycast em colisões estáticas (paredes/divisórias) usando uma malha simplificada no servidor (AABBs); audição = lista de eventos de ruído `{pos, radius, t}` com decaimento de 2 s.
- **Instinto:** soma `peso × dt` por atividade ativa (peso da tabela) → `if (instinto ≥ 120 && agora − últimaRonda ≥ intervaloMin) iniciarRonda()`. Ronda de relógio: `if (agora − últimaRonda ≥ relogio) iniciarRonda()`.
- **Seleção de alvos:** ordenar jogadores por "contribuição dos últimos 60 s" (soma de FUN ganho + Suspeita gerada) → top 3 + mesas com bandeira.
- **Aviso mínimo:** ao abrir a porta, calcular o tempo de caminho até a 1ª mesa; se `< avisoMin`, adicionar *espera na porta* = diferença.
- **CheckScreen:** chega à posição `seat + back*1.4`; `t_ident = chegada + identTime`; se `window ∈ proibidas` em `t_ident` → `fired`; clutch se `window` foi trocada para planilha em `[t_ident−0.35, t_ident]`; janela de herói `[t_ident, t_ident+1]`.
- **Dono:** mesma FSM, sem evento sonoro de passos; emite `keys{pos}` e uma sombra projetada 2 s antes de chegar.
- **Bots:** o mesmo servidor controla `Bots.ts` (rotina + reação à porta + 15% de falha).

### 3.6 Suspeita, culpa, Instinto (`shared/rules`, funções puras)
- `computeTeamSus(players)` = `0.6*mean + 0.4*max`.
- `applyDelta(player, kind, dt)` usa as taxas da tabela.
- `attributeBlame(firedPlayer, recentActions[], now)` → lista de `{team, points}` pela janela de 10 s.
- `instinctDelta(activeActivities, dt)` → soma pesos.
- Todas com testes de unidade (Vitest) ancorados em exemplos do GDD.

### 3.7 Minigames (cliente, nunca na rede)
- **Tiro:** canvas 2D no "monitor". Reporta `activity_tick{tiro, funDelta}` a cada 0,5 s (servidor clampa) e `activity_end`.
- **Pescaria:** canvas 2D; cada peixe pescado → `activity_tick`.
- **Vídeos:** tela com "vídeo" gerado (animação procedural) + áudio sintético com vazamento.
- Os minigames desenham numa `CanvasTexture` aplicada à tela do monitor 3D; na visão sentada o canvas ocupa a câmera.

### 3.8 Café, papel, cadeira (cliente, Rapier)
- **Café:** copo (Rapier) preso a um âncora na bola com mola; `SpillMeter` sobe com `velocidade × dt × k`; ao cruzar 30% → poça (decal + trigger) e `cafe_spilled`. A entrega envia `cafe_deliver{spillPct}`.
- **Papel:** esfera pequena com `restitution`; o resultado do lance viaja como evento.
- **Cadeira:** corpo cinemático/dinâmico leve, velocidade máx 6 m/s; só o transform da bola sincroniza.

### 3.9 Câmera
- **Em pé:** 3ª pessoa, órbita com mouse, colisão com paredes (raycast).
- **Sentado:** *tween* de 0,3 s para a câmera fixa no monitor; botão direito = câmera livre curta; soltou, retorna.
- Pointer Lock sempre ativo durante o dia; Esc libera o ponteiro e abre o menu (sem pausar no multiplayer).

### 3.10 Áudio (`AudioEngine`)
- `AudioContext` criado no clique do Boot.
- Barramentos: `master → sfx / music`. Sons 3D via `PannerNode` (HRTF, `refDistance 1`, `maxDistance` por som, `rolloff` linear).
- **Sons sintetizados (osciladores + ruído + envelopes):** passos do chefe/X9, porta, cooler (frequência acompanha o calor), digitação, ticks da planilha, tiros, alarmes, estalo do blecaute, popups. Detalhes em `ASSETS.md`.
- **Sons de biblioteca livre:** porta rangendo, cadeira rolando, impressora, café, tosse/pigarro. (Fonte e licença registradas em `ASSETS.md`.)
- Fones (H): filtro *low-pass* + ganho em passos/porta para o ouvinte local.
- **Legendas de som:** disparadas pelos mesmos eventos que geram o som.

### 3.11 Renderização
- `WebGLRenderer` com `antialias`, `outputColorSpace = SRGB`, ACES *tone mapping*, sombras suaves (PCFSoft) só na qualidade Alta.
- Luz: hemisférica + várias `RectAreaLight`/pontos fluorescentes fakeados com painéis emissivos; 1 direcional fraca. Lightmaps opcionais baked no Blender (fase de polimento).
- Bloom (UnrealBloom) restrito às telas dos monitores (seletivo) e ao blecaute.
- **Olhos e squash:** o corpo da bola é uma esfera deformada por *vertex shader* simples (squash/stretch) ou escala não uniforme no *root*; os olhos são meshes com escala animada por estado.
- *Instancing* para divisórias, lâmpadas, lixeiras, colunas.

### 3.12 Orçamento de performance
| Item | Meta |
|---|---|
| Bola | < 1,5 k tris |
| Cenário completo | < 150 k tris |
| *Draw calls* | < 120 (instancing + atlas de materiais) |
| Física | 1 corpo por jogador + copo + papéis ativos (≤ 12) |
| Rede | < 6 KB/s por jogador (transform 10-20 Hz + eventos) |
| FPS | 60 em notebook comum, 30+ em Qualidade Baixa |
| Download inicial | < 20 MB (GLB com Draco/meshopt, texturas pequenas) |
| Qualidade Baixa | sem sombras, sem bloom, *pixel ratio* 0,75 |

## 4. Plantas no código
`OfficeMap.ts` constrói o mapa a partir da tabela de posições da seção 15 do GDD. Estruturas de dados:
- `SEATS[6]`: posição, orientação, mesa, lixeira, gaveta.
- `WAYPOINTS`: anel (8 pontos), 6 pontos "atrás da mesa" (CheckScreen), pontos especiais (impressora, cozinha, mesa de reunião, porta).
- `COLLIDERS_STATIC`: AABBs usadas pelo cliente (Rapier) e pelo servidor (raycast de visão).
- O mapa B2 é uma segunda função `buildB2()` que reaproveita as mesmas peças (opcional, P2).

## 5. Rede e hospedagem
- **Dev:** `npm run dev` roda Vite (5173) + servidor (2567) juntos.
- **Sala:** código de 4 letras; link `…/?room=ABCD`. Entrar pelo link preenche o código.
- **Hospedagem (decidir depois, perguntar ao usuário):** estático em Cloudflare Pages/Netlify + Node (Colyseus) em Fly.io/Render/Railway free tier. Mostrar "acordando o servidor…" quando a conexão demora.
- **Sem migração de host.** Se todos os humanos saem, a sala fecha.
- **Latência:** alvo < 150 ms. O chefe é sempre decidido no servidor; o cliente só interpola.

## 6. Salvar e configurar
`localStorage`: `{ name, tieColor, options, bestWeek, unlocks[] }`. Tudo envolvido em `try/catch`; o jogo funciona sem save.

## 7. Testes e verificação por fase
- **Vitest:** `shared/rules` (Suspeita, Instinto, culpa, janela de clutch com exemplos numéricos).
- **Simulação headless do chefe:** script que roda 1.000 dias com bots e confere: nunca fica preso, aviso mínimo sempre ≥ valor da tabela, ronda a cada 30-90 s.
- **Navegador embutido:** screenshots de cada fase; 2 abas para rede; leitura do console sem erros.
- **Checklist de QA** (fim de cada fase): sem exceções por 15 min, 60 FPS, 2 jogadores sincronizados, desconectar/reconectar não trava o dia.

---

## 8. ROADMAP (ordem de implementação)

> Cada fase tem **entrega**, **critério de pronto** e **ferramentas**. Só avance se o critério passar. Marque `[x]` ao concluir.

### Fase 0 — Esqueleto
- [ ] Monorepo npm workspaces (`client`, `server`, `shared`), Vite, TS strict, ESLint, Vitest.
- [ ] Servidor Colyseus com `OfficeRoom` vazia; cliente conecta e mostra "N jogadores".
- [ ] `shared/balance.ts` com a tabela mestra completa.
- **Pronto quando:** `npm run dev` abre uma página com um cubo girando e **duas abas** veem "2 jogadores" na mesma sala.

### Fase 1 — Escritório e bola (blockout)
- [ ] `OfficeMap` B1 com **primitivas** (caixas) nas posições da tabela (cores planas, luz básica).
- [ ] Bola (esfera + visor + olhos) com movimento WASD, câmera 3ª pessoa, colisão com paredes/divisórias, pointer lock.
- [ ] Sentar (E) → câmera no monitor; levantar.
- **Pronto quando:** dá para andar pelo salão e sentar em qualquer cabine sem atravessar nada; 60 FPS.

### Fase 2 — Núcleo do dia solo
- [ ] Janelas na tela: planilha e tiro (canvas). ALT-TAB (Espaço).
- [ ] FUN, Suspeita individual, calor (taxas da tabela). HUD básico (FUN, olho).
- [ ] Planilha no ritmo (F).
- **Pronto quando:** jogar tiro sobe FUN/Suspeita/calor conforme a tabela; planilha reduz Suspeita; os números batem com `shared/rules` (testes passando).

### Fase 3 — O chefe
- [ ] BossAI (FSM, anel, alvos por contribuição, Instinto, ronda de relógio, aviso mínimo).
- [ ] Porta + passos 3D (AudioEngine mínimo, sons sintetizados), radar de som no HUD, legendas.
- [ ] CheckScreen + identificação + clutch + janela de herói + demissão/fantasma.
- [ ] Dia de 300 s com fases, meta de FUN, relatório do dia. **Segunda (X9)** completa.
- **Pronto quando:** em uma segunda inteira solo, o chefe faz rondas legíveis, o clutch perfeito funciona em ≥ 9/10 tentativas treinadas, nunca fica preso, o aviso mínimo é respeitado (script headless).

### Fase 4 — Rede mínima (primeiro protótipo jogável)
- [ ] Lobby por código/link; 2+ jogadores no mesmo dia; chefe/estado/Suspeita autoritativos no servidor.
- [ ] Interpolação de remotos; clutch e demissão visíveis em ambos; fantasma.
- [ ] Coop com advertências e semana (por enquanto só Seg-Qua).
- **Pronto quando:** 2 abas jogam uma segunda inteira em Coop, vendo um ao outro; desconectar uma aba vira bot sem travar o dia.

> **Marco 1 = Fase 4 concluída.** É o "primeiro protótipo": loop do dia com chefe e 2 abas conectadas.

### Fase 5 — Atividades e tarefas
- [ ] Pescaria, vídeos (+fones), lanche, basquete, cadeira, fofoca (estoques, retorno decrescente).
- [ ] Café (Rapier + SpillMeter + poça), relatório (impressora/carimbo/bandeja), banheiros.
- [ ] Emotes sonoros (1-4) e ping (Q); corpo-bloqueio; bolinha de distração; sacrifício heroico.
- **Pronto quando:** a meta de cada dia é atingível usando 3 tipos de atividade e é impossível fechá-la repetindo uma só; cada contraponto funciona (migalha, evidência, vazamento, túnel…).

### Fase 6 — Semana completa e eventos
- [ ] Parâmetros do chefe por dia; câmera fixa; lanterna; X9 grita; **o Dono** (chaves e sombra).
- [ ] Eventos: reunião, impressora travada, auditoria, blecaute (disjuntor), pizza.
- [ ] Briefing, relatório, avanço Seg→Sex, final da semana.
- **Pronto quando:** dá para jogar a semana de Seg a Sex em Coop com todos os eventos; o script headless de 1.000 dias passa.

### Fase 7 — Traição e bots
- [ ] Times 1x1/2x2/3x3, Suspeita por time, sabotagens com registro e culpa.
- [ ] Dedurar, placar, penalidade diária de FUN, Julgamento.
- [ ] Bots (rotina + reação + falha) para o modo Solo (treino Coop e Traição).
- **Pronto quando:** uma partida 2x2 fecha a semana com ranking correto de culpa (testes de unidade + um jogo real); o Solo é jogável.

### Fase 8 — Arte e som final
- [ ] Modelos do Blender conforme `ASSETS.md` (substituir as primitivas), materiais, iluminação final, bloom, olhos e squash completos.
- [ ] Sons sintetizados e de biblioteca conforme `ASSETS.md`; mixagem; legendas.
- **Pronto quando:** screenshots lado a lado mostram o estilo do GDD (bolas foscas, escritório claro, luz quente); orçamento de performance respeitado.

### Fase 9 — Menus, opções, save, polimento
- [ ] Boot, Menu principal (demo viva), Como jogar, Opções (inclui legendas), Créditos, Lobby final.
- [ ] Save local, cosméticos, coroa, localização PT/EN.
- [ ] (P2) Replay do melhor momento (buffer circular de 8 s).
- **Pronto quando:** um jogador novo entra pelo link, joga um dia sem ajuda e entende o loop (teste com amigos).

### Fase 10 — Deploy e playtest
- [ ] Build de produção, servidor hospedado (perguntar ao usuário), página estática.
- [ ] Playtest com 4-6 amigos; ajustar **só** a tabela mestra e registrar em `CHANGELOG`.
- **Pronto quando:** 6 pessoas completam uma semana sem travar; nenhum bug bloqueador.

### Fase opcional (P2)
- [ ] Mapa B2 para Traição 3x3.
- [ ] Empacotar com Electron para Steam (se o usuário quiser).

---

## 9. Riscos técnicos
| Risco | Mitigação |
|---|---|
| Lógica duplicada cliente/servidor | `shared/rules` é a única fonte; o cliente só exibe estado. |
| Sync de física | Nenhum corpo rígido é sincronizado; só eventos. |
| Raycast de visão no servidor | Malha simplificada de AABBs; testes de linha de visão unitários. |
| Áudio 3D inconsistente entre navegadores | `PannerNode` HRTF com fallback `equalpower`; testar em Chrome/Edge/Firefox. |
| Pointer Lock / foco | Tela de entrada com clique; tratar `pointerlockchange`; `blur` → planilha automática. |
| Custo do bloom / sombras | Qualidade Baixa desliga; medir com `threejs-debug-profiler`. |
| Servidor grátis | Mensagem de espera; teste local sempre disponível. |
| Escopo | Seguir prioridades P0/P1/P2 do GDD; cortar replay e B2 primeiro. |

## 10. Definition of Done geral
Sem exceções por 15 min de jogo · 60 FPS em notebook comum · 2-6 jogadores sincronizados · chefe nunca preso · clutch funciona 9/10 · build < 20 MB · números da tabela mestra = números do código (teste automático compara `balance.ts` com o GDD).

---

## 11. Status de implementação (v0.2 — solo, 2026-10-24)

Implementado num pacote único (`src/`, sem workspaces ainda, porque o servidor não existe):

- [x] Escritório B1 procedural, bola com olhos (estados de olho, squash), câmera 3ª pessoa + câmera do monitor + espiar.
- [x] BossOS no monitor: planilha no ritmo (F), Ball Ops, Pesca Zen, ClipClop (+fones), ALT-TAB.
- [x] FUN, Suspeita individual/time, calor, Instinto, ronda de relógio, aviso mínimo, CheckScreen, clutch, flagrante, inspeção, fantasma, advertências.
- [x] Semana completa com os 5 eventos, X9, chefe com lanterna, O Dono.
- [x] Café (SpillMeter + poça), relatórios, lanche/migalhas, basquete de papel (física própria, sem Rapier).
- [x] Bots (rotina 70/30, reação 1,5-3 s, 15% de falha), menus, briefing, relatório, tela final, opções, save local.
- [ ] Rede (Colyseus), Traição, lobby — Fase 4/7.
- [ ] Cadeira, fofoca, banheiros, sacrifício heroico, replay, cosméticos além da coroa.
- Simplificações: Seg = ronda de boas-vindas em todas as mesas (sem reunião); Qua = auditoria sem restrição "só pescaria"; física cosmética sem Rapier.
