extends PcApp
## Trabalho: TRIAGEM DE E-MAILS. Um e-mail entra pela direita; A arquiva (importante),
## D manda pra lixeira (spam). Acerto rende trabalho; erro faz o cartão tremer e o e-mail
## volta pro fim da fila.

const IMP_FROM := ["Chefe", "Cliente VIP", "RH", "Financeiro"]
const IMP_SUBJ := ["Relatório Q3", "Reunião 15h", "Aprovação urgente"]
const JUNK_FROM := ["PROMO!!!", "Príncipe Nigeriano", "Corrente da sorte", "Newsletter de Gatos"]
const JUNK_SUBJ := ["Você ganhou!!!", "Repasse para 10 amigos"]
const CARD_CX := 224.0
const CARD_CY := 100.0
const CARD_W := 200.0
const CARD_H := 92.0
const SLIDE_T := 0.25        # s para o e-mail entrar da direita
const GAP := 0.35            # s entre a resposta e o próximo e-mail
const FLY_T := 0.3           # s do cartão voando até a lixeira
const BIN_A := Rect2(14, 170, 116, 56)
const BIN_D := Rect2(318, 170, 116, 56)

var card: Dictionary = {}    # e-mail na tela ({} = nenhum)
var queue: Array = []        # próximos e-mails
var slide := 1.0             # 0 = entrando da direita, 1 = no lugar
var gap := 0.0               # contagem até o próximo e-mail
var shake := 0.0             # tremor depois de erro
var wrong_pending := false   # cartão errado volta pro fim da fila
var ghost_t := 0.0           # cartão voando pra lixeira (só visual)
var ghost_to := Vector2.ZERO
var triados := 0
var feedback := ""
var _fb_t := 0.0
var _fb_col := Color.WHITE
var _demo_t := 1.0

func _init() -> void:
	super()
	app_id = "triagem"
	title = "Caixa de entrada — 47 não lidos"
	is_work = true
	key_hint = "[A] arquivar  ·  [D] lixeira"

func app_process(delta: float) -> void:
	slide = minf(slide + delta / SLIDE_T, 1.0)
	shake = maxf(shake - delta, 0.0)
	ghost_t = maxf(ghost_t - delta, 0.0)
	_fb_t = maxf(_fb_t - delta, 0.0)
	if gap > 0.0:
		gap -= delta
		if gap <= 0.0:
			_next_mail()
	elif card.is_empty():
		_next_mail()
	if demo and not card.is_empty() and slide >= 1.0 and gap <= 0.0:
		_demo_t -= delta
		if _demo_t <= 0.0:
			_demo_t = randf_range(0.9, 1.6)
			var imp: bool = card["imp"]
			var wrong := randf() < 0.1
			_answer(imp if not wrong else not imp, true)
	queue_redraw()

func app_input(event: InputEvent) -> void:
	if event.is_action_pressed("sort_a"):
		_answer(true, false)
	elif event.is_action_pressed("sort_b"):
		_answer(false, false)

## choice_a: true = A (arquivar), false = D (lixeira)
func _answer(choice_a: bool, quiet: bool) -> void:
	if card.is_empty() or slide < 1.0 or gap > 0.0:
		return
	var imp: bool = card["imp"]
	gap = GAP
	if imp == choice_a:
		triados += 1
		if not quiet:
			earned_work.emit(B.WORK_SORT)
			Sfx.play("sort_ok", -6.0)
		_feedback("triado!", COL.green)
		ghost_t = FLY_T
		ghost_to = BIN_A.get_center() if choice_a else BIN_D.get_center()
		card = {}
	else:
		if not quiet:
			mistake.emit("e-mail errado")
			Sfx.play("sort_bad", -6.0)
		_feedback("errado!", COL.red)
		shake = GAP
		wrong_pending = true

func _next_mail() -> void:
	if wrong_pending:
		queue.append(card)
		wrong_pending = false
	if queue.size() < 3:
		for i in 4:
			queue.append(_make_mail())
	card = queue.pop_front()
	slide = 0.0

func _make_mail() -> Dictionary:
	if randf() < 0.5:
		return {"from": _pick(IMP_FROM), "subj": _pick(IMP_SUBJ), "imp": true}
	return {"from": _pick(JUNK_FROM), "subj": _pick(JUNK_SUBJ), "imp": false}

func _pick(arr: Array) -> String:
	return arr[randi() % arr.size()]

func _feedback(s: String, c: Color) -> void:
	feedback = s
	_fb_col = c
	_fb_t = 0.6

func _draw() -> void:
	draw_rect(Rect2(0, 0, W, H), COL.bg)
	# regra no topo, em duas linhas
	draw_rect(Rect2(0, 0, W, 36), COL.grid)
	draw_line(Vector2(0, 36), Vector2(W, 36), COL.dark, 2.0)
	text(Vector2(12, 15), "Importante (chefe, clientes, RH) → A arquiva", 12, COL.ink)
	text(Vector2(12, 30), "Spam e correntes → D lixeira", 12, COL.ink)
	# lixeiras e contador
	_draw_bin(BIN_A, COL.green, "A ARQUIVO", COL.dark)
	_draw_bin(BIN_D, COL.red, "D LIXEIRA", COL.white)
	text(Vector2(140, 200), "triados: %d" % triados, 14, COL.ink, HORIZONTAL_ALIGNMENT_CENTER, 168.0)
	if _fb_t > 0.0:
		text(Vector2(124, 162), feedback, 13, Color(_fb_col, minf(_fb_t * 2.0, 1.0)), HORIZONTAL_ALIGNMENT_CENTER, 200.0)
	# cartão atual: entra da direita
	if not card.is_empty():
		var cx := lerpf(W + 110.0, CARD_CX, 1.0 - pow(1.0 - slide, 3.0))
		var jx := sin(shake * 70.0) * 6.0 if shake > 0.0 else 0.0
		_draw_mail(card, Vector2(cx + jx, CARD_CY), shake > 0.0)
	# cartão voando para a lixeira
	if ghost_t > 0.0:
		var k := 1.0 - ghost_t / FLY_T
		var p := Vector2(CARD_CX, CARD_CY).lerp(ghost_to, k)
		var sz := Vector2(lerpf(CARD_W, 36.0, k), lerpf(CARD_H, 22.0, k))
		draw_rect(Rect2(p - sz / 2.0, sz), Color(COL.white, 1.0 - k * 0.5))
		draw_rect(Rect2(p - sz / 2.0, sz), Color(COL.dark, 1.0 - k * 0.5), false, 2.0)

func _draw_bin(r: Rect2, c: Color, label: String, tc: Color) -> void:
	draw_rect(r, c)
	draw_rect(r, COL.dark, false, 2.0)
	var lid := Rect2(r.position.x - 3.0, r.position.y - 5.0, r.size.x + 6.0, 8.0)
	draw_rect(lid, c.darkened(0.2))
	draw_rect(lid, COL.dark, false, 1.0)
	text(Vector2(r.position.x, r.position.y + 34.0), label, 13, tc, HORIZONTAL_ALIGNMENT_CENTER, r.size.x)

func _draw_mail(m: Dictionary, c: Vector2, warn: bool) -> void:
	var r := Rect2(c - Vector2(CARD_W, CARD_H) / 2.0, Vector2(CARD_W, CARD_H))
	draw_rect(Rect2(r.position + Vector2(3, 4), r.size), COL.grid)  # sombra
	var fill: Color = COL.red.lightened(0.7) if warn else COL.white
	draw_rect(r, fill)
	draw_rect(r, COL.red if warn else COL.dark, false, 2.0)
	var av := Rect2(r.position + Vector2(10, 10), Vector2(22, 22))
	draw_rect(av, COL.blue)
	draw_rect(av, COL.dark, false, 1.0)
	text(r.position + Vector2(40, 26), str(m["from"]), 15, COL.ink)
	text(r.position + Vector2(10, 52), str(m["subj"]), 13, COL.mid)
	for i in 3:
		draw_rect(Rect2(r.position.x + 10.0, r.position.y + 64.0 + i * 9.0, CARD_W - 20.0 - i * 40.0, 4.0), COL.grid)
