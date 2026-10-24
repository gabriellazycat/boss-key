# BOSS KEY — ASSETS v1.1 (arte 3D e sons)

> Lista do que produzir quando o projeto for colocado em prática (Fase 8 do roadmap; na Fase 1 usar primitivas). Ver [GDD.md](GDD.md) seção 16-17 e [TDD.md](TDD.md).

---

## 1. Pipeline de modelos (Blender via MCP → glTF)

1. `get_addon_status` e `get_scene_info` antes de começar; trabalhar via `execute_blender_code` (bpy) e conferir com `look`.
2. **Unidade:** 1 unidade Blender = 1 metro. **Eixo:** exportar glTF com +Y up. **Origem** na base/centro de cada objeto.
3. **Formato:** `.glb`, compressão meshopt/Draco (skill `threejs-asset-pipeline`). Nomes em `snake_case` com prefixo: `ball_`, `prop_`, `env_`.
4. **Materiais:** Principled BSDF com **cor base chapada** (sem textura), `roughness 0,6-0,9`, `metallic 0`. Nomes: `mat_ball_body`, `mat_visor`, etc., para o código poder recolorir (gravatas, times).
5. **Poly budget:** ver coluna "tris". Bolas < 1,5 k.
6. **Props de biblioteca (Poly Haven / Poly Pizza / Sketchfab):** só quando mais barato que modelar; ajustar escala/cor ao estilo; registrar fonte e licença neste arquivo (seção 5).
7. **`generate_3d`:** só para um prop difícil, **depois de perguntar ao usuário** (gasta crédito).
8. Atlas único de materiais quando possível; instancing para divisórias, lâmpadas, colunas, lixeiras.

## 2. Paleta (proposta inicial, ajustável)

| Uso | Cor |
|---|---|
| Funcionário (corpo) | `#7F93A6` azul-acinzentado |
| Gravata (6 opções) | azul `#2F5FA8` · verde `#3E9B5B` · laranja `#E0832B` · rosa `#D45A8B` · amarelo `#E6C43A` · roxo `#7A5BC0` |
| Estagiário X9 | `#A8D5A2` verde-claro (hélice `#E6C43A`) |
| Chefe | `#6E1F33` vinho · gravata `#111111` |
| O Dono | `#1A1A1F` preto fosco · gravata `#D4AF37` · olhos luminosos `#FFE9A8` |
| Visor / olhos | visor `#0B0B0E` · olho `#F4F4F0` · pupila `#111111` |
| Fantasma | corpo `#7F93A6` a 40% de opacidade |
| Carpete | `#3F6C9A` |
| Paredes | `#EDE8DC` |
| Divisórias | `#C9CFD6` |
| Madeira (mesas) | `#C79F6B` |
| Tela (planilha) | `#E8F2E8` |
| Luz | quente ~3800 K (`#FFE9C4`) |
| Anel de time | A `#4DA3FF` · B `#FF8A3D` |

## 3. Modelos 3D

### 3.1 Personagens
| Arquivo | Descrição | Tris | Observações |
|---|---|---|---|
| `ball_employee.glb` | Esfera levemente amassada + visor + 2 olhos + pupilas + gravata | ≤ 1,5 k | Olhos como objetos separados (`eye_L`, `eye_R`, `pupil_L`, `pupil_R`) para animar escala; gravata recolorível (`mat_tie`) |
| `ball_boss.glb` | Escala 1,9, vinho, olhos menores e juntos | ≤ 1,8 k | Mesma estrutura de nós |
| `ball_x9.glb` | Escala 0,8, verde-claro, **hélice** no topo (nó `propeller` girável) | ≤ 1,5 k | |
| `ball_dono.glb` | Escala 2,2, preto, gravata dourada, olhos emissivos | ≤ 1,8 k | Chaves penduradas (`prop_keys`) para a animação do tilintar |
| (código) | Fantasma = `ball_employee` com material transparente | — | |

Estados do olho (todos por escala/posição no código): Normal · Alert (1,25×) · Clutch (1,6×) · Caught (olhos viram um traço X — usar um segundo conjunto de meshes `eye_x_L/R`) · Tédio (pálpebra: plano que cobre metade do olho).

### 3.2 Ambiente
| Arquivo | Descrição | Tris |
|---|---|---|
| `env_office_shell.glb` | Piso, paredes, teto com painéis de luz (fluorescentes emissivos), rodapé; sala do chefe e banheiros como volumes com vãos de porta | ≤ 20 k |
| `env_boss_room.glb` | Mesa elevada 0,4 m, cadeira, estante, **bandeja** de café na entrada, porta animável (`door` com pivô) | ≤ 8 k |
| `env_bathroom.glb` | Porta com pictograma (fem./masc.), box, pia | ≤ 5 k cada |
| `env_kitchen.glb` | Balcão, **máquina de café** (nó `coffee_spout`), geladeira, mesa de pizza, **disjuntor** (caixa na parede), lixeira | ≤ 10 k |
| `env_printer_area.glb` | Impressora (bandeja, luz de erro), mesa do carimbo | ≤ 4 k |
| `env_meeting_table.glb` | Mesa grande + 6 cadeiras | ≤ 4 k |
| `env_column.glb` | Coluna 0,8 m (instanciada ×4) | ≤ 200 |
| `env_partition.glb` | Divisória baixa 1,1 m (instanciada) | ≤ 300 |

### 3.3 Mobiliário e props
| Arquivo | Descrição | Tris |
|---|---|---|
| `prop_desk.glb` | Mesa de cabine com gaveta (`drawer`), monitor (`screen` com UV 1:1 para a CanvasTexture), teclado, lixeira ao lado | ≤ 2 k |
| `prop_chair.glb` | Cadeira de rodinhas (para a corrida) | ≤ 800 |
| `prop_coffee_cup.glb` | Copo de papel | ≤ 150 |
| `prop_paper_ball.glb` | Bola de papel amassada | ≤ 100 |
| `prop_snack.glb` | Lanchinho + migalhas | ≤ 150 |
| `prop_puddle` | Poça de café (decal no código) | — |
| `prop_pizza_box.glb` / `prop_pizza_slice.glb` | Caixa e fatia | ≤ 300 |
| `prop_headphones.glb` | Fones na bola | ≤ 200 |
| `prop_security_camera.glb` | Câmera fixa de teto | ≤ 300 |
| `prop_flashlight.glb` | Lanterna do chefe (blecaute) | ≤ 200 |
| `prop_phone.glb` | Telefone do chefe (dedurar) | ≤ 150 |
| `prop_plant.glb`, `prop_clock.glb`, `prop_water_cooler.glb` | Decoração (opcionais, P2) | ≤ 500 cada |

### 3.4 Extras de código (sem modelo)
Anel de time no chão · anel vermelho de calor · seta de ping · cone de visão (debug) · sombra do Dono · setas/ícones de HUD.

## 4. Sons

> **Regra:** sintetizar no código tudo que for simples (osciladores + ruído + envelope). Usar biblioteca livre só para o que soa mal sintetizado. Todos os sons 3D precisam de `maxDistance` e curva de atenuação; todos os sons de gameplay têm legenda (ver `Subtitles` no TDD).

### 4.1 Sons essenciais de gameplay (3D ou globais)
| Som | Tipo | Fonte | Observação |
|---|---|---|---|
| Porta do chefe abrindo | global | Sintetizado (rangido) ou biblioteca | **Principal aviso** |
| Passos do chefe (3 variações) | 3D | Sintetizado (thump grave) | Cadência acelera com a velocidade |
| Passos do X9 | 3D | Sintetizado (leve/rápido) | |
| Tilintar de chaves (Dono) | 3D | Sintetizado/biblioteca | Raio 12 m |
| Grito do X9 ("EI!") | global | Sintetizado (apito agudo) | Sem voz humana |
| Cooler (ventilador) | 3D, loop | Sintetizado (ruído filtrado) | Frequência e volume ↑ com o calor |
| Digitação / planilha | 3D, loop | Sintetizado (cliques) | |
| Tick da planilha (acerto/erro) | UI | Sintetizado | |
| Tiro, acerto, morte do jogador | 3D | Sintetizado | |
| Pescaria (splash discreto) | UI | Sintetizado | Silencioso para o salão |
| Vídeo curto (jingle falso) | 3D | Sintetizado | Vaza 8 m; muda com fones |
| Impressora (imprimindo) / **travada (alarme)** | 3D | Biblioteca + sintetizado | Alarme: raio 15 m |
| Máquina de café, **café derramando** | 3D | Biblioteca | |
| Crocar/comer | 3D | Biblioteca | |
| Papel arremessado, acerto, erro | 3D | Sintetizado | |
| Rodinhas da cadeira | 3D, loop | Biblioteca | Raio 6 m |
| Tossir · Pigarro · Bater na mesa · Assobio | 3D | Sintetizado/biblioteca | Emotes 1-4 |
| Ping | UI | Sintetizado | |
| Descarga / porta do banheiro | 3D | Biblioteca | Denuncia o esconderijo |
| Fones (H) | UI | Sintetizado | |
| Estalo do blecaute, volta da luz | global | Sintetizado | |
| Lanterna (clique) | 3D | Sintetizado | |
| Gongo da reunião | global | Sintetizado | |
| Alerta "Suspeito" do chefe (nota curta) | 3D | Sintetizado (curto) | Aviso antes do CheckScreen |
| **Clutch** (whoosh + stinger) | UI | Sintetizado | Câmera lenta de 0,5 s |
| **Pego** (stinger) | UI | Sintetizado | Visão do chefe |
| Suspiro/pé batendo (Tédio) | 3D | Sintetizado | A cada 20 s |
| Fim de dia / vitória / derrota | UI | Sintetizado | |
| Cliques de UI | UI | Sintetizado | |

### 4.2 Ambiente e música
| Som | Fonte |
|---|---|
| Ruído de escritório (hum baixo + ar-condicionado) | Sintetizado, loop |
| Música de elevador muito leve (loop curto, 60-90 s) | Biblioteca livre ou sintetizada; **desligável** |

### 4.3 Mixagem
`master` → `sfx` (gameplay, 3D) · `music` · `ui`. Prioridade: avisos do chefe > ruídos de atividade > ambiente > música. Ducking leve da música quando a porta do chefe abre.

## 5. Registro de bibliotecas externas
> Preencher na hora de usar: nome do arquivo, fonte (URL), autor, licença (preferir CC0), data.

| Arquivo | Fonte | Licença | Data |
|---|---|---|---|
| (vazio) | | | |
