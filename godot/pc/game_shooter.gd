extends PcApp
## Diversão: BALL OPS, arena vista de cima. O jogador (bolinha verde) foge dos inimigos
## vermelhos; a arma atira sozinha no mais próximo. Cada abate rende FUN; encostar custa um coração.

const ARENA := Rect2(4, 20, 440, 190)
const P_R := 7.0
const P_SPD := 140.0
const B_SPD := 300.0
const FIRE_T := 0.28

var player := Vector2(224, 115)
var hearts := 3
var score := 0
var over := false
var inv := 0.0              # s de invulnerabilidade (pisca)
var fire_t := 0.0
var spawn_t := 0.9
var elapsed := 0.0
var enemies: Array = []     # {pos, r, spd}
var bullets: Array = []     # {pos, vel}
var parts: Array = []       # {pos, vel, life, col}
var _demo_ang := 0.0

func _init() -> void:
	super()
	app_id = "ballops"
	title = "BALL OPS ⚡ arena"
	is_work = false
	key_hint = "[WASD] mover · atira sozinho"

func app_process(delta: float) -> void:
	if focused or demo:  # fora do foco o jogo congela
		_step(delta)
	queue_redraw()

func app_input(event: InputEvent) -> void:
	if over and event.is_action_pressed("work_hit"):
		_reset()

func _step(delta: float) -> void:
	for p in parts:
		p["life"] = float(p["life"]) - delta
		p["pos"] = p["pos"] + p["vel"] * delta
	parts = parts.filter(func(p: Dictionary) -> bool: return float(p["life"]) > 0.0)
	if over:
		return
	if demo:
		_demo_ang += delta * 0.6
		player = ARENA.get_center() + Vector2(cos(_demo_ang), sin(_demo_ang)) * 60.0
	else:
		var dir := Vector2(float(Input.is_action_pressed("move_r")) - float(Input.is_action_pressed("move_l")), float(Input.is_action_pressed("move_b")) - float(Input.is_action_pressed("move_f")))
		player = (player + dir.normalized() * P_SPD * delta).clamp(ARENA.position + Vector2(P_R, P_R), ARENA.end - Vector2(P_R, P_R))
	elapsed += delta
	inv = maxf(inv - delta, 0.0)
	_spawn(delta)
	_chase(delta)
	_fire(delta)
	_move_bullets(delta)
	_touch()

func _spawn(delta: float) -> void:
	spawn_t -= delta
	if spawn_t > 0.0:
		return
	spawn_t = maxf(0.4, 0.9 - elapsed * 0.01)
	var a := ARENA
	var rx := randf_range(a.position.x, a.end.x)
	var ry := randf_range(a.position.y, a.end.y)
	var edges: Array = [Vector2(rx, a.position.y), Vector2(rx, a.end.y), Vector2(a.position.x, ry), Vector2(a.end.x, ry)]
	enemies.append({"pos": edges[randi() % 4], "r": randf_range(6.0, 9.0), "spd": randf_range(40.0, 70.0)})

func _chase(delta: float) -> void:
	for e in enemies:
		var d: Vector2 = player - e["pos"]
		e["pos"] = e["pos"] + d.normalized() * e["spd"] * delta

func _fire(delta: float) -> void:
	fire_t -= delta
	if fire_t > 0.0 or enemies.is_empty():
		return
	fire_t = FIRE_T
	var tgt: Vector2 = enemies[0]["pos"]
	for e in enemies:
		var ep: Vector2 = e["pos"]
		if player.distance_squared_to(ep) < player.distance_squared_to(tgt):
			tgt = ep
	bullets.append({"pos": player, "vel": (tgt - player).normalized() * B_SPD})
	if not demo:
		Sfx.play("pew", -18.0)

func _move_bullets(delta: float) -> void:
	for b in bullets.duplicate():
		var bp: Vector2 = b["pos"] + b["vel"] * delta
		b["pos"] = bp
		var hit := false
		for e in enemies.duplicate():
			if not hit and bp.distance_to(e["pos"]) < float(e["r"]) + 2.0:
				hit = true
				enemies.erase(e)
				_burst(e["pos"], COL.red)
				score += 1
				if not demo:
					earned_fun.emit(B.FUN_SHOOTER_KILL)
					Sfx.play("boom", -16.0)
		if hit or not ARENA.has_point(bp):
			bullets.erase(b)

func _burst(pos: Vector2, c: Color) -> void:
	for i in 5:
		var a := randf() * TAU
		parts.append({"pos": pos, "vel": Vector2(cos(a), sin(a)) * randf_range(40.0, 110.0), "life": 0.35, "col": c})

func _touch() -> void:
	for e in enemies.duplicate():
		var ep: Vector2 = e["pos"]
		if ep.distance_to(player) < float(e["r"]) + P_R:
			enemies.erase(e)
			_burst(ep, COL.pink)
			if not demo and inv <= 0.0:
				hearts -= 1
				inv = 1.2
				over = hearts <= 0

func _reset() -> void:
	player = ARENA.get_center()
	hearts = 3
	score = 0
	over = false
	inv = 0.0
	fire_t = 0.0
	spawn_t = 0.9
	elapsed = 0.0
	enemies.clear()
	bullets.clear()
	parts.clear()

func _draw() -> void:
	draw_rect(Rect2(0, 0, W, H), COL.ink)
	draw_rect(ARENA, COL.dark)
	var gc := Color(COL.mid, 0.5)
	for x in range(int(ARENA.position.x) + 22, int(ARENA.end.x), 22):
		draw_line(Vector2(float(x), ARENA.position.y), Vector2(float(x), ARENA.end.y), gc)
	for y in range(int(ARENA.position.y) + 22, int(ARENA.end.y), 22):
		draw_line(Vector2(ARENA.position.x, float(y)), Vector2(ARENA.end.x, float(y)), gc)
	draw_rect(ARENA, COL.mid, false, 1.0)
	for p in parts:
		var pp: Vector2 = p["pos"]
		draw_rect(Rect2(pp - Vector2(1.5, 1.5), Vector2(3, 3)), Color(p["col"], clampf(float(p["life"]) / 0.35, 0.0, 1.0)))
	for e in enemies:
		var ep: Vector2 = e["pos"]
		draw_circle(ep, float(e["r"]), COL.red)
		draw_arc(ep, float(e["r"]), 0.0, TAU, 14, COL.dark, 1.5)
	for b in bullets:
		draw_circle(b["pos"], 2.5, COL.yellow)
	if inv <= 0.0 or int(inv * 12.0) % 2 == 0:
		draw_circle(player, P_R, COL.accent)
		draw_arc(player, P_R, 0.0, TAU, 14, COL.dark, 1.5)
	# placar e corações no topo
	text(Vector2(10, 15), "PONTOS  %d" % score, 12, COL.bg)
	for i in 3:
		draw_circle(Vector2(W - 16.0 - i * 16.0, 10.0), 5.0, COL.red if i < hearts else COL.mid)
	# instrução em uma linha, embaixo
	draw_rect(Rect2(0, 210, W, 26), COL.grid)
	text(Vector2(10, 227), "Fuja dos vermelhos com WASD. A arma atira sozinha.", 12, COL.ink)
	if over:
		draw_rect(Rect2(60, 84, 328, 60), COL.ink)
		draw_rect(Rect2(60, 84, 328, 60), COL.red, false, 2.0)
		text(Vector2(0, 110), "GAME OVER — [F] de novo", 16, COL.yellow, HORIZONTAL_ALIGNMENT_CENTER, W)
		text(Vector2(0, 130), "pontos: %d" % score, 12, COL.white, HORIZONTAL_ALIGNMENT_CENTER, W)
