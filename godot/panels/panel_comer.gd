extends PanelGame
## COMER ESCONDIDO: dê 10 mordidas no salgadinho sem o barulho chegar a 100.

const BITES_NEED := 10
const NOISE_UP := 18.0
const NOISE_DOWN := 30.0
const BAG := Color("#f5a524")
const CRUMB := Color("#ffd27a")
const BAG_RECT := Rect2(195.0, 135.0, 170.0, 200.0)
const BAG_PTS := [Vector2(200, 150), Vector2(215, 140), Vector2(230, 152), Vector2(245, 138), Vector2(260, 152), Vector2(280, 138), Vector2(300, 152), Vector2(315, 138), Vector2(330, 152), Vector2(345, 140), Vector2(360, 150), Vector2(356, 330), Vector2(204, 330)]

var bites := 0
var noise := 0.0
var flash := 0.0
var failed := false
var marks: Array = []      # posições das mordidas no saco
var crumbs: Array = []     # partículas: {p, v, t}

func setup() -> void:
	title = "Comer escondido"
	hint = "Clique para morder — devagar, sem estourar o barulho!"

func tick(delta: float) -> void:
	noise = maxf(0.0, noise - NOISE_DOWN * speed * delta)
	flash = maxf(0.0, flash - delta * 4.0)
	for i in range(crumbs.size() - 1, -1, -1):
		var c: Dictionary = crumbs[i]
		var life: float = c["t"] - delta
		if life <= 0.0:
			crumbs.remove_at(i)
			continue
		var v: Vector2 = c["v"] + Vector2(0.0, 520.0 * delta)
		var p: Vector2 = c["p"] + v * delta
		crumbs[i] = {"p": p, "v": v, "t": life}

func _gui_input(event: InputEvent) -> void:
	if _finished:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_bite()

func _bite() -> void:
	bites += 1
	noise += NOISE_UP
	flash = 1.0
	var side := -82.0 if randf() < 0.5 else 82.0
	var p := Vector2(280.0 + side, randf_range(175.0, 285.0))
	marks.append(p)
	for _k in 8:
		var a := randf_range(0.0, TAU)
		var sp := randf_range(90.0, 220.0)
		var v := Vector2(cos(a), sin(a) * 0.8 - 0.5) * sp
		crumbs.append({"p": p, "v": v, "t": randf_range(0.5, 0.9)})
	Sfx.play("chew", -4.0)
	if noise >= 100.0:
		noise = 100.0
		failed = true
		finish(false)
	elif bites >= BITES_NEED:
		finish(true)

func draw_game() -> void:
	var off := Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * (noise / 100.0) * 6.0
	_draw_bag(off)
	_draw_bars()
	for c in crumbs:
		var d: Dictionary = c
		var p: Vector2 = d["p"]
		draw_rect(Rect2(p - Vector2(3, 3), Vector2(6, 6)), CRUMB)
	if failed:
		draw_rect(Rect2(120.0, 296.0, 320.0, 44.0), COL.bg)
		draw_rect(Rect2(120.0, 296.0, 320.0, 44.0), COL.red, false, 3.0)
		label(Vector2(120.0, 327.0), "Barulho demais!", 28, COL.red, HORIZONTAL_ALIGNMENT_CENTER, 320.0)

func _draw_bag(off: Vector2) -> void:
	var hov := BAG_RECT.has_point(mouse())
	var body: Color = BAG.lightened(0.15) if hov else BAG
	body = body.lightened(flash * 0.4)
	var pts := PackedVector2Array()
	for p in BAG_PTS:
		pts.append(p + off)
	draw_colored_polygon(pts, body)
	draw_polyline(pts, body.darkened(0.35), 3.0, true)
	for m in marks:
		draw_circle(m + off, 16.0, COL.bg)
	var lc := Vector2(280.0, 240.0) + off
	draw_circle(lc, 38.0, COL.red)
	label(Vector2(lc.x - 60.0, lc.y + 8.0), "CHIPS", 22, COL.yellow, HORIZONTAL_ALIGNMENT_CENTER, 120.0)

func _draw_bars() -> void:
	var green: Color = COL.green
	var yellow: Color = COL.yellow
	var red: Color = COL.red
	var noise_c: Color = green if noise < 60.0 else (yellow if noise < 85.0 else red)
	label(Vector2(40.0, 70.0), "COMIDA %d/%d" % [bites, BITES_NEED], 16, COL.text)
	_bar(Rect2(190.0, 54.0, 280.0, 20.0), float(bites) / BITES_NEED, green)
	label(Vector2(40.0, 106.0), "BARULHO", 16, COL.text)
	_bar(Rect2(190.0, 90.0, 280.0, 20.0), noise / 100.0, noise_c)
	label(Vector2(480.0, 106.0), "%d%%" % int(noise), 16, noise_c)

func _bar(r: Rect2, frac: float, col: Color) -> void:
	draw_rect(r, COL.bg)
	draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(frac, 0.0, 1.0), r.size.y)), col)
	draw_rect(r, COL.line, false, 2.0)
