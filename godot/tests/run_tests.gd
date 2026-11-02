extends Node
## Testes de lógica (sem janela):
##   godot --headless --path godot res://tests/tests.tscn
## Cobrem as regras que mais quebram sem ninguém ver: relógio, agenda, assaltos, preços, metas.

var _fails := 0
var _count := 0

func _ready() -> void:
	await get_tree().process_frame
	var B = get_node("/root/B")
	var Game = get_node("/root/Game")
	_test_clock(B)
	_test_agenda(B)
	_test_heists(B)
	_test_shop(B, Game)
	_test_goals(B)
	print("%d testes, %d falhas" % [_count, _fails])
	get_tree().quit(1 if _fails > 0 else 0)

func check(cond: bool, what: String) -> void:
	_count += 1
	if not cond:
		_fails += 1
		print("FALHOU: ", what)

func _test_clock(B) -> void:
	check(B.clock_text(0.0) == "09:00", "o dia começa às 09:00")
	check(B.clock_text(B.DAY_SECONDS) == "18:00", "o dia termina às 18:00")
	check(absf(B.t_of(13, 30) - B.DAY_SECONDS * 0.5) < 0.01, "13:30 é a metade do dia")

func _test_agenda(B) -> void:
	for day in range(1, 9):
		var rng := RandomNumberGenerator.new()
		rng.seed = 1000 + day
		var ag: Array = Agenda.build(day, rng)
		var away := 0
		var rondas := 0
		for i in ag.size():
			var e: Dictionary = ag[i]
			check(e.t >= B.CALM_SECONDS, "dia %d: nada na calmaria (%s às %s)" % [day, e.kind, B.clock_text(e.t)])
			check(e.t + e.get("dur", 0.0) < B.DAY_SECONDS, "dia %d: %s termina antes das 18h" % [day, e.kind])
			if i > 0:
				check(e.t >= ag[i - 1].t, "dia %d: agenda em ordem" % day)
			if Agenda.away_kind(e.kind):
				away += 1
			if e.kind == "ronda":
				rondas += 1
		check(away >= 1, "dia %d: o chefe sai do andar ao menos 1 vez (janela do assalto)" % day)
		check(rondas >= 2, "dia %d: ao menos 2 rondas (%d)" % [day, rondas])
		check(ag.size() >= 5, "dia %d: agenda cheia o bastante (%d)" % [day, ag.size()])
	# mesma semente = mesma agenda (todos da sala veem igual)
	var r1 := RandomNumberGenerator.new()
	r1.seed = 7
	var r2 := RandomNumberGenerator.new()
	r2.seed = 7
	check(str(Agenda.build(3, r1)) == str(Agenda.build(3, r2)), "agenda determinística pela semente")

func _test_heists(_B) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	check(Heists.pick(1, rng) == "grampeador", "o 1º dia é sempre o grampeador (tutorial)")
	for id in Heists.DEFS:
		check(Heists.DEFS[id].etapas.size() >= 2, "%s tem pelo menos 2 etapas" % id)
		var it := Heists.initial_items(id, rng)
		if id == "grampeador" or id == "papel":
			check(it.get("segredo", "") in Heists.SEARCH_SPOTS, "%s: o segredo está num lugar revirável" % id)

func _test_shop(B, Game) -> void:
	Game.upgrades = {}
	Game.strikes = 0
	Game.used_atestado = false
	for up in B.UPGRADES:
		var precos: Array = B.UPGRADES[up].precos
		for i in range(1, precos.size()):
			check(precos[i] > precos[i - 1], "%s: cada nível custa mais" % up)
	check(Game.upgrade_price("atestado") == -1, "atestado sem strikes não aparece")
	Game.strikes = 1
	check(Game.upgrade_price("atestado") > 0, "atestado com strike tem preço")
	Game.upgrades = {"teclado": 3}
	check(Game.upgrade_price("teclado") == -1, "teclado no nível máximo")
	Game.strikes = 0
	Game.upgrades = {}

func _test_goals(B) -> void:
	# a meta do dia 1 (treino, ×0,7) cabe em ~45% do dia trabalhando num ritmo humano (~0,45/s)
	var q1: float = B.QUOTA_SOLO * 0.7
	check(q1 / 0.45 < B.DAY_SECONDS * 0.55, "cota do dia 1 cabe no dia (%.0f pontos)" % q1)
	check(B.FUN_HEIST < (B.FUN_GOAL_BASE * 0.7), "o assalto sozinho não bate a meta de FUN do dia 1")
	check(B.CALM_SECONDS < B.t_of(11, 30), "a calmaria acaba antes do almoço")
