extends Node
## Robô de teste (--autoplay): joga o dia como uma pessoa faria, tira prints em momentos-chave e
## escreve um log. Perfis: --perfil=cuidadoso|ganancioso|desastrado. --days=N, --fast, --shots=pasta.

var world: Node
var p: Player
var profile := "cuidadoso"
var target := Vector3.ZERO
var goal := ""                 # o que o robô está tentando agora
var _react := 0.0
var _shot_dir := "user://shots"
var _shots_taken := {}
var _log_t := 0.0
var _days := 1
var _stats := {"seen_close": 0, "idle": 0.0, "clutch_try": 0}
var _prev_lamp := false
var _rng := RandomNumberGenerator.new()
var _work_mode := true
var _toggle_t := 0.0

func setup(w: Node) -> void:
	world = w
	p = w.local_player
	p.auto = self
	for a in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if a.begins_with("--perfil="):
			profile = a.substr(9)
		elif a.begins_with("--days="):
			_days = int(a.substr(7))
		elif a.begins_with("--shots="):
			_shot_dir = a.substr(8)
		elif a == "--fast":
			Engine.time_scale = 3.0
			Engine.physics_ticks_per_second = 180
	_rng.seed = 42
	DirAccess.make_dir_recursive_absolute(_shot_dir)
	Game.day_report.connect(_on_report)
	Game.run_over.connect(func(_s): _quit())
	print("[bot] perfil=%s dias=%d" % [profile, _days])

func _process(delta: float) -> void:
	if Game.phase == "elevator_up":
		_shot("01_elevador", 2.0)
		return
	if Game.phase != "day":
		return
	var bs: Dictionary = Game.boss_state
	var lamp: bool = bs.get("lamp", false)
	if lamp and not _prev_lamp:
		_react = _rng.randf_range(0.6, 1.4) if profile == "cuidadoso" else _rng.randf_range(1.5, 3.5)
		_shot("04_chefe_saiu", 0.0)
	_prev_lamp = lamp
	_react = maxf(_react - delta, 0.0)
	_decide()
	_log_t += delta
	if _log_t >= 10.0:
		_log_t = 0.0
		var me: Dictionary = Game.my()
		print("[bot] %s quota=%d/%d fun=%d/%d sus=%d chefe=%s goal=%s heist=%s:%d pos=%s sent=%s app=%s" % [B.clock_text(Game.t), Game.quota, Game.quota_goal, Game.team_fun(), Game.fun_goal, me.get("sus", 0), bs.get("st", "?"), goal, Game.heist.get("id", ""), Game.heist.get("step", 0), p.global_position.snapped(Vector3.ONE * 0.1), p.sitting, p.pc.current])
	if Game.t > 12.0:
		_shot("02_vista_mesa", 0.0)
	if Game.t > 200.0:
		_shot("05_tarde", 0.0)
	if Game.my().get("sus", 0.0) > 25.0:
		_shot("06_suspeita", 0.0)

func _decide() -> void:
	if p.in_panel:
		return
	var bs: Dictionary = Game.boss_state
	var h: Dictionary = Game.heist
	var spots: Array = world.heists._active_spots(h)
	if p.held == "salgadinho":
		_go_sit()
		return
	if p.held != "" or (bs.get("away", false) and not h.get("done", false) and not spots.is_empty()):
		goal = "assalto"
		if p.sitting:
			p.stand_up()
		var n: String = spots[0] if not spots.is_empty() else ""
		if p.held == "grampeador":
			_go_sit_drawer()
			return
		if n == "":
			return
		target = world.heists.SPOT_POS[n]
		if _near(target, 1.6):
			var it: Interactable = world.heists.spots[n].it
			if it.blocked_reason(p) == "":
				it.use(p)
				_shot("07_assalto_" + n, 0.3)
		return
	_go_sit()

func _go_sit() -> void:
	goal = "mesa"
	if p.sitting:
		return
	target = p.desk.chair - p.desk.facing * 0.6
	if _near(target, 0.9):
		p.sit_down()

func _go_sit_drawer() -> void:
	target = p.desk.chair - p.desk.facing * 0.5
	if _near(target, 1.0):
		var it: Interactable = null
		for c in p.desk.root.get_children():
			if c is Interactable and c.id.begins_with("drawer"):
				it = c
		if it and it.blocked_reason(p) == "":
			it.use(p)

func _near(pos: Vector3, r: float) -> bool:
	var a := Vector2(p.global_position.x, p.global_position.z)
	return a.distance_to(Vector2(pos.x, pos.z)) < r

## chamado pelo Player em vez do teclado
func move_input() -> Vector2:
	if p.in_panel or Game.phase != "day" or p.sitting:
		return Vector2.ZERO
	var to := target - p.global_position
	to.y = 0
	if to.length() < 0.3:
		return Vector2.ZERO
	# caminho pelo grafo do escritório (desvia das paredes)
	# puxa o barbante: o ponto mais adiante do caminho que se vê em linha reta
	var path: PackedVector3Array = world.office.path(p.global_position, target)
	var space := p.get_world_3d().direct_space_state
	var here := Vector3(p.global_position.x, 0, p.global_position.z)
	var next: Vector3 = path[0] if path.size() > 0 else target
	for i in range(path.size() - 1, -1, -1):
		if world.office._clear(space, here, path[i]):
			next = path[i]
			break
	var dir := next - p.global_position
	dir.y = 0
	p.look_yaw = lerp_angle(p.look_yaw, atan2(-dir.x, -dir.z), 0.25)
	return Vector2(0, -1)

## sentado: trabalha no ritmo, joga quando o chefe não está por perto, faz o ALT-TAB na hora
func sit_tick(delta: float) -> void:
	var bs: Dictionary = Game.boss_state
	var danger: bool = bs.get("lamp", false) and not bs.get("away", false)
	var need_work := Game.quota < Game.quota_goal
	_toggle_t -= delta
	if danger and _react <= 0.0:
		if p.pc.category() == "g":
			p.pc.clutch()
			_stats.clutch_try += 1
	elif not danger:
		var want_game := (not need_work) or (profile == "ganancioso" and Game.t > 60.0) or (Game.team_fun() < Game.fun_goal * Game.t / B.DAY_SECONDS)
		if profile == "desastrado" and _rng.randf() < 0.002:
			want_game = true
		if want_game and p.pc.category() != "g" and _toggle_t <= 0.0:
			p.pc.open("ballops" if _rng.randf() < 0.6 else "pesca")
			_toggle_t = 15.0
		elif not want_game and p.pc.category() != "w" and _toggle_t <= 0.0:
			p.pc.open("planilha")
			_toggle_t = 8.0
	if p.pc.category() == "g" and danger and profile == "desastrado" and _rng.randf() < 0.5:
		pass
	_auto_play_app()

func _auto_play_app() -> void:
	var app: PcApp = p.pc.apps.get(p.pc.current)
	if app == null or not p.pc.focused:
		return
	if p.pc.current == "planilha" and not app.notes.is_empty():
		var dt: float = absf(app.notes[0] - app.HIT_X) / app.SPEED
		if dt < 0.03 or (profile == "desastrado" and dt < 0.12 and _rng.randf() < 0.3):
			var ev := InputEventAction.new()
			ev.action = "work_hit"
			ev.pressed = true
			app.app_input(ev)
	elif p.pc.current == "pesca":
		var ev2 := InputEventAction.new()
		ev2.action = "work_hit"
		ev2.pressed = true
		if str(app.get("state")) in ["IDLE", "0"] or app.get("state") == 0 or (app.get("state") == 2):
			app.app_input(ev2)

## painéis: o robô resolve depois de um tempo humano
func on_panel(pg: Control) -> void:
	var t := _rng.randf_range(2.0, 4.0) if profile != "desastrado" else _rng.randf_range(3.0, 7.0)
	get_tree().create_timer(t).timeout.connect(func():
		if is_instance_valid(pg):
			_shot("08_painel", 0.0)
			pg.finish(true))

func _on_report(rep: Dictionary) -> void:
	print("[bot] FIM DO DIA %d: quota %d/%d fun %d/%d strikes+%d %s" % [rep.day, rep.quota, rep.quota_goal, rep.fun_team, rep.fun_goal, rep.strikes_add.size(), rep.strikes_add])
	for id in rep.players:
		print("[bot]   %s fun=%d sus=%d fired=%s reasons=%s clutches=%d" % [rep.players[id].name, rep.players[id].fun, rep.players[id].sus, rep.players[id].fired, rep.players[id].reasons, rep.players[id].clutches])
	print("[bot] stats=%s" % [_stats])
	await get_tree().create_timer(1.0).timeout
	_shot("09_relatorio", 0.0)
	await get_tree().create_timer(0.5).timeout
	if rep.day >= _days:
		_quit()
	else:
		world.hud.open_shop()
		await get_tree().create_timer(1.0).timeout
		_shot("10_loja", 0.0)
		world.hud.close_modal()
		Game.next_day()

func _shot(name: String, delay: float) -> void:
	if _shots_taken.has(name):
		return
	_shots_taken[name] = true
	if delay > 0.0:
		await get_tree().create_timer(delay).timeout
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := "%s/d%d_%s.png" % [_shot_dir, Game.day, name]
	img.save_png(path)
	print("[bot] print: ", ProjectSettings.globalize_path(path))

func _quit() -> void:
	print("[bot] fim")
	get_tree().quit()
