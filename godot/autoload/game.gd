extends Node
## Estado da run e do dia. O host é a autoridade: ele simula, os outros recebem o pacote.
## No solo o peer é offline e o próprio jogador é o host — o mesmo código vale para tudo.

signal phase_changed(phase: String)
signal popup(text: String, pos: Vector3, color: Color)
signal toast(text: String, kind: String)
signal day_report(rep: Dictionary)
signal run_over(summary: Dictionary)
signal changed

const C_SUS := Color(1.0, 0.33, 0.33)
const C_FUN := Color(1.0, 0.82, 0.25)
const C_WORK := Color(0.35, 0.85, 1.0)
const C_GOOD := Color(0.45, 1.0, 0.55)

var in_run := false
var world: Node3D            # o mundo ativo (registra-se sozinho)
var run_seed := 0
var day := 1
var strikes := 0
var phase := "menu"          # elevator_up · day · fired · elevator_down · shop · over
var t := 0.0                 # segundos do dia
var quota := 0.0
var quota_goal := 70.0
var fun_goal := 30.0
var agenda: Array = []       # [{t, kind, dur, state}] state: "" · "agora" · "feito" · "atrasado"
var heist := {}              # {id, step, done}
var wallet := 0
var upgrades := {}           # id → nível
var used_atestado := false
## por jogador: fun (hoje), fun_run, sus, fired, reasons{motivo: total}, clutches
var ps := {}
## estado de pose/atividade enviado por cada jogador (o host reenvia a todos)
var pstate := {}
var boss_state := {}         # pacote do chefe (posição, direção, estado, rosto)
var items := {}              # itens do assalto: id → {pos, holder}
var report := {}
var _sync_acc := 0.0
var _pstate_acc := 0.0

# ------------------------------------------------------------------ ciclo da run
func host() -> bool:
	return Net.is_host()

func me() -> int:
	return Net.my_id()

func my() -> Dictionary:
	return ps.get(me(), {})

func start_run(seed_value := 0) -> void:
	if not host():
		return
	run_seed = seed_value if seed_value != 0 else randi()
	_begin_run.rpc(run_seed, Net.players.keys())

@rpc("authority", "call_local", "reliable")
func _begin_run(seed_value: int, ids: Array) -> void:
	in_run = true
	run_seed = seed_value
	day = 1
	strikes = 0
	wallet = 0
	upgrades = {}
	used_atestado = false
	ps = {}
	for id in ids:
		ps[id] = {"fun": 0.0, "fun_run": 0.0, "sus": 0.0, "fired": false, "reasons": {}, "clutches": 0}
	get_tree().change_scene_to_file.call_deferred("res://world/world.tscn")

## chamado pelo mundo quando termina de montar
func world_ready(w: Node3D) -> void:
	world = w
	if host():
		begin_day()

func begin_day() -> void:
	if not host():
		return
	var rng := day_rng()
	var n: int = maxi(ps.size(), 1)
	var team := 1.0 if n == 1 else B.QUOTA_TEAM_MUL * n
	var light := 0.7 if day == 1 else 1.0
	quota_goal = roundf((B.QUOTA_SOLO + B.QUOTA_PER_DAY * (day - 1)) * team * light)
	fun_goal = roundf((B.FUN_GOAL_BASE + B.FUN_GOAL_PER_DAY * (day - 1)) * team * light)
	agenda = Agenda.build(day, rng)
	heist = {"id": Heists.pick(day, rng), "step": 0, "done": false}
	items = Heists.initial_items(heist.id, rng)
	_day_start.rpc(day, quota_goal, fun_goal, agenda, heist, items, strikes, wallet, upgrades)

@rpc("authority", "call_local", "reliable")
func _day_start(d: int, qg: float, fg: float, ag: Array, h: Dictionary, it: Dictionary, s: int, w: int, up: Dictionary) -> void:
	day = d
	quota_goal = qg
	fun_goal = fg
	agenda = ag
	heist = h
	items = it
	strikes = s
	wallet = w
	upgrades = up
	t = 0.0
	quota = 0.0
	report = {}
	for id in ps:
		var p: Dictionary = ps[id]
		p.fun = 0.0
		p.fired = false
		p.reasons = {}
		p.clutches = 0
		p.sus = minf(p.sus * B.SUS_DAY_RESET, B.SUS_DAY_CARRY_MAX)
	set_phase("elevator_up")

func day_rng(salt := 0) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = hash([run_seed, day, salt])
	return r

func set_phase(p: String) -> void:
	phase = p
	phase_changed.emit(p)

## o elevador da manhã terminou: começa o expediente
func start_shift() -> void:
	if host():
		_shift.rpc()

@rpc("authority", "call_local", "reliable")
func _shift() -> void:
	t = 0.0
	set_phase("day")

func _process(delta: float) -> void:
	if not in_run:
		return
	if phase == "day":
		t += delta
		if host():
			_host_tick(delta)
	if Net.online():
		_net_tick(delta)

func _host_tick(_delta: float) -> void:
	if t >= B.DAY_SECONDS:
		end_day("fim do expediente")

func end_day(why: String) -> void:
	if not host() or phase != "day":
		return
	var rep := {"day": day, "why": why, "quota": quota, "quota_goal": quota_goal, "players": {}, "strikes_add": [], "fun_team": team_fun(), "fun_goal": fun_goal}
	var count := day > 1      # o 1º dia é treino: não custa strike
	if quota < quota_goal:
		rep.strikes_add.append("Cota de trabalho não batida (%d de %d)" % [int(quota), int(quota_goal)])
	if team_fun() < fun_goal:
		rep.strikes_add.append("Dia chato: FUN abaixo da meta (%d de %d)" % [int(team_fun()), int(fun_goal)])
	for id in ps:
		var p: Dictionary = ps[id]
		rep.players[id] = {"name": Net.players.get(id, {}).get("name", "?"), "fun": p.fun, "sus": p.sus, "fired": p.fired, "reasons": p.reasons, "clutches": p.clutches}
		if p.fired:
			rep.strikes_add.append("%s foi demitido(a)" % rep.players[id].name)
	var add: int = rep.strikes_add.size() if count else 0
	rep["counted"] = count
	var earned := 0
	for id in ps:
		earned += int(ps[id].fun)
	rep["earned"] = earned
	_day_over.rpc(rep, add, earned)

@rpc("authority", "call_local", "reliable")
func _day_over(rep: Dictionary, add: int, earned: int) -> void:
	strikes += add
	wallet += earned
	for id in ps:
		ps[id].fun_run += ps[id].fun
	report = rep
	report["strikes"] = strikes
	day_report.emit(report)
	if strikes >= B.STRIKES_MAX:
		var total := 0.0
		for id in ps:
			total += ps[id].fun_run
		var summary := {"days": day, "fun": total}
		Settings.best_days = maxi(Settings.best_days, day)
		Settings.best_fun = maxi(Settings.best_fun, int(total))
		Settings.save()
		set_phase("over")
		run_over.emit(summary)
	else:
		set_phase("elevator_down")

## a noite acabou (loja): próximo dia
func next_day() -> void:
	if not host():
		return
	day += 1
	begin_day()

func quit_run() -> void:
	in_run = false
	world = null
	phase = "menu"
	Net.close()
	get_tree().change_scene_to_file.call_deferred("res://main.tscn")

func team_fun() -> float:
	var s := 0.0
	for id in ps:
		s += ps[id].fun
	return s

func boss_away() -> bool:
	return boss_state.get("away", false)

func on_player_left(id: int) -> void:
	ps.erase(id)
	pstate.erase(id)
	if world and world.has_method("remove_player"):
		world.remove_player(id)

# ------------------------------------------------------------------ ações dos jogadores
## Toda ação que muda o estado compartilhado passa por aqui (vai para o host).
func act(kind: String, data := {}) -> void:
	if host():
		_apply(me(), kind, data)
	else:
		_act.rpc_id(1, kind, data)

@rpc("any_peer", "reliable")
func _act(kind: String, data: Dictionary) -> void:
	if host():
		_apply(multiplayer.get_remote_sender_id(), kind, data)

func _apply(id: int, kind: String, data: Dictionary) -> void:
	if not ps.has(id) or phase != "day":
		return
	var p: Dictionary = ps[id]
	match kind:
		"work":
			if p.fired:
				return
			var amt: float = clampf(float(data.get("amt", 1.0)), 0.0, 3.0) * (1.0 + B.UPGRADE_WORK * upgrades.get("teclado", 0))
			var before := quota
			quota += amt
			if before < quota_goal and quota >= quota_goal:
				_fx.rpc("toast", "COTA BATIDA! Agora é só enrolar.", "good", Vector3.ZERO)
				_fx.rpc("sfx", "quota_done", "", Vector3.ZERO)
		"fun":
			if p.fired:
				return
			var amt: float = clampf(float(data.get("amt", 1.0)), 0.0, 40.0)
			if boss_away():
				amt *= B.FUN_RISK_MUL
			if data.get("src", "") == "pc":
				amt *= 1.0 + B.UPGRADE_FUN * upgrades.get("cooler", 0)
			p.fun += amt
			if data.has("pos"):
				_fx.rpc("popup", "+%d FUN" % ceili(amt), "fun", data.pos)
		"clutch":
			p.clutches += 1
			p.fun += B.CLUTCH_FUN
			_fx_to(id, "clutch", "", Vector3.ZERO)
		"heist":
			Heists.host_action(id, data)
		"distract":
			if world:
				world.host_distract(id, str(data.get("what", "")))
		"buy":
			_buy(id, str(data.get("up", "")))
		"noise":
			if world and world.boss:
				world.boss.hear(data.get("pos", Vector3.ZERO), float(data.get("r", 3.0)), id)
		"instinct":
			if world and world.boss:
				world.boss.add_instinct(clampf(float(data.get("amt", 0.0)), 0.0, 10.0))

## efeitos visuais/sonoros para todo mundo
@rpc("authority", "call_local", "reliable")
func _fx(kind: String, a: String, b: String, pos: Vector3) -> void:
	match kind:
		"toast": toast.emit(a, b)
		"popup": popup.emit(a, pos, C_FUN if b == "fun" else (C_SUS if b == "sus" else (C_WORK if b == "work" else C_GOOD)))
		"sfx":
			if pos == Vector3.ZERO:
				Sfx.play(a)
			else:
				Sfx.at(a, pos)
		"clutch":
			if world:
				world.on_clutch()
		_:
			if world:
				world.on_fx(kind, a, b, pos)

func fx(kind: String, a := "", b := "", pos := Vector3.ZERO) -> void:
	if host():
		_fx.rpc(kind, a, b, pos)

func _fx_to(id: int, kind: String, a: String, pos: Vector3) -> void:
	if id == me():
		_fx(kind, a, "", pos)
	else:
		_fx.rpc_id(id, kind, a, "", pos)

# ------------------------------------------------------------------ suspeita (só o host chama)
func add_sus(id: int, amt: float, reason: String, pos := Vector3.ZERO) -> void:
	if not host() or not ps.has(id) or phase != "day":
		return
	var p: Dictionary = ps[id]
	if p.fired:
		return
	p.sus = clampf(p.sus + amt, 0.0, B.SUS_MAX)
	if amt > 0.0:
		p.reasons[reason] = p.reasons.get(reason, 0.0) + amt
	if p.sus >= B.SUS_MAX:
		fire(id, reason)

func fire(id: int, reason: String) -> void:
	var p: Dictionary = ps[id]
	p.fired = true
	_fired.rpc(id, reason)
	var alive := 0
	for k in ps:
		if not ps[k].fired:
			alive += 1
	if alive == 0:
		get_tree().create_timer(4.0).timeout.connect(func(): end_day("todos demitidos"))

@rpc("authority", "call_local", "reliable")
func _fired(id: int, reason: String) -> void:
	if ps.has(id):
		ps[id].fired = true
	var who: String = Net.players.get(id, {}).get("name", "?")
	if id == me():
		Sfx.play("fired")
		toast.emit("DEMITIDO! (%s)" % reason, "bad")
		if world:
			world.on_me_fired(reason)
	else:
		toast.emit("%s foi demitido(a)!" % who, "bad")

# ------------------------------------------------------------------ loja
func upgrade_price(up: String) -> int:
	var def: Dictionary = B.UPGRADES.get(up, {})
	var lvl: int = upgrades.get(up, 0)
	if def.is_empty() or lvl >= def.precos.size():
		return -1
	if up == "atestado" and (used_atestado or strikes == 0):
		return -1
	return int(def.precos[lvl])

func buy(up: String) -> void:
	if host():
		_buy(me(), up)
	else:
		_buy_req.rpc_id(1, up)

@rpc("any_peer", "reliable")
func _buy_req(up: String) -> void:
	if host():
		_buy(multiplayer.get_remote_sender_id(), up)

func _buy(_id: int, up: String) -> void:
	var price := upgrade_price(up)
	if price < 0 or wallet < price:
		return
	wallet -= price
	if up == "atestado":
		used_atestado = true
		strikes = maxi(strikes - 1, 0)
	upgrades[up] = upgrades.get(up, 0) + 1
	_shop_state.rpc(wallet, upgrades, strikes, used_atestado)

@rpc("authority", "call_local", "reliable")
func _shop_state(w: int, up: Dictionary, s: int, at: bool) -> void:
	wallet = w
	upgrades = up
	strikes = s
	used_atestado = at
	Sfx.play("shop_buy")
	changed.emit()

func up_level(up: String) -> int:
	return upgrades.get(up, 0)

# ------------------------------------------------------------------ rede: pacotes periódicos
func _net_tick(delta: float) -> void:
	_pstate_acc += delta
	if _pstate_acc >= 1.0 / 15.0 and world and world.local_player:
		_pstate_acc = 0.0
		var st: Dictionary = world.local_player.pack()
		if host():
			pstate[me()] = st
		else:
			_send_pstate.rpc_id(1, st)
	if host():
		_sync_acc += delta
		if _sync_acc >= 0.1:
			_sync_acc = 0.0
			var lite := {}
			for id in ps:
				lite[id] = [ps[id].fun, ps[id].sus, ps[id].fired]
			_sync.rpc({"t": t, "q": quota, "ps": lite, "st": pstate, "boss": boss_state, "it": items, "h": heist, "ag": _agenda_states()})

@rpc("any_peer", "unreliable_ordered")
func _send_pstate(st: Dictionary) -> void:
	if host():
		pstate[multiplayer.get_remote_sender_id()] = st

@rpc("authority", "unreliable_ordered")
func _sync(pk: Dictionary) -> void:
	t = pk.t
	quota = pk.q
	for id in pk.ps:
		if ps.has(id):
			ps[id].fun = pk.ps[id][0]
			ps[id].sus = pk.ps[id][1]
			ps[id].fired = pk.ps[id][2]
	var mine = pstate.get(me())
	pstate = pk.st
	if mine != null:
		pstate[me()] = mine
	boss_state = pk.boss
	items = pk.it
	heist = pk.h
	var states: Array = pk.ag
	for i in mini(states.size(), agenda.size()):
		agenda[i].state = states[i]

func _agenda_states() -> Array:
	var a := []
	for e in agenda:
		a.append(e.state)
	return a
