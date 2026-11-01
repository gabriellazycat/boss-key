extends PanelGame
## FECHADURA: clique com o ponteiro dentro da faixa verde, 3 vezes. Erro tira um pino.

const C := Vector2(260.0, 200.0)
const R := 125.0
const HALF := 12.5

var ang := 0.0        # graus, 0 = topo, sentido horário
var dir := 1.0
var zone := 0.0
var pins := 0
var flash := 0.0
var shake := 0.0

func setup() -> void:
	title = "Fechadura"
	hint = "Clique quando o ponteiro estiver na faixa verde (3 vezes)."
	ang = randf_range(0.0, 360.0)
	zone = fposmod(ang + randf_range(90.0, 270.0), 360.0)

func tick(delta: float) -> void:
	ang = fposmod(ang + 140.0 * speed * dir * delta, 360.0)
	flash = maxf(0.0, flash - delta * 2.5)
	shake = maxf(0.0, shake - delta * 4.0)

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_press()

func _press() -> void:
	var d := fposmod(ang - zone + 180.0, 360.0) - 180.0
	if absf(d) <= HALF:
		pins += 1
		flash = 1.0
		zone = fposmod(ang + randf_range(90.0, 270.0), 360.0)
		dir = -dir
		Sfx.play("rhythm_hit", -4.0)
		if pins >= 3:
			finish(true)
	else:
		pins = maxi(0, pins - 1)
		shake = 1.0
		Sfx.play("rhythm_miss", -4.0)

func draw_game() -> void:
	var green: Color = COL.green
	var panel: Color = COL.panel
	var off := Vector2(randf_range(-shake, shake), randf_range(-shake, shake)) * 6.0
	var c := C + off
	var hov := mouse().distance_to(c) < R + 12.0
	draw_circle(c, R + 12.0, COL.line)
	draw_circle(c, R, panel.lightened(0.08) if hov else panel)
	for k in 12:
		draw_line(_pt(k * 30.0, R - 4.0, c), _pt(k * 30.0, R - 16.0, c), COL.dim, 3.0, true)
	var zc: Color = green.lightened(0.25) if hov else green
	draw_arc(c, R - 12.0, deg_to_rad(zone - HALF - 90.0), deg_to_rad(zone + HALF - 90.0), 24, zc, 14.0, true)
	if flash > 0.0:
		draw_arc(c, R + 8.0 + (1.0 - flash) * 30.0, 0.0, TAU, 48, Color(green, flash), 6.0, true)
	draw_line(c, _pt(ang, R - 14.0, c), COL.red, 6.0, true)
	draw_circle(c, 11.0, COL.yellow)
	for k in 3:
		var p := Vector2(440.0 + k * 40.0, 200.0)
		if k < pins:
			draw_circle(p, 13.0, green)
		else:
			draw_circle(p, 13.0, COL.line)
			draw_circle(p, 9.0, panel)
	label(Vector2(420.0, 160.0), "PINOS", 16, COL.dim)
	label(Vector2(420.0, 236.0), "erro tira 1 pino", 13, COL.dim)

func _pt(deg: float, r: float, c: Vector2) -> Vector2:
	var rad := deg_to_rad(deg - 90.0)
	return c + Vector2(cos(rad), sin(rad)) * r
