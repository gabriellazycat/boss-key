extends Node
## Todos os números do jogo moram aqui (autoload "B"). Nenhum número mágico fora deste arquivo.

# ---------------------------------------------------------------- dia e run
const DAY_SECONDS := 480.0            # 8 min reais = 09:00 → 18:00
const DAY_START_MIN := 9 * 60
const DAY_END_MIN := 18 * 60
const CALM_SECONDS := 40.0            # calmaria no começo do dia: o chefe não sai
const STRIKES_MAX := 3
const MAX_PLAYERS := 4

## minutos de relógio do jogo para um instante t (s) do dia
static func clock_min(t: float) -> int:
	return DAY_START_MIN + int((DAY_END_MIN - DAY_START_MIN) * clampf(t / DAY_SECONDS, 0.0, 1.0))

static func clock_text(t: float) -> String:
	var m := clock_min(t)
	return "%02d:%02d" % [m / 60, m % 60]

## segundos do dia para um horário "HH:MM"
static func t_of(hh: int, mm: int) -> float:
	return float(hh * 60 + mm - DAY_START_MIN) / float(DAY_END_MIN - DAY_START_MIN) * DAY_SECONDS

## curva de dificuldade: o chefe fica mais afiado a cada dia
static func sharp(day: int) -> float:
	return pow(1.08, maxi(day - 1, 0))

# ---------------------------------------------------------------- suspeita
const SUS_MAX := 100.0
const SUS_DOUBLE_EVERY := 1.5         # a taxa dobra a cada 1,5 s de visão contínua
const SUS_FORGET := 1.5               # fora da vista por 1,5 s, o contador zera
const SUS_MULT_CAP := 8.0             # teto do multiplicador
const SUS_RATE := {                   # pontos/s no dia 1, antes de dobrar
	"leve": 2.5,     # em pé à toa
	"media": 7.0,    # diversão física, jogo na tela visto de perto
	"grave": 14.0,   # item do assalto na mão, dentro da sala do chefe
}
const SUS_WORK_DECAY := 0.35          # sentado trabalhando e sem ser visto: desce por segundo
const SUS_SCREEN_CAUGHT := 28.0       # o chefe confere a tela e vê jogo
const SUS_CAUGHT_CHASE := 30.0        # alcançado na perseguição com item
const SUS_DAY_RESET := 0.4            # de um dia para o outro sobra 40% (nunca acima de 40)
const SUS_DAY_CARRY_MAX := 40.0

# ---------------------------------------------------------------- chefe
const BOSS_WALK := 2.1
const BOSS_WALK_PER_DAY := 0.06
const BOSS_CHASE := 3.6
const BOSS_FOV_DEG := 75.0
const BOSS_RANGE := 13.0
const BOSS_SCREEN_RANGE := 3.2        # distância para ler a tela pelas costas
const BOSS_IDENTIFY := 0.65           # tempo para identificar a janela na tela
const BOSS_CHECK_TIME := 2.6          # quanto tempo fica atrás de cada mesa
const BOSS_DOOR_PAUSE := 2.4          # parado na porta olhando o salão
const BOSS_WARN_MIN := 6.0            # aviso mínimo entre o som da porta e a 1ª mesa
const CLUTCH_WINDOW := 0.5            # trocar nos últimos 0,5 s antes de identificar
const CLUTCH_FUN := 6.0
const CHASE_GIVE_UP := 6.0            # sem ver por 6 s, desiste da perseguição
const CATCH_DIST := 1.1

# ---------------------------------------------------------------- agenda
## tipos de compromisso: duração em segundos (no dia de 8 min)
const AGENDA_KIND := {
	"ronda":    {"nome": "Ronda pelo salão", "icone": "ronda"},
	"cafe":     {"nome": "Café na copa", "icone": "cafe", "dur": 28.0},
	"telefone": {"nome": "Telefonema (na sala)", "icone": "telefone", "dur": 40.0},
	"impressao":{"nome": "Buscar impressão", "icone": "impressao", "dur": 18.0},
	"almoco":   {"nome": "Almoço fora", "icone": "almoco", "dur": 120.0},
	"reuniao":  {"nome": "Reunião no 11º", "icone": "reuniao", "dur": 55.0},
}
const AGENDA_RONDAS := Vector2i(3, 4)
const LUNCH_SHRINK_PER_DAY := 6.0     # o almoço encurta por dia...
const LUNCH_MIN := 75.0               # ...até este mínimo
const SECOND_ABSENCE_FROM_DAY := 3

# ---------------------------------------------------------------- trabalho (cota do time)
const QUOTA_SOLO := 95.0              # pontos de trabalho no dia 1 (solo, antes do ×0,7 de treino)
const QUOTA_PER_DAY := 6.0
const QUOTA_TEAM_MUL := 0.75          # por jogador no multi
const WORK_HIT := 0.5                 # planilha: acerto
const WORK_PERFECT := 0.8             # planilha: perfeito
const WORK_MISS_SUS := 1.0            # erro na planilha vira suspeita se o chefe estiver perto
const WORK_SORT := 0.7                # triagem: e-mail certo
const RHYTHM_BEAT := 0.85             # s entre batidas da planilha
const RHYTHM_OK := 0.16
const RHYTHM_PERFECT := 0.06

# ---------------------------------------------------------------- FUN
const FUN_GOAL_BASE := 40.0
const FUN_GOAL_PER_DAY := 6.0
const FUN_RISK_MUL := 1.25            # FUN com o chefe fora do andar
const FUN_SHOOTER_KILL := 0.3
const FUN_FISH := {"comum": 1.5, "raro": 4.0, "lenda": 8.0}
const FUN_BASKET := 3.0
const FUN_SNACK := 4.0
const FUN_HEIST := 25.0               # assalto completo (dividido pelo time no multi)
const FUN_HEIST_STEP := 3.0

# ---------------------------------------------------------------- distrações e esconderijo
const PRINTER_JAM_HOLD := 15.0
const PRINTER_COOLDOWN := 70.0
const RADIO_HOLD := 9.0
const RADIO_COOLDOWN := 50.0
const HIDE_MAX := 10.0
const HIDE_COOLDOWN := 30.0
const NOISE_RADIUS := {"passo": 2.5, "cesta": 6.0, "lanche": 4.0, "impressora": 30.0, "radio": 30.0, "gaveta": 5.0}

# ---------------------------------------------------------------- loja (noite)
## upgrades permanentes da run: preços por nível
const UPGRADES := {
	"teclado":  {"nome": "Teclado mecânico", "desc": "Trabalho rende +20% por nível", "precos": [14, 28, 45]},
	"tenis":    {"nome": "Tênis de corrida", "desc": "Anda 10% mais rápido por nível", "precos": [12, 24, 40]},
	"pantufa":  {"nome": "Pantufas", "desc": "Passos mais baixos (barulho -30%/nível)", "precos": [10, 22, 36]},
	"maos":     {"nome": "Mãos rápidas", "desc": "Painéis do assalto 15% mais rápidos/nível", "precos": [12, 26, 42]},
	"cooler":   {"nome": "Cooler silencioso", "desc": "Jogos do PC dão +15% de FUN/nível", "precos": [14, 30, 50]},
	"retrovisor": {"nome": "Retrovisor no monitor", "desc": "Mostra o chefe atrás de você", "precos": [22]},
	"atestado": {"nome": "Atestado médico", "desc": "Apaga 1 strike (1 por run)", "precos": [60]},
}
const UPGRADE_SPEED := 0.10
const UPGRADE_WORK := 0.20
const UPGRADE_QUIET := 0.30
const UPGRADE_HANDS := 0.15
const UPGRADE_FUN := 0.15

# ---------------------------------------------------------------- jogador
const WALK := 3.4
const RUN := 5.4
const CROUCH := 1.8
const MOUSE_SENS := 0.0022
const INTERACT_DIST := 2.3
const EYE_H := 1.45
const SIT_EYE_H := 1.18

# ---------------------------------------------------------------- instinto (barulho → espiada)
const INSTINCT_PEEK := 100.0          # cheio: o chefe abre a porta e espia o salão
const INSTINCT_BALLOPS := 2.6         # por segundo de Ball Ops (tiros fazem barulho)
const INSTINCT_DECAY := 0.8           # por segundo
const PEEK_TIME := 4.0
