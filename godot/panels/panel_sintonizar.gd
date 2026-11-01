extends PanelGame
## SINTONIZAR: ache a estação com a agulha e segure o mouse nela por 1,2 s (sinal limpo).

const X0 := 40.0
const BW := 480.0
const GOOD := 0.035
const HOLD_T := 1.2
const FACE := Color("#efe9dc")
const INK := Color("#2b2836")
const CTR := Vector2(280.0, 100.0)

var station := 0.5
var needle := 0.0
var dragging := false
var hold := 0.0
var was_good := false
var clock := 0.0
var strength := 0.0

func setup() -> void:
	title = "Rádio da copa"
	hint = "Arraste a agulha até o sinal ficar limpo e segure."
	station = randf_range(0.12, 0.88)
	needle = 0.0 if station > 0.5 else 1.0

func tick(delta: float) -> void:
	clock += delta
	var dist := absf(needle - station)
	strength = clampf(1.0 - dist / 0.22, 0.0, 1.0)
	var good := dragging and dist <= GOOD
	if good and not was_good:
		Sfx.play("rhythm_hit", -8.0)
	was_good = good
	hold = hold + delta * speed if good else 0.0
	if hold >= HOLD_T:
		finish(true)

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		dragging = event.pressed and _in_band(event.position)
		if dragging:
			_set_needle(event.position)
	elif event is InputEventMouseMotion and dragging:
		_set_needle(event.position)

func _in_band(p: Vector2) -> bool:
	return p.x > 20.0 and p.x < 540.0 and p.y > 120.0 and p.y < 250.0

func _set_needle(p: Vector2) -> void:
	needle = clampf((p.x - X0) / BW, 0.0, 1.0)

func draw_game() -> void:
	var red: Color = COL.red
	var green: Color = COL.green
	var dim: Color = COL.dim
	# escala da banda (88 a 108 MHz, a estação fica escondida nela)
	draw_rect(Rect2(X0, 150.0, BW, 60.0), FACE)
	for k in 41:
		var x := X0 + BW * k / 40.0
		var big := k % 4 == 0
		draw_line(Vector2(x, 150.0), Vector2(x, 150.0 + (16.0 if big else 8.0)), INK, 2.0 if big else 1.0)
	for k in 6:
		var v := 88 + k * 4
		var lx := X0 + (v - 88) / 20.0 * BW
		label(Vector2(lx - 20.0, 200.0), str(v), 14, INK, HORIZONTAL_ALIGNMENT_CENTER, 40.0)
	draw_rect(Rect2(X0, 150.0, BW, 60.0), INK, false, 2.0)
	# agulha
	var nx := X0 + needle * BW
	var near := dragging or absf(mouse().x - nx) < 14.0
	var nc: Color = red.lightened(0.2) if near else red
	draw_line(Vector2(nx, 132.0), Vector2(nx, 218.0), nc, 4.0, true)
	draw_colored_polygon(PackedVector2Array([Vector2(nx - 8.0, 132.0), Vector2(nx + 8.0, 132.0), Vector2(nx, 146.0)]), nc)
	# medidor de sinal
	var lit := int(round(strength * 8.0))
	label(Vector2(40.0, 248.0), "SINAL", 16, dim)
	for k in 8:
		draw_rect(Rect2(110.0 + k * 52.0, 232.0, 44.0, 20.0), green if k < lit else COL.line)
	# chiado: onda agitada que fica reta perto da estação
	var amp := 2.0 + 34.0 * (1.0 - strength)
	var pts := PackedVector2Array()
	for k in 49:
		var x := X0 + BW * k / 48.0
		var y := 300.0 + amp * (sin(k * 0.9 + clock * 14.0) * 0.6 + sin(k * 2.3 - clock * 23.0) * 0.4)
		pts.append(Vector2(x, y))
	draw_polyline(pts, dim.lerp(green, strength), 3.0, true)
	# anel de progresso do segurar
	draw_arc(CTR, 26.0, 0.0, TAU, 40, COL.line, 8.0, true)
	var frac := clampf(hold / HOLD_T, 0.0, 1.0)
	if frac > 0.0:
		draw_arc(CTR, 26.0, -PI * 0.5, -PI * 0.5 + TAU * frac, 48, green, 8.0, true)
	label(Vector2(318.0, 108.0), "segure", 16, dim)
