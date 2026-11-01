class_name Options
## Opções: volume, música, sensibilidade, qualidade gráfica, tela cheia.

static func make() -> Control:
	var g := GridContainer.new()
	g.columns = 2
	g.add_theme_constant_override("h_separation", 18)
	g.add_theme_constant_override("v_separation", 8)
	_slider(g, "Volume", Settings.master_vol, func(x):
		Settings.master_vol = x
		Settings.apply_video())
	_slider(g, "Música", Settings.music_vol, func(x): Settings.music_vol = x)
	_slider(g, "Mouse", Settings.mouse_sens / 2.0, func(x): Settings.mouse_sens = maxf(x * 2.0, 0.1))
	g.add_child(UiTheme.text("Gráficos", 18))
	var ob := OptionButton.new()
	for n in ["Baixo", "Médio", "Alto"]:
		ob.add_item(n)
	ob.selected = Settings.quality
	ob.item_selected.connect(func(i):
		Settings.quality = i
		Settings.apply_video()
		Settings.save())
	g.add_child(ob)
	g.add_child(UiTheme.text("Tela cheia", 18))
	var cb := CheckButton.new()
	cb.button_pressed = Settings.fullscreen
	cb.toggled.connect(func(on):
		Settings.fullscreen = on
		Settings.apply_video()
		Settings.save())
	g.add_child(cb)
	return g

static func _slider(g: GridContainer, name: String, value: float, cb: Callable) -> void:
	g.add_child(UiTheme.text(name, 18))
	var s := HSlider.new()
	s.min_value = 0.0
	s.max_value = 1.0
	s.step = 0.01
	s.value = value
	s.custom_minimum_size = Vector2(260, 24)
	s.value_changed.connect(func(x):
		cb.call(x)
		Settings.save())
	g.add_child(s)
