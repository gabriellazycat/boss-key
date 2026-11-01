extends PanelGame
## PONTEIROS: arraste o ponteiro dos minutos até a marca verde (30 a 59 min à frente) e solte.

const C := Vector2(280.0, 200.0)
const R := 128.0
const FACE := Color("#efe9dc")
const INK := Color("#2b2836")

var m_ang := 0.0        # ponteiro dos minutos, graus (0 = 12h)
var h_base := 0.0
var target := 0.0
var dragging := false
var pulse := 0.0

func setup() -> void:
	title = "Adiantar o relógio"
	hint = "Arraste o ponteiro grande até a marca verde."
	m_ang = randi_range(0, 59) * 6.0
	h_base = randi_range(0, 11) * 30.0
	# 30 a 59 min: com 60 a marca cairia em cima do ponto de partida
	target = fposmod(m_ang + randi_range(30, 59) * 6.0, 360.0)

func tick(delta: float) -> void:
	pulse += delta * 5.0

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed and not dragging and _near_hand(event.position):
			dragging = true
			Sfx.play("ui_click", -6.0)
		elif not event.pressed and dragging:
			dragging = false
			_release()
	elif event is InputEventMouseMotion and dragging:
		m_ang = _ang_of(event.position)

func _release() -> void:
	if absf(_diff(m_ang, target)) <= 6.0:
		Sfx.play("sort_ok", -4.0)
		finish(true)
	else:
		Sfx.play("rhythm_miss", -8.0)

func _ang_of(p: Vector2) -> float:
	var d := p - C
	return fposmod(rad_to_deg(atan2(d.x, -d.y)), 360.0)

func _diff(a: float, b: float) -> float:
	return fposmod(a - b + 180.0, 360.0) - 180.0

func _near_hand(p: Vector2) -> bool:
	var dist := p.distance_to(C)
	return dist > 16.0 and dist < R + 14.0 and absf(_diff(_ang_of(p), m_ang)) < 22.0

func _pt(deg: float, r: float) -> Vector2:
	var rad := deg_to_rad(deg - 90.0)
	return C + Vector2(cos(rad), sin(rad)) * r

func draw_game() -> void:
	var red: Color = COL.red
	var green: Color = COL.green
	draw_circle(C, R + 10.0, COL.line)
	draw_circle(C, R, FACE)
	for k in 60:
		var big := k % 5 == 0
		draw_line(_pt(k * 6.0, R - 6.0), _pt(k * 6.0, R - (20.0 if big else 13.0)), INK, 4.0 if big else 2.0, true)
	for k in 12:
		var num := 12 if k == 0 else k
		label(_pt(k * 30.0, R - 42.0) + Vector2(-20.0, 8.0), str(num), 22, INK, HORIZONTAL_ALIGNMENT_CENTER, 40.0)
	var pulse_s := 1.0 + 0.12 * sin(pulse)
	draw_arc(C, R - 3.0, deg_to_rad(target - 6.0 - 90.0), deg_to_rad(target + 6.0 - 90.0), 12, green, 7.0 * pulse_s, true)
	draw_colored_polygon(PackedVector2Array([_pt(target - 5.0, R + 14.0), _pt(target + 5.0, R + 14.0), _pt(target, R - 4.0)]), green)
	var near := dragging or _near_hand(mouse())
	draw_line(C, _pt(h_base + m_ang / 12.0, R - 60.0), INK, 10.0, true)
	var nc: Color = red.lightened(0.2) if near else red
	draw_line(C, _pt(m_ang, R - 20.0), nc, 8.0 if near else 6.0, true)
	draw_circle(_pt(m_ang, R - 20.0), 7.0, nc)
	draw_circle(C, 10.0, COL.yellow)
