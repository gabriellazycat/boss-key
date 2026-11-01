extends Control
## A "casca" do BossOS: papel de parede, moldura da janela, barra de tarefas com as teclas 1–4
## e a dica de ESPAÇO = ALT-TAB. Sem app aberto, mostra o descanso de tela.

var pc: PcScreen
var _t := 0.0
const FONT: Font = preload("res://assets/fonts/PixelifySans.ttf")
const LABEL := {"planilha": "Planilha", "triagem": "E-mails", "ballops": "Ball Ops", "pesca": "Pesca"}
const COLORS := {"planilha": Color("#1e7a46"), "triagem": Color("#2f5fa8"), "ballops": Color("#e0832b"), "pesca": Color("#2a8fbf")}

func _ready() -> void:
	size = Vector2(PcScreen.SIZE)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func tick(delta: float) -> void:
	_t += delta
	queue_redraw()

func _draw() -> void:
	var w := float(PcScreen.SIZE.x)
	var h := float(PcScreen.SIZE.y)
	if pc.current == "":
		_screensaver(w, h)
		return
	# papel de parede
	draw_rect(Rect2(0, 0, w, h), Color("#3a6fd8"))
	for i in 7:
		draw_circle(Vector2(60 + i * 70, 120 + sin(_t * 0.5 + i) * 10), 40, Color(1, 1, 1, 0.04))
	# janela
	var app: PcApp = pc.apps[pc.current]
	var accent: Color = COLORS.get(pc.current, Color("#2fb8a6"))
	draw_rect(Rect2(10, 6, w - 20, 266), Color("#1d1b25"))
	draw_rect(Rect2(12, 8, w - 24, 20), accent)
	draw_string(FONT, Vector2(20, 23), app.title, HORIZONTAL_ALIGNMENT_LEFT, w - 90, 13, Color.WHITE)
	for k in 3:
		draw_rect(Rect2(w - 30 - k * 16, 12, 11, 11), Color(1, 1, 1, 0.35 + 0.2 * k))
	# dica do app (abaixo da área de conteúdo)
	draw_rect(Rect2(12, 266, w - 24, 4), accent)
	# barra de tarefas
	draw_rect(Rect2(0, 276, w, 44), Color("#15131d"))
	draw_rect(Rect2(6, 282, 58, 32), Color("#e8394d"))
	draw_string(FONT, Vector2(12, 303), "BossOS", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color.WHITE)
	var x := 70.0
	for i in PcScreen.ORDER.size():
		var id: String = PcScreen.ORDER[i]
		if not pc.apps.has(id):
			continue
		var active := id == pc.current
		var c: Color = COLORS[id]
		draw_rect(Rect2(x, 282, 74, 32), c if active else c.darkened(0.55))
		if active:
			draw_rect(Rect2(x, 311, 74, 3), Color.WHITE)
		draw_string(FONT, Vector2(x + 5, 296), "%d" % (i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.7))
		draw_string(FONT, Vector2(x + 5, 309), LABEL[id], HORIZONTAL_ALIGNMENT_LEFT, 66, 12, Color.WHITE)
		x += 78.0
	var blink := fmod(_t, 1.0) < 0.6
	draw_string(FONT, Vector2(w - 92, 296), "ESPAÇO", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#ffc94a") if blink else Color("#9a8f70"))
	draw_string(FONT, Vector2(w - 92, 310), "= ALT-TAB", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#ffc94a"))

func _screensaver(w: float, h: float) -> void:
	draw_rect(Rect2(0, 0, w, h), Color("#0d0c14"))
	var p := Vector2(w * 0.5 + sin(_t * 0.7) * 150.0, h * 0.5 + sin(_t * 1.1) * 90.0)
	draw_string(FONT, p - Vector2(50, 0), "BossOS", HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color.from_hsv(fmod(_t * 0.1, 1.0), 0.6, 1.0))
	draw_string(FONT, p + Vector2(-60, 22), "trabalhando duro™", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.5))
