extends PanelGame
## BALCÃO: junte exatamente R$ 3,75 com as moedas. Passou do valor = a máquina devolve tudo.

const PRICE := 375
const COINS := [100, 50, 25]
const COIN_TXT := ["1", "50c", "25c"]
const COIN_VAL := ["R$ 1,00", "R$ 0,50", "R$ 0,25"]
const CR := [34.0, 28.0, 22.0]
const CY := [130.0, 210.0, 280.0]
const CX := 380.0
const LCD := Color("#11202a")
const CAB := Color("#3a4a6b")

var total := 0
var flash := 0.0
var msg_t := 0.0
var hover := -1

func setup() -> void:
	title = "Máquina de lanches"
	hint = "Coloque o valor EXATO: R$ 3,75."

func tick(delta: float) -> void:
	hover = _hit(mouse())
	flash = maxf(0.0, flash - delta * 3.0)
	msg_t = maxf(0.0, msg_t - delta)

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var h := _hit(event.position)
		if h == 3:
			total = 0
			Sfx.play("ui_click", -6.0)
		elif h >= 0:
			_insert(COINS[h])

func _insert(v: int) -> void:
	total += v
	flash = 1.0
	if total == PRICE:
		Sfx.play("shop_buy", -4.0)
		finish(true)
	elif total > PRICE:
		total = 0
		msg_t = 1.8
		Sfx.play("sort_bad", -4.0)
	else:
		Sfx.play("ui_click", -6.0)

func _hit(p: Vector2) -> int:
	for k in 3:
		var cy: float = CY[k]
		if p.distance_to(Vector2(CX, cy)) < CR[k]:
			return k
	if Rect2(64.0, 262.0, 212.0, 40.0).has_point(p):
		return 3
	return -1

func _fmt(v: int) -> String:
	return "R$ %d,%02d" % [int(v / 100.0), v % 100]

func draw_game() -> void:
	var red: Color = COL.red
	var green: Color = COL.green
	var accent: Color = COL.accent
	var dim: Color = COL.dim
	var pink: Color = COL.pink
	# gabinete
	draw_rect(Rect2(40.0, 56.0, 260.0, 290.0), CAB)
	draw_rect(Rect2(40.0, 56.0, 260.0, 290.0), COL.line, false, 3.0)
	# display do preço
	draw_rect(Rect2(64.0, 74.0, 212.0, 64.0), LCD)
	label(Vector2(76.0, 92.0), "PREÇO", 13, dim)
	label(Vector2(76.0, 128.0), _fmt(PRICE), 34, COL.yellow)
	# display do valor inserido
	var ins_c: Color = red if msg_t > 0.0 else (green if total == PRICE else accent)
	draw_rect(Rect2(64.0, 150.0, 212.0, 50.0), LCD)
	if flash > 0.0:
		draw_rect(Rect2(64.0, 150.0, 212.0, 50.0), Color(ins_c, flash * 0.35))
	label(Vector2(76.0, 168.0), "INSERIDO", 13, dim)
	label(Vector2(76.0, 192.0), _fmt(total), 24, ins_c, HORIZONTAL_ALIGNMENT_RIGHT, 188.0)
	# fenda e botão devolver
	draw_rect(Rect2(90.0, 218.0, 160.0, 10.0), Color("#0c1218"))
	var dv := Rect2(64.0, 262.0, 212.0, 40.0)
	var dv_c: Color = pink.darkened(0.45)
	if hover == 3:
		dv_c = dv_c.lightened(0.2)
	draw_rect(Rect2(dv.position + Vector2(0, 4), dv.size), Color(0, 0, 0, 0.4))
	draw_rect(dv, dv_c)
	draw_rect(dv, COL.line, false, 2.0)
	label(Vector2(64.0, 288.0), "DEVOLVER", 18, COL.text, HORIZONTAL_ALIGNMENT_CENTER, 212.0)
	draw_rect(Rect2(64.0, 316.0, 212.0, 20.0), Color("#0c1218"))
	# mensagem e moedas
	var head := "Passou! A máquina devolveu." if msg_t > 0.0 else "Insira as moedas:"
	label(Vector2(326.0, 78.0), head, 15, red if msg_t > 0.0 else dim, HORIZONTAL_ALIGNMENT_LEFT, 220.0)
	for k in 3:
		var cy: float = CY[k]
		var r: float = CR[k]
		var c := Vector2(CX, cy)
		var fill: Color = Color("#cfd4dc") if k < 2 else Color("#c07a45")
		if k == hover:
			fill = fill.lightened(0.2)
		draw_circle(c, r, COL.line)
		draw_circle(c, r - 3.0, fill)
		draw_arc(c, r - 9.0, 0.0, TAU, 32, fill.darkened(0.25), 2.0, true)
		label(Vector2(c.x - r, c.y + 6.0), COIN_TXT[k], 16, COL.bg, HORIZONTAL_ALIGNMENT_CENTER, r * 2.0)
		label(Vector2(430.0, c.y + 6.0), COIN_VAL[k], 18, COL.text)
