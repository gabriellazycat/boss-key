extends PcApp
## Diversão: PESCA ZEN. Lance a linha, espere a fisgada (aparece um "!") e aperte F na janela
## de 0,7 s. Cada peixe rende FUN conforme a raridade. Apertar cedo ou tarde = escapou.

enum { IDLE, WAIT, BITE, CAUGHT, ESCAPED }
const TIP := Vector2(150, 60)       # ponta da vara
const SPOT := Vector2(176, 150)     # onde a boia cai na água
const WATER_Y := 150.0
const BITE_WIN := 0.7
const RESULT_T := 1.6               # resultado fica na tela e depois volta pra IDLE
const NAMES := {
	"comum": ["Lambari", "Tilápia"],
	"raro": ["Peixe-Palhaço Corporativo", "Bagre Executivo"],
	"lenda": ["Salmão do RH", "Peixe Lendário do Café"],
}

var state := IDLE
var st_t := 0.0                     # tempo dentro do estado atual
var wait_t := 0.0                   # quanto falta para a fisgada
var count := 0
var last := ""                      # último peixe
var catch_name := ""
var catch_rarity := "comum"
var why := ""                       # motivo do escape
var _t := 0.0                       # tempo de animação (água, boia)

func _init() -> void:
	super()
	app_id = "pesca"
	title = "Pesca Zen 🐟"
	is_work = false
	key_hint = "[F] lançar · [F] fisgar quando aparecer !"

func app_process(delta: float) -> void:
	if focused or demo:  # fora do foco, o tempo pausa
		_tick(delta)
	queue_redraw()

func app_input(event: InputEvent) -> void:
	if not event.is_action_pressed("work_hit"):
		return
	match state:
		IDLE: _cast()
		WAIT: _escape("escapou! (cedo demais)")
		BITE: _reel()

func _tick(delta: float) -> void:
	_t += delta
	st_t += delta
	match state:
		IDLE:
			if demo and st_t > 1.2:
				_cast()
		WAIT:
			if st_t >= wait_t:
				_bite()
		BITE:
			if demo and st_t > 0.4:
				_reel()
			elif st_t >= BITE_WIN:
				_escape("escapou! (tarde demais)")
		CAUGHT, ESCAPED:
			if st_t > RESULT_T:
				_go(IDLE)

func _go(s: int) -> void:
	state = s
	st_t = 0.0

func _cast() -> void:
	wait_t = randf_range(2.0, 6.0)
	_go(WAIT)

func _bite() -> void:
	_go(BITE)
	if not demo:
		Sfx.play("fish_bite", -6.0)

func _reel() -> void:
	var r := randf()
	catch_rarity = "comum" if r < 0.70 else ("raro" if r < 0.95 else "lenda")
	var names: Array = NAMES[catch_rarity]
	catch_name = names[randi() % names.size()]
	count += 1
	last = "%s (%s)" % [catch_name, catch_rarity]
	_go(CAUGHT)
	if not demo:
		earned_fun.emit(B.FUN_FISH[catch_rarity])
		Sfx.play("fun_gain", -6.0)

func _escape(reason: String) -> void:
	why = reason
	_go(ESCAPED)
	if not demo:
		Sfx.play("rhythm_miss", -10.0)

func _instruction() -> String:
	match state:
		IDLE: return "[F] lançar a linha"
		WAIT: return "aguarde... a boia está na água"
		BITE: return "AGORA! aperte [F] para fisgar"
		CAUGHT: return "fisgou um peixe!"
	return "escapou!"

func _bobber_pos() -> Vector2:
	if state == IDLE:
		return TIP + Vector2(0, 14)
	var dy := sin(_t * 2.5) * 1.5
	if state == BITE:
		dy += 7.0 + sin(_t * 40.0) * 2.0
	if state == WAIT and st_t < 0.5:
		return TIP.lerp(SPOT + Vector2(0, dy), st_t / 0.5)
	return SPOT + Vector2(0, dy)

func _draw_fish(p: Vector2, rarity: String) -> void:
	var c: Color = COL.green
	if rarity == "raro":
		c = COL.yellow
	elif rarity == "lenda":
		c = COL.pink
	draw_colored_polygon(PackedVector2Array([p + Vector2(6, 0), p + Vector2(14, -6), p + Vector2(14, 6)]), c)
	draw_circle(p, 7.0, c)
	draw_arc(p, 7.0, 0.0, TAU, 12, COL.dark, 1.0)
	draw_circle(p + Vector2(-3, -2), 1.5, COL.dark)

func _draw() -> void:
	# céu em faixas e água
	var top: Color = COL.blue.darkened(0.3)
	var hor: Color = COL.blue.lightened(0.5)
	var deep: Color = COL.blue.darkened(0.45)
	for i in 15:
		draw_rect(Rect2(0, i * 10.0, W, 10.0), top.lerp(hor, i / 14.0))
	for i in 9:
		draw_rect(Rect2(0, WATER_Y + i * 10.0, W, 10.0), COL.blue.lerp(deep, i / 8.0))
	for i in 6:
		draw_rect(Rect2(fposmod(_t * 18.0 + i * 83.0, W), 168.0 + i * 11.0, 16.0, 2.0), Color(COL.white, 0.4))
	# píer e pescador de palitos
	draw_rect(Rect2(0, 118, 120, 8), COL.mid)
	draw_rect(Rect2(0, 118, 120, 8), COL.dark, false, 1.0)
	draw_rect(Rect2(6, 126, 6, 34), COL.dark)
	draw_rect(Rect2(100, 126, 6, 34), COL.dark)
	draw_circle(Vector2(70, 92), 5.5, COL.ink)
	draw_line(Vector2(70, 98), Vector2(70, 110), COL.ink, 2.0)
	draw_line(Vector2(70, 110), Vector2(64, 118), COL.ink, 2.0)
	draw_line(Vector2(70, 110), Vector2(76, 118), COL.ink, 2.0)
	draw_line(Vector2(70, 102), Vector2(82, 106), COL.ink, 2.0)
	draw_line(Vector2(82, 106), TIP, COL.ink, 1.0)
	# linha, boia e aviso
	var bob := _bobber_pos()
	draw_line(TIP, bob, COL.mid, 1.0)
	draw_circle(bob, 4.0, COL.red)
	draw_arc(bob, 4.0, 0.0, TAU, 12, COL.dark, 1.0)
	if state == BITE:
		draw_rect(Rect2(bob.x - 9.0, bob.y - 46.0, 18.0, 24.0), COL.white)
		draw_rect(Rect2(bob.x - 9.0, bob.y - 46.0, 18.0, 24.0), COL.dark, false, 2.0)
		text(Vector2(bob.x - 9.0, bob.y - 26.0), "!", 22, COL.red, HORIZONTAL_ALIGNMENT_CENTER, 18.0)
	if state == CAUGHT and st_t < 1.2:
		_draw_fish(Vector2(SPOT.x, WATER_Y - 46.0 * sin(clampf(st_t / 1.2, 0.0, 1.0) * PI)), catch_rarity)
	if state == ESCAPED and st_t < 0.8:
		draw_arc(SPOT, 4.0 + st_t * 26.0, 0.0, TAU, 20, Color(COL.white, 1.0 - st_t / 0.8), 1.5)
	# instrução no topo, contador à direita
	draw_rect(Rect2(0, 0, W, 22), Color(COL.dark, 0.8))
	text(Vector2(8, 15), _instruction(), 13, COL.white)
	text(Vector2(0, 15), "peixes: %d" % count, 12, COL.white, HORIZONTAL_ALIGNMENT_RIGHT, W - 8.0)
	if state == CAUGHT and st_t > 0.3:
		text(Vector2(0, 52), "%s · %s  +%.1f FUN" % [catch_name, catch_rarity, float(B.FUN_FISH[catch_rarity])], 14, COL.white, HORIZONTAL_ALIGNMENT_CENTER, W)
	if state == ESCAPED:
		text(Vector2(0, 60), why, 16, COL.white, HORIZONTAL_ALIGNMENT_CENTER, W)
	text(Vector2(8, 230), ("Último: " + last) if last != "" else "Nenhum peixe ainda", 12, COL.white)
