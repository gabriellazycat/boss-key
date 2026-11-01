extends PanelGame
## DIGITAR: copie a senha do post-it no teclado e aperte OK. Também aceita 0-9, Backspace e Enter.

const KEYS := [1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, -2]   # -1 apagar, -2 OK
const KEY_TXT := ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "OK"]
const PAPER := Color("#f2d74e")
const INK := Color("#2b2836")

var code := ""
var typed := ""
var hover := -1
var last_key := -1
var press_t := 0.0
var wrong_t := 0.0

func setup() -> void:
	title = "Senha do PC"
	hint = "Digite a senha do post-it e aperte OK."
	for _i in 4:
		code += str(randi_range(0, 9))

func tick(delta: float) -> void:
	hover = _btn_at(mouse())
	press_t = maxf(0.0, press_t - delta * 4.0)
	wrong_t = maxf(0.0, wrong_t - delta * 2.0)

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var k := _btn_at(event.position)
		if k >= 0:
			_press_key(KEYS[k])

func _unhandled_key_input(event: InputEvent) -> void:
	if _finished or not (event is InputEventKey):
		return
	var ek := event as InputEventKey
	if not ek.pressed or ek.echo:
		return
	var u := ek.unicode
	if u >= 48 and u <= 57:
		_press_key(u - 48)
	elif ek.keycode == KEY_BACKSPACE:
		_press_key(-1)
	elif ek.keycode == KEY_ENTER or ek.keycode == KEY_KP_ENTER:
		_press_key(-2)
	else:
		return
	get_viewport().set_input_as_handled()

func _press_key(v: int) -> void:
	last_key = KEYS.find(v)
	press_t = 1.0
	if v == -2:
		_check()
	elif v == -1:
		if typed.length() > 0:
			typed = typed.substr(0, typed.length() - 1)
		Sfx.play("typing", -8.0)
	elif typed.length() < 4:
		typed += str(v)
		Sfx.play("typing", -8.0)

func _check() -> void:
	if typed == code:
		Sfx.play("sort_ok", -4.0)
		finish(true)
	else:
		typed = ""
		wrong_t = 1.0
		Sfx.play("sort_bad", -4.0)

func _btn_rect(k: int) -> Rect2:
	var col := k % 3
	var row := int(k / 3.0)
	return Rect2(270.0 + col * 84.0, 118.0 + row * 52.0, 76.0, 46.0)

func _btn_at(p: Vector2) -> int:
	for k in 12:
		if _btn_rect(k).has_point(p):
			return k
	return -1

func draw_game() -> void:
	_draw_postit()
	_draw_display()
	var panel: Color = COL.panel
	var green: Color = COL.green
	for k in 12:
		var r := _btn_rect(k)
		var fill: Color = green if KEYS[k] == -2 else panel.lightened(0.12)
		if k == hover:
			fill = fill.lightened(0.2)
		if k == last_key and press_t > 0.0:
			fill = fill.lightened(press_t * 0.5)
		draw_rect(Rect2(r.position + Vector2(0, 4), r.size), Color(0, 0, 0, 0.4))
		draw_rect(r, fill)
		draw_rect(r, COL.line, false, 2.0)
		if KEYS[k] == -1:
			_draw_back(r.get_center())
		else:
			label(Vector2(r.position.x, r.position.y + 31.0), KEY_TXT[k], 24, COL.text, HORIZONTAL_ALIGNMENT_CENTER, r.size.x)

func _draw_back(c: Vector2) -> void:
	var pts := PackedVector2Array([c + Vector2(-16, 0), c + Vector2(-6, -11), c + Vector2(16, -11), c + Vector2(16, 11), c + Vector2(-6, 11)])
	draw_colored_polygon(pts, COL.orange)
	draw_line(c + Vector2(-2, -5), c + Vector2(9, 5), COL.bg, 3.0, true)
	draw_line(c + Vector2(9, -5), c + Vector2(-2, 5), COL.bg, 3.0, true)

func _draw_postit() -> void:
	var pr := Rect2(40.0, 80.0, 190.0, 170.0)
	draw_rect(Rect2(pr.position + Vector2(6, 7), pr.size), Color(0, 0, 0, 0.35))
	draw_rect(pr, PAPER)
	draw_rect(Rect2(110.0, 70.0, 70.0, 18.0), Color(1, 1, 1, 0.45))
	label(Vector2(60.0, 120.0), "Senha do PC:", 18, INK)
	label(Vector2(58.0, 210.0), code, 54, INK)

func _draw_display() -> void:
	var red: Color = COL.red
	var dark: Color = COL.bg
	for k in 4:
		var r := Rect2(270.0 + k * 60.0, 62.0, 52.0, 44.0)
		draw_rect(r, red if wrong_t > 0.0 else dark)
		draw_rect(r, COL.line, false, 2.0)
		var ch := typed.substr(k, 1) if k < typed.length() else "_"
		label(Vector2(r.position.x, r.position.y + 31.0), ch, 30, COL.text, HORIZONTAL_ALIGNMENT_CENTER, r.size.x)
