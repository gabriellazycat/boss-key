extends Node3D
## Menu principal: um Telinha girando ao lado de uma mesa, título e botões.
## Também aceita atalhos de linha de comando para testes: --solo, --host, --join=IP, --autoplay, --seed=N.

var ui: Control
var col: VBoxContainer
var lobby_box: VBoxContainer
var status: Label
var preview: Telinha
var name_edit: LineEdit
var look_lbl: Label

func _ready() -> void:
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_scene()
	_ui()
	Sfx.ambience(false)
	Sfx.music("menu_music")
	Net.lobby_changed.connect(_refresh_lobby)
	Net.connection_failed.connect(func(r): status.text = r)
	Net.host_left.connect(func(): status.text = "O anfitrião saiu.")
	_cmdline()

func _args() -> PackedStringArray:
	var a := OS.get_cmdline_user_args()
	a.append_array(OS.get_cmdline_args())
	return a

func _arg(name: String) -> String:
	for a in _args():
		if a.begins_with(name + "="):
			return a.substr(name.length() + 1)
		if a == name:
			return "1"
	return ""

func _cmdline() -> void:
	var seed_s := _arg("--seed")
	var seed_v := int(seed_s) if seed_s != "" else 0
	if _arg("--name") != "":
		Settings.player_name = _arg("--name")
	if _arg("--solo") != "":
		Net.start_solo()
		Game.start_run(seed_v)
	elif _arg("--host") != "":
		Net.host_enet()
		var need := int(_arg("--players")) if _arg("--players") != "" else 2
		Net.lobby_changed.connect(func():
			if Net.players.size() >= need and not Game.in_run:
				Game.start_run(seed_v))
	elif _arg("--join") != "":
		Net.join_enet(_arg("--join") if _arg("--join") != "1" else "127.0.0.1")

func _scene() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#1b1830")
	env.ambient_light_color = Color("#7a6fa8")
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.glow_enabled = true
	env.glow_intensity = 0.6
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-35, -40, 0)
	key.light_color = Color("#ffd9a8")
	key.light_energy = 1.6
	key.shadow_enabled = true
	add_child(key)
	var rim := OmniLight3D.new()
	rim.position = Vector3(-1.5, 2.2, -1.2)
	rim.light_color = Color("#3fd6c2")
	rim.light_energy = 2.0
	rim.omni_range = 5.0
	add_child(rim)
	Kit.part(self, Vector3(6, 0.1, 6), Vector3(0, -0.05, 0), Kit.color_mat(Color("#2b2440"), 0.9), 0.02)
	preview = Telinha.new()
	add_child(preview)
	preview.setup(Settings.look)
	preview.position = Vector3(0.9, 0, 0)
	preview.rotation.y = -0.5
	# mesa com monitor ao lado
	Kit.part(self, Vector3(1.2, 0.06, 0.7), Vector3(-0.6, 0.74, 0.1), Kit.mat("mesa", 0.55), 0.025)
	Kit.part(self, Vector3(0.6, 0.46, 0.4), Vector3(-0.6, 1.05, 0.0), Kit.mat("branco", 0.45), 0.06)
	Kit.part(self, Vector3(0.5, 0.36, 0.02), Vector3(-0.6, 1.07, 0.205), Kit.color_mat(Color("#ffad5c"), 0.3, 2.0), 0.01)
	var cam := Camera3D.new()
	cam.position = Vector3(0.1, 1.35, 3.3)
	cam.rotation_degrees = Vector3(-6, 0, 0)
	cam.fov = 45
	add_child(cam)

func _process(delta: float) -> void:
	preview.rotation.y += delta * 0.35
	preview.look_target = Vector2(sin(Time.get_ticks_msec() / 1300.0) * 0.6, 0)
	preview.set_mood(1 if fmod(Time.get_ticks_msec() / 1000.0, 6.0) < 2.0 else 0)
	preview.animate(delta, 0.0)

func _ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	ui = Control.new()
	ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui.theme = UiTheme.make()
	layer.add_child(ui)
	col = VBoxContainer.new()
	col.position = Vector2(80, 90)
	col.custom_minimum_size = Vector2(440, 0)
	col.add_theme_constant_override("separation", 12)
	ui.add_child(col)
	var t := UiTheme.title("BOSS KEY", 86, Color("#ffc94a"))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	t.add_theme_constant_override("outline_size", 16)
	t.add_theme_color_override("font_outline_color", Color("#e8394d"))
	col.add_child(t)
	var sub := UiTheme.text("Enrole no escritório sem o chefe perceber.", 22, Color("#c9c3d6"))
	col.add_child(sub)
	# personagem e nome
	var who := HBoxContainer.new()
	who.add_theme_constant_override("separation", 8)
	col.add_child(who)
	name_edit = LineEdit.new()
	name_edit.text = Settings.player_name
	name_edit.max_length = 16
	name_edit.custom_minimum_size = Vector2(200, 0)
	name_edit.text_changed.connect(func(s):
		Settings.player_name = s if s.strip_edges() != "" else "Você"
		Settings.save())
	who.add_child(name_edit)
	who.add_child(UiTheme.button("◀", func(): _cycle(-1)))
	look_lbl = UiTheme.text(Telinha.LOOKS[Settings.look].name, 20)
	look_lbl.custom_minimum_size = Vector2(90, 0)
	look_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	who.add_child(look_lbl)
	who.add_child(UiTheme.button("▶", func(): _cycle(1)))
	col.add_child(UiTheme.button("JOGAR SOLO", func():
		Net.start_solo()
		Game.start_run(), Color("#e8394d")))
	if Net.steam_available():
		col.add_child(UiTheme.button("Criar sala na Steam (convidar amigos)", func():
			Net.host_steam()
			_show_lobby()))
	col.add_child(UiTheme.button("Criar sala (rede local / IP)", func():
		var err := Net.host_enet()
		status.text = "" if err == OK else "Não deu para abrir a porta %d." % Net.PORT
		_show_lobby()))
	var join := HBoxContainer.new()
	col.add_child(join)
	var ip := LineEdit.new()
	ip.placeholder_text = "IP do anfitrião"
	ip.text = "127.0.0.1"
	ip.custom_minimum_size = Vector2(220, 0)
	join.add_child(ip)
	join.add_child(UiTheme.button("Entrar", func():
		status.text = "Conectando…"
		Net.join_enet(ip.text.strip_edges())
		_show_lobby()))
	col.add_child(UiTheme.button("Opções", func(): _options()))
	col.add_child(UiTheme.button("Sair", func(): get_tree().quit(), Color("#4a4560")))
	status = UiTheme.text("", 18, Color("#ffd98a"))
	col.add_child(status)
	if Settings.best_days > 0:
		col.add_child(UiTheme.text("Recorde: %d dias · %d FUN" % [Settings.best_days, Settings.best_fun], 18, Color("#9a93ad")))
	lobby_box = VBoxContainer.new()
	lobby_box.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	lobby_box.position = Vector2(-520, 120)
	lobby_box.custom_minimum_size = Vector2(440, 0)
	lobby_box.add_theme_constant_override("separation", 10)
	lobby_box.visible = false
	ui.add_child(lobby_box)

func _cycle(d: int) -> void:
	Settings.look = posmod(Settings.look + d, Telinha.LOOKS.size())
	Settings.save()
	look_lbl.text = Telinha.LOOKS[Settings.look].name
	preview.queue_free()
	preview = Telinha.new()
	add_child(preview)
	preview.setup(Settings.look)
	preview.position = Vector3(0.9, 0, 0)

func _options() -> void:
	var p := PanelContainer.new()
	var v := VBoxContainer.new()
	p.add_child(v)
	v.add_child(UiTheme.title("OPÇÕES", 32))
	v.add_child(Options.make())
	v.add_child(UiTheme.button("Fechar", func(): p.queue_free()))
	p.position = Vector2(560, 160)
	ui.add_child(p)

func _show_lobby() -> void:
	lobby_box.visible = true
	_refresh_lobby()

func _refresh_lobby() -> void:
	for c in lobby_box.get_children():
		c.queue_free()
	lobby_box.add_child(UiTheme.title("SALA", 34))
	for id in Net.players:
		var p: Dictionary = Net.players[id]
		lobby_box.add_child(UiTheme.text("● %s%s" % [p.name, "  (anfitrião)" if id == 1 else ""], 22, Telinha.LOOKS[int(p.look) % Telinha.LOOKS.size()].body))
	if Net.mode == Net.Mode.STEAM and Net.is_host():
		lobby_box.add_child(UiTheme.button("Convidar amigos (Steam)", func(): Net.invite_friends()))
	if Net.is_host() and Net.players.size() >= 1:
		lobby_box.add_child(UiTheme.button("COMEÇAR (%d jogador%s)" % [Net.players.size(), "es" if Net.players.size() > 1 else ""], func(): Game.start_run(), Color("#e8394d")))
	elif not Net.is_host():
		lobby_box.add_child(UiTheme.text("Esperando o anfitrião começar…", 18, Color("#c9c3d6")))
