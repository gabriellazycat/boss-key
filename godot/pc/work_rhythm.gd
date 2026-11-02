extends PcApp
## Trabalho: PLANILHA NO RITMO. Blocos vêm da direita até a linha de acerto; aperte F quando o
## bloco estiver em cima da linha. Cada acerto preenche uma célula da planilha (a cota sobe).

var beat := 0.0
var notes: Array = []        # x de cada bloco
var cells := 0               # células preenchidas (visual)
var combo := 0
var flash := 0.0
var flash_col := Color.WHITE
var feedback := ""
var _fb_t := 0.0
const HIT_X := 64.0
const LANE_Y := 186.0
const SPEED := 150.0         # px/s

func _init() -> void:
	super()
	app_id = "planilha"
	title = "Planilha_Q3_FINAL(2).xls"
	is_work = true
	key_hint = "[F] quando o bloco passar na linha"

func app_process(delta: float) -> void:
	beat += delta
	var period := B.RHYTHM_BEAT
	while beat >= period:
		beat -= period
		notes.append(W + 10.0)
	for i in notes.size():
		notes[i] -= SPEED * delta
	# bloco que passou da linha sem ser apertado = erro leve
	while not notes.is_empty() and notes[0] < HIT_X - SPEED * B.RHYTHM_OK - 4.0:
		notes.pop_front()
		if focused:
			_miss("passou!")
	flash = maxf(flash - delta * 4.0, 0.0)
	_fb_t = maxf(_fb_t - delta, 0.0)
	if demo and not notes.is_empty() and absf(notes[0] - HIT_X) < 3.0:
		notes.pop_front()
		cells = (cells + 1) % 60
	queue_redraw()

func app_input(event: InputEvent) -> void:
	if event.is_action_pressed("work_hit"):
		if notes.is_empty():
			_miss("cedo demais")
			return
		var dt := absf(notes[0] - HIT_X) / SPEED
		if dt <= B.RHYTHM_PERFECT:
			notes.pop_front()
			_hit(B.WORK_PERFECT, "PERFEITO!", COL.yellow)
			Sfx.play("rhythm_perfect", -4.0)
		elif dt <= B.RHYTHM_OK:
			notes.pop_front()
			_hit(B.WORK_HIT, "ok", COL.accent)
			Sfx.play("rhythm_hit", -6.0)
		else:
			_miss("fora do ritmo")

func _hit(amount: float, fb: String, c: Color) -> void:
	combo += 1
	cells = (cells + 1) % 60
	var bonus := 0.25 if combo >= 8 else 0.0
	earned_work.emit(amount + bonus)
	flash = 1.0
	flash_col = c
	feedback = fb + ("  combo x%d" % combo if combo >= 4 else "")
	_fb_t = 0.7

func _miss(why: String) -> void:
	combo = 0
	feedback = why
	_fb_t = 0.7
	flash = 0.6
	flash_col = COL.red
	Sfx.play("rhythm_miss", -8.0)
	mistake.emit(why)

func _draw() -> void:
	draw_rect(Rect2(0, 0, W, H), COL.bg)
	# planilha: 6 colunas × 10 linhas; as células preenchidas mostram números
	var cw := 70.0
	var ch := 14.0
	for c in 6:
		draw_rect(Rect2(14 + c * cw, 6, cw, ch), Color("#e9e1d2"))
		text(Vector2(18 + c * cw, 18), "ABCDEF"[c], 12, COL.mid)
	for r in 10:
		for c in 6:
			var rect := Rect2(14 + c * cw, 6 + (r + 1) * ch, cw, ch)
			draw_rect(rect, COL.grid, false, 1.0)
			var idx := r * 6 + c
			if idx < cells:
				var n := (idx * 7919 + 13) % 9000 + 100
				text(rect.position + Vector2(6, 11), "R$ %d" % n, 11, COL.ink)
	# pista do ritmo
	draw_rect(Rect2(0, LANE_Y - 22, W, 44), Color("#e3f6f2"))
	draw_line(Vector2(0, LANE_Y - 22), Vector2(W, LANE_Y - 22), COL.accent, 2.0)
	var glow := COL.accent.lerp(flash_col, flash)
	draw_rect(Rect2(HIT_X - 4, LANE_Y - 20, 8, 40), glow)
	for x in notes:
		var near := absf(x - HIT_X) < SPEED * B.RHYTHM_OK
		draw_rect(Rect2(x - 12, LANE_Y - 12, 24, 24), COL.yellow if near else COL.blue)
		draw_rect(Rect2(x - 12, LANE_Y - 12, 24, 24), COL.dark, false, 2.0)
	if _fb_t > 0.0:
		draw_rect(Rect2(HIT_X + 24, LANE_Y - 42, 200, 18), COL.dark)
		text(Vector2(HIT_X + 30, LANE_Y - 28), feedback, 14, flash_col.lightened(0.2))
