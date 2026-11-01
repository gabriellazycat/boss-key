extends PanelGame
## REVIRAR: abra caixas até achar a coisa escondida em uma delas (só uma tem o objeto).

const BW := 130.0
const BH := 80.0
const LID := 22.0
const CARD := Color("#8a6040")
const COLS := [110.0, 280.0, 450.0]
const ROWS := [150.0, 258.0]

var thing := 0
var opened := [false, false, false, false, false, false]
var anim := [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
var flash := [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
var hover := -1
var win_t := -1.0

func setup() -> void:
	title = "Revirando…"
	hint = "Clique nas caixas até achar alguma coisa útil."
	thing = randi_range(0, 5)

func tick(delta: float) -> void:
	hover = _box_at(mouse())
	for i in 6:
		if opened[i]:
			anim[i] = minf(1.0, anim[i] + delta * 3.0 * speed)
		flash[i] = maxf(0.0, flash[i] - delta * 2.5)
	if win_t > 0.0:
		win_t -= delta
		if win_t <= 0.0:
			finish(true)

func _gui_input(event: InputEvent) -> void:
	if _finished or win_t > 0.0:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var i := _box_at(event.position)
		if i >= 0 and not opened[i]:
			opened[i] = true
			flash[i] = 1.0
			Sfx.play("drawer", -6.0)
			if i == thing:
				win_t = 0.5

func draw_game() -> void:
	for i in 6:
		_draw_box(i)

func _rect(i: int) -> Rect2:
	var cx: float = COLS[i % 3]
	var by: float = ROWS[1 if i >= 3 else 0]
	return Rect2(cx - BW * 0.5 - 8.0, by - 18.0, BW + 16.0, BH + 18.0)

func _box_at(p: Vector2) -> int:
	for i in 6:
		if _rect(i).has_point(p):
			return i
	return -1

func _draw_box(i: int) -> void:
	var cx: float = COLS[i % 3]
	var by: float = ROWS[1 if i >= 3 else 0]
	var is_open: bool = opened[i]
	var a: float = anim[i]
	var body := Rect2(cx - BW * 0.5, by, BW, BH)
	var hot := hover == i and not is_open
	var card: Color = CARD.lightened(0.2) if hot else CARD
	draw_rect(Rect2(body.position + Vector2(5, 7), body.size), Color(0, 0, 0, 0.35))
	draw_rect(body, card)
	draw_rect(body, COL.line, false, 3.0)
	if a > 0.0:
		draw_rect(Rect2(body.position + Vector2(8, 8), body.size - Vector2(16, 16)), Color("#2a1f16"))
		if i == thing:
			_draw_key(Vector2(cx, by + BH * 0.5))
		else:
			_draw_paper(Vector2(cx, by + BH * 0.5))
	var ang := a * PI * 0.5
	var lh := LID * cos(ang)
	var lift := 60.0 * sin(ang)
	if lh > 1.0:
		var lid := Rect2(cx - BW * 0.5 - 6.0, by - 16.0 - lift, BW + 12.0, lh)
		draw_rect(lid, card.lightened(0.1))
		draw_rect(lid, COL.line, false, 3.0)
		draw_rect(Rect2(cx - 6.0, lid.position.y, 12.0, lh), COL.yellow)
	if hot:
		draw_rect(Rect2(body.position - Vector2(4, 4), body.size + Vector2(8, 8)), COL.accent, false, 3.0)
	if flash[i] > 0.0:
		var fc: Color = COL.yellow if i == thing else COL.dim
		var fa: float = flash[i] * 0.4
		draw_rect(body, Color(fc, fa))

func _draw_key(c: Vector2) -> void:
	var g: Color = COL.yellow
	draw_circle(c + Vector2(-18, 0), 14.0, g)
	draw_circle(c + Vector2(-18, 0), 6.0, CARD)
	draw_rect(Rect2(c.x - 6.0, c.y - 4.0, 48.0, 8.0), g)
	draw_rect(Rect2(c.x + 26.0, c.y + 4.0, 7.0, 12.0), g)
	draw_rect(Rect2(c.x + 36.0, c.y + 4.0, 7.0, 9.0), g)

func _draw_paper(c: Vector2) -> void:
	draw_circle(c + Vector2(-14, 4), 13.0, Color("#b9b2c9"))
	draw_circle(c + Vector2(8, -2), 15.0, Color("#a39cb4"))
	draw_circle(c + Vector2(22, 10), 9.0, Color("#c8c2d8"))
