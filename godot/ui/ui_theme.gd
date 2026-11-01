class_name UiTheme
## Tema único da interface: fonte arredondada, cartões escuros com cantos redondos, botões gordinhos.

static func make() -> Theme:
	var t := Theme.new()
	t.default_font = preload("res://assets/fonts/Fredoka.ttf")
	t.default_font_size = 20
	var card := StyleBoxFlat.new()
	card.bg_color = Color(0.09, 0.08, 0.13, 0.84)
	card.set_corner_radius_all(16)
	card.set_content_margin_all(14)
	card.border_color = Color(1, 1, 1, 0.08)
	card.set_border_width_all(2)
	t.set_stylebox("panel", "PanelContainer", card)
	for st in ["normal", "hover", "pressed", "focus", "disabled"]:
		var b := StyleBoxFlat.new()
		b.set_corner_radius_all(14)
		b.content_margin_left = 22
		b.content_margin_right = 22
		b.content_margin_top = 10
		b.content_margin_bottom = 10
		match st:
			"normal": b.bg_color = Color("#2fb8a6")
			"hover": b.bg_color = Color("#3fd6c2")
			"pressed": b.bg_color = Color("#23897b")
			"focus":
				b.bg_color = Color(0, 0, 0, 0)
				b.border_color = Color("#ffc94a")
				b.set_border_width_all(3)
			"disabled": b.bg_color = Color(0.3, 0.3, 0.36)
		b.shadow_color = Color(0, 0, 0, 0.3)
		b.shadow_size = 4 if st != "focus" else 0
		t.set_stylebox(st, "Button", b)
	t.set_color("font_color", "Button", Color.WHITE)
	t.set_color("font_hover_color", "Button", Color.WHITE)
	t.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.45))
	t.set_font_size("font_size", "Button", 22)
	t.set_color("font_color", "Label", Color.WHITE)
	var le := StyleBoxFlat.new()
	le.bg_color = Color(1, 1, 1, 0.1)
	le.set_corner_radius_all(10)
	le.set_content_margin_all(10)
	t.set_stylebox("normal", "LineEdit", le)
	t.set_stylebox("focus", "LineEdit", le)
	return t

static func title(text: String, size := 40, color := Color("#ffc94a")) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l

static func text(s: String, size := 20, color := Color.WHITE) -> Label:
	var l := Label.new()
	l.text = s
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l

static func button(text: String, cb: Callable, color := Color()) -> Button:
	var b := Button.new()
	b.text = text
	b.pressed.connect(func():
		Sfx.play("ui_click", -4.0)
		cb.call())
	b.mouse_entered.connect(func(): Sfx.play("ui_hover", -10.0))
	if color != Color():
		var sb: StyleBoxFlat = b.get_theme_stylebox("normal").duplicate() if b.has_theme_stylebox("normal") else StyleBoxFlat.new()
		sb.bg_color = color
		sb.set_corner_radius_all(14)
		sb.content_margin_left = 22
		sb.content_margin_right = 22
		sb.content_margin_top = 10
		sb.content_margin_bottom = 10
		b.add_theme_stylebox_override("normal", sb)
	return b
