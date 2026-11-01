# Playtest automático — estado e próximos passos (para continuar em outro chat)

> **Concluído em 29/10/2026. O relatório final é `docs/PLAYTEST.md`.** Este arquivo ficou como histórico, com dois diagnósticos que se mostraram errados: (1) as abas novas não abriam por causa de várias runs dividindo o mesmo Chrome, não da aba travada; (2) o item 12 (travamento do cauteloso) era esse mesmo problema, e a run travada usou a semente 1000, não a 1010.

Atualizado em 28/10/2026, ~23h40. Nada foi commitado. Nenhum bug do jogo foi corrigido: o combinado era testar, relatar e você escolher o que corrigir.

## O que foi combinado

- **Ferramenta:** Playwright (`playwright-core` 1.64.1, oficial da Microsoft, sem scripts de instalação) usando o Chrome instalado.
- **Robôs:** usam atalhos internos (`?debug`), mas apertam as teclas de verdade (WASD/E/ESPAÇO/F/G/T/C/H/L/P). Atalho só onde o humano usaria o mouse: girar a câmera, mirar no monitor e calcular o arremesso.
- **Solo:** 4 perfis (cauteloso, equilibrado, arriscado, caótico) × 8 runs aceleradas (até 10–12 dias), mais 2 runs em tempo real.
- **Multiplayer:** 2, 3 e 4 jogadores, uma aba por jogador, sala local por BroadcastChannel; 2 runs de 3 dias cada. A sala Steam fica de fora.
- **Diversão:** métricas viram uma nota por critério, somadas ao meu olhar sobre vídeos e prints. É um indicador; a confirmação real vem de gente jogando.
- **Entrega:** `docs/PLAYTEST.md` com bugs, notas e propostas, mais um resumo no chat. Sem corrigir e sem commitar.

## O que existe agora (`tools/playtest/`)

| Arquivo | O que faz |
|---|---|
| `bot.js` | Jogador-robô que roda dentro da página. Escolhe objetivos (tarefas do telefone, fixa, diversões, café, herói de evento, fuga), reage ao chefe conforme o perfil, joga os minigames (tiro, pesca, vídeo, planilha no ritmo, totais, e-mails, slides, reunião, café do chefe) e arremessa bolinhas. Registra tudo em `PT.data` e checa invariantes: FUN nunca desce, estoque negativo, NaN, chefe ou NPC travado, robô preso. |
| `run.mjs` | Orquestrador. Compila o jogo (`vite build` para `out/_build`, sem tocar em `dist/`) e sobe o `vite preview` na porta 5180. Roda as runs solo em paralelo, as de tempo real em série e as salas multiplayer. Mede sincronia (relógio, posições, chefia), testa queda de convidado e saída do anfitrião, usa sementes (`Math.random` fixo por run), testa o "Nova run" e captura a pilha quando a página trava. |
| `analyze.mjs` | Gera métricas, a nota de diversão por critério e o `report.md`. |
| `repro.mjs` | Reprodução isolada de cada bug confirmado (diz "PRESENTE" ou "corrigido"). **Escrito, mas a versão final ainda não rodou.** |
| `_scn.mjs`, `_hang.mjs`, `_peek.mjs`, `_tl.mjs`, `_rep.mjs`, `_speed.mjs`, `_dbg.mjs` | Ajudantes de desenvolvimento. `_hang.mjs <semente> <perfil> <porta>` reproduz uma run e imprime a pilha se travar. `_tl.mjs` mostra a linha do tempo de Suspeita de um dia. `_rep.mjs <pasta>` refaz o relatório. |

Comandos (o servidor é criado sozinho):

```bash
node tools/playtest/run.mjs --suite smoke
node tools/playtest/run.mjs --suite full --parallel 5 --max-days 10 --out full
node tools/playtest/run.mjs --suite solo --solo-runs 3 --profiles arriscado --seed 1000
node tools/playtest/run.mjs --suite mp --mp-players 3 --mp-runs 1 --mp-days 2
node tools/playtest/run.mjs --server dev ...
node tools/playtest/repro.mjs
```

O primeiro é a conferência rápida (~3 min). O segundo é a suíte completa (1h30–2h). O terceiro roda só um perfil. O quarto roda só o multiplayer. `--server dev` usa o servidor de desenvolvimento em vez do build (pilhas legíveis). O último roda as reproduções dos bugs.

Saída em `tools/playtest/out/<pasta>/`: `report.md`, `summary.json`, `runs/*.json`, `shots/` (prints) e `videos/` (tempo real).

## Bugs do jogo confirmados (com evidência)

1. **CRÍTICO — o jogo trava quando o jogador demitido aperta ENTER para acelerar.**
   - *Causa:* as molas do rosto 2D usam Euler explícito (rigidez 260, amortecimento 14; `src/characters/Face2D.ts:168-169`, e as molas da cabeça em `src/characters/rig.ts`). Com o tempo ×6, elas divergem.
   - *Medido a 60 fps:* o "tamanho do olho" chega a 4×10^118 em 6 s.
   - *Travamento:* o `pixelFace` da Telinha (`disc`/`ring`, `Face2D.ts:1102-1115`) percorre um raio gigantesco ou infinito, a aba congela e o Chrome a derruba. Reproduzido em 5 de 6 sementes. No solo sempre há duas Telinhas (Duda e Fê).
   - *Correção sugerida:* integrar as molas em subpassos de no máximo 1/60 s (ou fazer o ×6 rodar vários `update` pequenos) e limitar o raio em `disc`/`ring`.
2. **ALTO — no dia 1 o X9 não ronda.**
   - *Causa:* `enterElevator` deixa o X9 em `wait`. Como `busy = state !== 'office'`, o `updateDirector` nunca inicia ronda. Só o evento "Ronda do X9" chama `startPatrol`.
   - *Efeito:* na maioria dos dias 1 não há chefe nenhum (2 de 3 no teste), e as boas-vindas, a auditoria e a impressora entram na fila e nunca acontecem.
   - *Correção sugerida:* ao abrir o elevador no dia do X9, chamar `startPatrol(true)` (ou fazê-lo voltar e rondar normalmente).
3. **ALTO — a tarefa "café do chefe" não pode ser cumprida.**
   - *Causa:* "Pegar café" (`coffee`) e "Fazer o café do chefe" (`cafeMake`) ficam no mesmo ponto e com o mesmo alcance (`P.coffee`, z−0,6, r 1,4). O `updateInteract` sempre escolhe o primeiro da lista.
   - *Efeito:* o E pega café comum; com a máquina esfriando, o E não faz nada. A Suspeita sobe em rampa até o fim do dia.
   - *Correção sugerida:* esconder `coffee` enquanto a tarefa de café está no passo 0, ou dar `prio` ao `cafeMake`.
4. **MÉDIO (balanceamento) — a "reunião relâmpago" feita perfeita aumenta a Suspeita.** A rampa da tarefa continua correndo nos 20 s da reunião: +10,5 no dia 3 com 13 de 13 acenos certos, positivo mesmo depois do −8 da entrega. O mesmo vale, em menor grau, para relatório e galão (andar devagar com o galão). *Correção sugerida:* pausar a rampa enquanto a tarefa está sendo executada.
5. **ALTO (design) — espiral de demissão e run solo que não acaba.**
   - *A conta:* quem é demitido volta com 50, e só a Suspeita passiva (0,18 × 1,15^dia × 180 s) já leva a ~95–100.
   - *Resultado nos testes de 6 a 12 dias:* do dia 2–3 em diante, o equilibrado foi demitido em 83% dos dias e o cauteloso em 50%; 38% do tempo foi como fantasma; todo dia que começou com Suspeita ≥ 85 terminou em demissão.
   - *Por que não acaba:* os colegas-NPC quase nunca são demitidos (0 a 1 por dia), e a run só termina quando todos caem no mesmo dia. Na prática ela é infinita.
6. **MÉDIO — esbarrão ao levantar.** O chefe confere a tela parado atrás da cadeira, onde o jogador aparece ao levantar, e isso dá +8 × curva automático (`Game.separateBalls`, ~linha 2094).
7. **MÉDIO — perseguido com as mãos ocupadas não tem saída.** Sentar e entrar na cabine exigem mãos livres, e não há tecla para largar o que se carrega.
8. **BAIXO — com os e-mails abertos, o E vira letra.** É preciso trocar de janela antes de levantar.
9. **RELEASE — o `?debug` funciona no build de produção.** Expõe `game`, `step`, `tp` e `fakeLock` (`src/main.ts:259`, sem `import.meta.env.DEV`).
10. **DESEMPENHO — a IA dos colegas custa ~1 ms por quadro** (`bots.update`), e o HUD ~0,6 ms por quadro quando há muita troca de prompt.
11. **DOC — o GDD §8 lista sons 1–4 e ping no Q que não existem no código.**
12. **A INVESTIGAR — segundo travamento.** Na última suíte, o perfil **cauteloso** (semente 1010) travou no dia 3. Não é o bug do ENTER, que esse perfil não aperta. A pilha veio minificada ("Ac", linha 4639 do build). Para reproduzir com pilha legível, use o servidor de desenvolvimento:

    ```bash
    node node_modules/vite/bin/vite.js --port 5181
    ```

    E em outro terminal:

    ```bash
    node tools/playtest/_hang.mjs 1010 cauteloso 5181
    ```

## Diversão (prévia, 3 perfis × 6 dias + 3 runs de 12 dias): nota-indicador ≈ 5,4/10

**Pontos fortes:**
- *Recompensa (8,1):* o primeiro FUN chega em ~7 s e rende ~10 FUN por minuto.
- *Aviso justo:* 100% das conferências do chefe tiveram ≥ 6 s de aviso.
- *Variedade razoável:* 2,2 fontes de FUN por dia.

**Pontos fracos:**
- *Curva de dificuldade (0):* o dia 1 fica sem chefe e a espiral começa no dia 2–3.
- *Escolhas importam (0):* o arriscado não fez mais pontos que o cauteloso; arriscar não compensa.
- *Ritmo (5,9):* 38% do tempo como fantasma e 14% esperando o chefe voltar.
- *Tensão (7):* 0,7 susto por minuto, no limite de baixo do alvo.
- *Clutch:* nenhum robô conseguiu um único clutch (janela de 0,35 s). Vale testar com gente.

**Multiplayer (2 jogadores, 1 dia):** sincronia ótima (relógio 0,1 s; posição 0,3 m de mediana e 0,9 m de máximo; chefia 0 m). O convidado vê "O ANFITRIÃO SAIU" em 4,1 s, e o jogo roda a 51 fps de média (30 nos 5% piores) com 2 abas. **3 e 4 jogadores, e o teste de queda do convidado, ainda não completaram.**

## O que falta fazer (em ordem)

1. **Infraestrutura do teste:** depois que uma aba trava, as abas novas do mesmo site não abrem mais (provavelmente o Chrome reaproveita o processo travado). No `run.mjs`, ao detectar travamento, fechar o contexto antes de seguir; se não bastar, abrir um navegador por run, ou lançar com `--site-per-process` / `--renderer-process-limit` alto.
2. Rodar `node tools/playtest/repro.mjs` e conferir que os 6 casos dão "PRESENTE".
3. Investigar o travamento do cauteloso (item 12) com o servidor de desenvolvimento.
4. Rodar a suíte completa: `node tools/playtest/run.mjs --suite full --parallel 5 --max-days 10 --out full` (~1h30). Se demorar, reduza com `--solo-runs 6` ou `--mp-days 2`.
5. Olhar `out/full/shots` e `out/full/videos` para a avaliação qualitativa e escrever o `docs/PLAYTEST.md` final (bugs, notas, propostas por prioridade).
6. Pequenos ajustes de projeto:
   - em `package.json`, adicionar `"playtest": "node tools/playtest/run.mjs"` e `"playtest:repro": "node tools/playtest/repro.mjs"`;
   - em `.gitignore`, adicionar `tools/playtest/out/`.
7. Você escolhe quais bugs corrigir. Sugestão de ordem: 1, 2, 3, 5, 4, 7, 6, 9.
8. **task-observer (combinado no início):**
   - rodar a revisão das observações abertas (você escolheu "Após o playtest");
   - ler o histórico do projeto e propor os princípios iniciais que ele justifica (você escolheu "Sim, propor").

## Ideias de melhoria (para discutir)

- **Fim de run legível no solo:** a run acaba com 2 demissões seguidas (ou 3 no total), em vez de depender de os NPCs caírem juntos; ou os NPCs passam a seguir a mesma Suspeita.
- **Quebrar a espiral:** voltar da demissão com 30–35; a entrega de tarefa e o café aliviarem × curva (hoje só a punição escala); teto de 80 na Suspeita de início do dia.
- **Arriscar tem que compensar:** bônus de FUN para quem joga com o chefe fora; clutch mais alcançável (janela maior ou som de "agora!"), já que nenhum robô conseguiu.
- **Dia 1 com o X9 rondando de verdade**, para ensinar a esconder a tela.
- **Tarefas sem armadilha:** rampa pausada durante a execução; café do chefe acessível; poder largar o item (ou sentar já larga).
- **Bloquear o `?debug` no build de produção.**
