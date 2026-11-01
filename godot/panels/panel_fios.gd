extends PanelGame
## FIOS: arraste cada fio da esquerda até o conector da mesma cor na direita.

const COLORS := ["red", "yellow", "blue", "pink"]
var left_y := []
var right_y := []
var right_order := []
var linked := {}         # índice esquerdo → índice direito
var dragging := -1

func setup() -> void:
	title = "Painel de fios"
	hint = "Arraste cada fio até o conector da MESMA cor."
	for i in 4:
		left_y.append(90.0 + i * 62.0)
		right_y.append(90.0 + i * 62.0)
	right_order = [0, 1, 2, 3]
	right_order.shuffle()

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			for i in 4:
				if not linked.has(i) and Vector2(70, left_y[i]).distance_to(event.position) < 26:
					dragging = i
					Sfx.play("ui_click", -6.0)
		elif dragging >= 0:
			for j in 4:
				if Vector2(W - 70, right_y[j]).distance_to(event.position) < 30 and right_order[j] == dragging:
					linked[dragging] = j
					Sfx.play("rhythm_hit", -6.0)
			dragging = -1
			if linked.size() == 4:
				finish(true)

func draw_game() -> void:
	for i in 4:
		var c: Color = COL[COLORS[i]]
		draw_rect(Rect2(30, left_y[i] - 14, 46, 28), c.darkened(0.3))
		draw_circle(Vector2(70, left_y[i]), 12, c)
		var j: int = right_order.find(i)
		draw_rect(Rect2(W - 76, right_y[j] - 14, 46, 28), c.darkened(0.3))
		draw_circle(Vector2(W - 70, right_y[j]), 12, c if linked.has(i) else c.darkened(0.5))
		if linked.has(i):
			_wire(Vector2(70, left_y[i]), Vector2(W - 70, right_y[linked[i]]), c)
	if dragging >= 0:
		_wire(Vector2(70, left_y[dragging]), mouse(), COL[COLORS[dragging]])

func _wire(a: Vector2, b: Vector2, c: Color) -> void:
	var pts := PackedVector2Array()
	for k in 17:
		var t := k / 16.0
		var p := a.lerp(b, t)
		p.y += sin(t * PI) * 18.0
		pts.append(p)
	draw_polyline(pts, c.darkened(0.4), 14.0, true)
	draw_polyline(pts, c, 9.0, true)
