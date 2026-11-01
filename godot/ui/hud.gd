extends CanvasLayer
## HUD: relógio, barras de Trabalho e FUN, Suspeita com a taxa, status do chefe, objetivo atual,
## prompts, avisos, painéis, relatório do dia, loja, pausa e ajuda. Tudo montado em código.

var world: Node
var theme: Theme
var root: Control
var clock_lbl: Label
var day_lbl: Label
var strikes_lbl: Label
var work_bar: ProgressBar
var work_lbl: Label
var fun_bar: ProgressBar
var fun_lbl: Label
var sus_bar: ProgressBar
var sus_lbl: Label
var sus_rate_lbl: Label
var boss_chip: Label
var goal_lbl: Label
var heist_lbl: Label
var prompt_lbl: Label
var crosshair: Control
var toasts: VBoxContainer
var big_lbl: Label
var vignette: ColorRect
var flash_rect: ColorRect
var help: Control
var modal: Control           # painel/relatório/loja/pausa aberto
var _panel_cb: Callable
var _sus_last := 0.0
var _sus_rate := 0.0
var _last_reason := ""
var _big_t := 0.0
var _brief_lines: Array = []
var _brief_t := 0.0
var brief_box: PanelContainer
var brief_lbl: Label

const C_BG := Color(0.07, 0.06, 0.1, 0.78)
const FONT := preload("res://assets/fonts/Fredoka.ttf")

func setup(w: Node) -> void:
	world = w
	layer = 10
	theme = UiTheme.make()
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = theme
	add_child(root)
	_build()
	world.local_player.prompt_changed.connect(_on_prompt)
	Game.toast.connect(toast)
	Game.popup.connect(_world_popup)
	Game.day_report.connect(_on_report)
	Game.run_over.connect(_on_run_over)
	Game.phase_changed.connect(_on_phase)

func _build() -> void:
	vignette = ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var vm := ShaderMaterial.new()
	vm.shader = preload("res://ui/vignette.gdshader")
	vignette.material = vm
	root.add_child(vignette)
	# canto superior esquerdo: dia, relógio, strikes, barras
	var card := _card(Vector2(18, 16), Vector2(300, 0))
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	card.add_child(v)
	var top := HBoxContainer.new()
	v.add_child(top)
	day_lbl = _lbl("DIA 1", 18, Color("#ffc94a"))
	top.add_child(day_lbl)
	clock_lbl = _lbl("09:00", 34, Color.WHITE)
	clock_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	clock_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	top.add_child(clock_lbl)
	strikes_lbl = _lbl("", 18, Color("#ff6b6b"))
	v.add_child(strikes_lbl)
	var r1 := _bar_row(v, "TRABALHO", Color("#59c8ff"))
	work_bar = r1[0]
	work_lbl = r1[1]
	var r2 := _bar_row(v, "FUN", Color("#ffc94a"))
	fun_bar = r2[0]
	fun_lbl = r2[1]
	# topo central: chefe + objetivo
	var topc := VBoxContainer.new()
	topc.set_anchors_preset(Control.PRESET_CENTER_TOP)
	topc.position = Vector2(-330, 14)
	topc.custom_minimum_size = Vector2(660, 0)
	topc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(topc)
	boss_chip = _lbl("CHEFE: na sala", 20, Color.WHITE)
	boss_chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var chip_bg := StyleBoxFlat.new()
	chip_bg.bg_color = Color(0.2, 0.2, 0.26, 0.85)
	chip_bg.set_corner_radius_all(14)
	chip_bg.content_margin_left = 14
	chip_bg.content_margin_right = 14
	chip_bg.content_margin_top = 4
	chip_bg.content_margin_bottom = 4
	boss_chip.add_theme_stylebox_override("normal", chip_bg)
	topc.add_child(boss_chip)
	goal_lbl = _lbl("", 22, Color.WHITE)
	goal_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	goal_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	goal_lbl.add_theme_constant_override("outline_size", 8)
	goal_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.75))
	topc.add_child(goal_lbl)
	heist_lbl = _lbl("", 16, Color("#ffd98a"))
	heist_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heist_lbl.add_theme_constant_override("outline_size", 6)
	heist_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.75))
	topc.add_child(heist_lbl)
	# embaixo: suspeita
	var sus_box := VBoxContainer.new()
	sus_box.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	sus_box.position = Vector2(-260, -92)
	sus_box.custom_minimum_size = Vector2(520, 0)
	sus_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(sus_box)
	var sh := HBoxContainer.new()
	sus_box.add_child(sh)
	sus_lbl = _lbl("SUSPEITA 0%", 18, Color.WHITE)
	sh.add_child(sus_lbl)
	sus_rate_lbl = _lbl("", 18, Color("#ff6b6b"))
	sus_rate_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sus_rate_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	sh.add_child(sus_rate_lbl)
	sus_bar = _bar(Color("#ff4d5e"), 22)
	sus_box.add_child(sus_bar)
	# centro: mira e prompt
	crosshair = Control.new()
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crosshair.draw.connect(func(): crosshair.draw_circle(Vector2.ZERO, 3.0, Color(1, 1, 1, 0.85)))
	root.add_child(crosshair)
	prompt_lbl = _lbl("", 22, Color.WHITE)
	prompt_lbl.set_anchors_preset(Control.PRESET_CENTER)
	prompt_lbl.position = Vector2(-300, 26)
	prompt_lbl.custom_minimum_size = Vector2(600, 0)
	prompt_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_lbl.add_theme_constant_override("outline_size", 8)
	prompt_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	root.add_child(prompt_lbl)
	# avisos à direita
	toasts = VBoxContainer.new()
	toasts.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	toasts.position = Vector2(-420, 16)
	toasts.custom_minimum_size = Vector2(400, 0)
	toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toasts.add_theme_constant_override("separation", 6)
	root.add_child(toasts)
	big_lbl = _lbl("", 84, Color("#ffc94a"))
	big_lbl.set_anchors_preset(Control.PRESET_CENTER)
	big_lbl.position = Vector2(-500, -170)
	big_lbl.custom_minimum_size = Vector2(1000, 0)
	big_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	big_lbl.add_theme_constant_override("outline_size", 18)
	big_lbl.add_theme_color_override("font_outline_color", Color(0.1, 0.05, 0.1))
	root.add_child(big_lbl)
	# briefing do elevador
	brief_box = PanelContainer.new()
	brief_box.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	brief_box.position = Vector2(-380, -260)
	brief_box.custom_minimum_size = Vector2(760, 120)
	root.add_child(brief_box)
	brief_lbl = _lbl("", 24, Color.WHITE)
	brief_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	brief_box.add_child(brief_lbl)
	brief_box.visible = false
	flash_rect = ColorRect.new()
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash_rect.color = Color(1, 1, 1, 0)
	root.add_child(flash_rect)
	help = HelpOverlay.make(theme)
	help.visible = false
	root.add_child(help)

func _card(pos: Vector2, min_size: Vector2) -> PanelContainer:
	var p := PanelContainer.new()
	p.position = pos
	p.custom_minimum_size = min_size
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(p)
	return p

func _lbl(t: String, sz: int, c: Color) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", c)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func _bar(c: Color, h: float) -> ProgressBar:
	var b := ProgressBar.new()
	b.custom_minimum_size = Vector2(0, h)
	b.show_percentage = false
	var fill := StyleBoxFlat.new()
	fill.bg_color = c
	fill.set_corner_radius_all(int(h / 2))
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.12)
	bg.set_corner_radius_all(int(h / 2))
	b.add_theme_stylebox_override("fill", fill)
	b.add_theme_stylebox_override("background", bg)
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b

func _bar_row(parent: Control, name: String, c: Color) -> Array:
	var h := HBoxContainer.new()
	parent.add_child(h)
	var l := _lbl(name, 15, c)
	l.custom_minimum_size = Vector2(90, 0)
	h.add_child(l)
	var b := _bar(c, 14)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(b)
	var n := _lbl("0/0", 15, Color.WHITE)
	n.custom_minimum_size = Vector2(64, 0)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	h.add_child(n)
	return [b, n]

# ------------------------------------------------------------------ por frame
func _process(delta: float) -> void:
	var me: Dictionary = Game.my()
	day_lbl.text = "DIA %d" % Game.day
	clock_lbl.text = B.clock_text(Game.t)
	var s := ""
	for i in B.STRIKES_MAX:
		s += "✖ " if i < Game.strikes else "○ "
	strikes_lbl.text = "Strikes: " + s + ("   (dia de treino)" if Game.day == 1 else "")
	work_bar.max_value = maxf(Game.quota_goal, 1.0)
	work_bar.value = minf(Game.quota, Game.quota_goal)
	work_lbl.text = "%d/%d" % [int(Game.quota), int(Game.quota_goal)]
	fun_bar.max_value = maxf(Game.fun_goal, 1.0)
	fun_bar.value = minf(Game.team_fun(), Game.fun_goal)
	fun_lbl.text = "%d/%d" % [int(Game.team_fun()), int(Game.fun_goal)]
	# suspeita e a taxa atual
	var sus: float = me.get("sus", 0.0)
	var d := (sus - _sus_last) / maxf(delta, 0.0001)
	_sus_rate = lerpf(_sus_rate, maxf(d, 0.0), 0.15)
	_sus_last = sus
	sus_bar.value = sus
	sus_lbl.text = "SUSPEITA %d%%" % int(sus)
	var reasons: Dictionary = me.get("reasons", {})
	if _sus_rate > 0.3:
		var why := ""
		var best := -1.0
		for k in reasons:
			why = k
		sus_rate_lbl.text = "▲ +%d/s 👁 %s" % [ceili(_sus_rate), why]
		sus_bar.modulate = Color(1, 1, 1) * (1.0 + 0.4 * absf(sin(Time.get_ticks_msec() / 90.0)))
	else:
		sus_rate_lbl.text = ""
		sus_bar.modulate = Color.WHITE
	var vig := clampf(_sus_rate / 15.0, 0.0, 1.0) * 0.8 + clampf((sus - 60.0) / 40.0, 0.0, 1.0) * 0.4
	(vignette.material as ShaderMaterial).set_shader_parameter("amount", vig)
	_boss_status()
	_objective()
	crosshair.visible = not world.local_player.sitting and modal == null
	_big_t = maxf(_big_t - delta, 0.0)
	big_lbl.modulate.a = clampf(_big_t * 2.0, 0.0, 1.0)
	big_lbl.scale = Vector2.ONE * (1.0 + maxf(_big_t - 1.0, 0.0) * 0.3)
	flash_rect.color.a = maxf(flash_rect.color.a - delta * 2.0, 0.0)
	help.visible = Input.is_action_pressed("help") and modal == null
	_briefing(delta)

func _boss_status() -> void:
	var bs: Dictionary = Game.boss_state
	var st: String = bs.get("st", "sala")
	var txt := "CHEFE: na sala dele"
	var c := Color(0.25, 0.25, 0.32, 0.85)
	if bs.get("away", false):
		txt = "CHEFE: FORA DO ANDAR — hora do assalto!"
		c = Color(0.15, 0.55, 0.3, 0.9)
	elif st == "perseguindo":
		txt = "CHEFE: TE PERSEGUINDO! Sente com o trabalho na tela ou se esconda no WC"
		c = Color(0.85, 0.1, 0.2, 0.95)
	elif st == "distraido":
		txt = "CHEFE: distraído (impressora/rádio)"
		c = Color(0.15, 0.5, 0.55, 0.9)
	elif st == "elevador":
		txt = "CHEFE: VOLTANDO pelo elevador!"
		c = Color(0.85, 0.35, 0.1, 0.95)
	elif bs.get("lamp", false):
		txt = "CHEFE: NA RONDA — " + str(bs.get("task", ""))
		c = Color(0.8, 0.15, 0.22, 0.92)
	elif str(bs.get("task", "")).begins_with("Ao telefone"):
		txt = "CHEFE: ao telefone, na sala"
	(boss_chip.get_theme_stylebox("normal") as StyleBoxFlat).bg_color = c
	boss_chip.text = txt

## um objetivo por vez — o mais importante agora
func _objective() -> void:
	var p: Player = world.local_player
	var h: Dictionary = Game.heist
	var bs: Dictionary = Game.boss_state
	var g := ""
	if Game.phase == "elevator_up":
		g = ""
	elif Game.phase != "day":
		g = ""
	elif Game.my().get("fired", false):
		g = "Você foi demitido(a) hoje. Assista e torça pelos colegas."
	elif p.held != "":
		g = "LEVE O ITEM: " + Heists.step_text(h)
	elif bs.get("st", "") == "perseguindo":
		g = "FUJA! Sente no PC com o TRABALHO na tela, ou se esconda no WC"
	elif bs.get("lamp", false) and not p.sitting:
		g = "O chefe está na ronda: volte para a sua mesa!"
	elif bs.get("lamp", false) and p.pc.category() == "g":
		g = "Chefe por perto: [ESPAÇO] esconde o jogo!"
	elif bs.get("away", false) and not h.get("done", false):
		g = "ASSALTO: " + Heists.step_text(h)
	elif not p.sitting and Game.t < 25.0:
		g = "Sente no seu PC: olhe para a sua mesa e aperte [E]"
	elif Game.quota < Game.quota_goal and p.sitting and p.pc.category() != "w":
		g = "Bata a cota: abra a Planilha [1] e acerte o ritmo com [F]"
	elif Game.quota < Game.quota_goal:
		g = "Bata a cota de trabalho e enrole quando o chefe não estiver olhando"
	elif Game.team_fun() < Game.fun_goal:
		g = "Cota batida! Agora junte FUN: jogos [3][4], lanche, assalto"
	else:
		g = "Tudo batido. Sobreviva até as 18h!"
	goal_lbl.text = g
	heist_lbl.text = "" if h.is_empty() or Game.phase != "day" else "Assalto do dia — %s: %s" % [Heists.DEFS[h.id].nome, "FEITO ✓" if h.get("done", false) else "etapa %d/%d" % [int(h.step) + 1, Heists.steps_count(h)]]

# ------------------------------------------------------------------ briefing no elevador
func _on_phase(p: String) -> void:
	if p == "elevator_up":
		_brief_lines = _briefing_lines()
		_brief_t = 0.0
		brief_box.visible = true
		Sfx.play("elevator_move", -10.0)
	else:
		brief_box.visible = false
	if p == "day":
		Sfx.play("elevator_ding", -2.0)

func _briefing_lines() -> Array:
	var h: Dictionary = Game.heist
	var lines := []
	if Game.day == 1:
		lines = [
			"CHEFE: Bom dia. Aqui se TRABALHA. Sua mesa é a da sua cor; sente e bata a cota na planilha.",
			"CHEFE: Eu faço rondas. Quando a lâmpada vermelha da minha porta acende, estou no salão.",
			"CHEFE: Se eu te pegar jogando no PC ou passeando à toa, a SUSPEITA sobe. Em 100%… rua.",
			"(Pensamento: dá para enrolar… ESPAÇO esconde o jogo. E hoje eu vou roubar o grampeador de ouro dele.)",
		]
	else:
		lines = [
			"CHEFE: Dia %d. Cota de hoje: %d de trabalho. Nada de corpo mole." % [Game.day, int(Game.quota_goal)],
			"CHEFE: Minha agenda está no quadro ao lado da minha porta. Saio para o %s às %s." % [_lunch_name(), _lunch_time()],
			"(Pensamento: o assalto de hoje é \"%s\". A janela é quando ele sair do andar.)" % Heists.DEFS[h.id].nome,
		]
	return lines

func _lunch_name() -> String:
	for e in Game.agenda:
		if Agenda.away_kind(e.kind):
			return "almoço" if e.kind == "almoco" else "reunião"
	return "almoço"

func _lunch_time() -> String:
	for e in Game.agenda:
		if Agenda.away_kind(e.kind):
			return B.clock_text(e.t)
	return "?"

func briefing_len() -> float:
	return 3.2 * maxf(_brief_lines.size(), 1) + 1.0

func _briefing(delta: float) -> void:
	if Game.phase != "elevator_up" or _brief_lines.is_empty():
		return
	_brief_t += delta
	if Input.is_action_just_pressed("skip") and Game.host():
		_brief_t += 3.2
	var i := mini(int(_brief_t / 3.2), _brief_lines.size() - 1)
	brief_lbl.text = _brief_lines[i] + "\n\n[ENTER] pular"
	if _brief_t >= briefing_len() - 1.0 and Game.host():
		Game.start_shift()

# ------------------------------------------------------------------ avisos
func _on_prompt(t: String, blocked: bool) -> void:
	prompt_lbl.text = "" if t.strip_edges() == "" else t
	prompt_lbl.add_theme_color_override("font_color", Color("#c9c3d6") if blocked else Color.WHITE)

func toast(t: String, kind: String) -> void:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = {"good": Color(0.12, 0.45, 0.3, 0.92), "bad": Color(0.6, 0.1, 0.16, 0.92)}.get(kind, Color(0.12, 0.11, 0.17, 0.9))
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	p.add_theme_stylebox_override("panel", sb)
	var l := _lbl(t, 18, Color.WHITE)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(370, 0)
	p.add_child(l)
	toasts.add_child(p)
	toasts.move_child(p, 0)
	p.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(p, "modulate:a", 1.0, 0.15)
	tw.tween_interval(4.0)
	tw.tween_property(p, "modulate:a", 0.0, 0.4)
	tw.tween_callback(p.queue_free)
	if toasts.get_child_count() > 4:
		toasts.get_child(toasts.get_child_count() - 1).queue_free()

func big(t: String, c: Color) -> void:
	big_lbl.text = t
	big_lbl.add_theme_color_override("font_color", c)
	_big_t = 1.4

func flash(c: Color) -> void:
	flash_rect.color = c

func pulse(_kind: String) -> void:
	pass

func warn_boss() -> void:
	big("O CHEFE SAIU DA SALA!", Color("#ff4d5e"))
	Sfx.play("lamp_on", -2.0)
	world.local_player.shake(0.3)

func fired(reason: String) -> void:
	big("DEMITIDO!", Color("#ff4d5e"))
	flash(Color(0.2, 0.3, 1.0, 0.6))
	toast("Motivo: " + reason, "bad")

func tip_once(id: String, t: String) -> void:
	if Settings.first_time(id):
		toast("DICA: " + t, "")

## "+N 👁 motivo" flutuando no mundo
func _world_popup(t: String, pos: Vector3, c: Color) -> void:
	var l := Kit.label(world, t, pos, 0.22, c)
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.outline_size = 14
	l.outline_modulate = Color(0, 0, 0, 0.85)
	l.font_size = 64
	l.pixel_size = 0.22 / 64.0
	var tw := l.create_tween()
	tw.set_parallel(true)
	tw.tween_property(l, "position:y", pos.y + 0.8, 1.4)
	tw.tween_property(l, "modulate:a", 0.0, 1.4).set_delay(0.6)
	tw.chain().tween_callback(l.queue_free)

# ------------------------------------------------------------------ janelas (painel, relatório, loja, pausa)
func blocking() -> bool:
	return modal != null

func _open_modal(c: Control) -> void:
	if modal:
		modal.queue_free()
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.55)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.add_child(center)
	center.add_child(c)
	modal = shade
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func close_modal() -> void:
	if modal:
		modal.queue_free()
		modal = null
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func open_panel(kind: String, cb: Callable) -> void:
	var path := "res://panels/panel_%s.gd" % kind
	var pg: Control
	if ResourceLoader.exists(path):
		pg = load(path).new()
	else:
		pg = load("res://panels/panel_fios.gd").new()
	pg.done.connect(func(ok: bool):
		close_modal()
		cb.call(ok))
	_open_modal(pg)
	if world.autoplay:
		world.autoplay.on_panel(pg)

func _on_report(rep: Dictionary) -> void:
	if world.local_player.sitting:
		world.local_player.stand_up()
	Sfx.play("day_end_bell")
	_open_modal(Report.make(rep, self))

func _on_run_over(summary: Dictionary) -> void:
	_open_modal(Report.make_over(summary, self))

func open_shop() -> void:
	_open_modal(Report.make_shop(self))

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") and modal == null:
		_open_modal(Report.make_pause(self))
		get_viewport().set_input_as_handled()
