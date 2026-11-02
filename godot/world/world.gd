extends Node3D
## Junta tudo: ambiente/luz, escritório, jogadores, chefe, HUD e as fases do dia.

var office: Office
var boss: Boss
var hud: Node
var local_player: Player
var remotes := {}
var pcs: Array = []
var sun: DirectionalLight3D
var env: Environment
var heists: Node
var _printer_cd := 0.0
var _radio_cd := 0.0
var _radio_player: AudioStreamPlayer3D
var _printer_player: AudioStreamPlayer3D
var _elev_t := 0.0
var _phase_t := 0.0
var _last_lamp := false
var autoplay: Node
var _noise_acc := 0.0
var hall: Hall
var _down_done := false

func _ready() -> void:
	_environment()
	office = Office.new()
	add_child(office)
	office.build()
	office.set_elevator(1.0)
	office.set_door(1.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	office.build_nav()
	office.set_elevator(0.0)
	office.set_door(0.0)
	# PCs de todas as mesas
	var my_desk := int(Net.players.get(Game.me(), {}).get("desk", 0))
	for i in office.desks.size():
		var pc := PcScreen.new()
		add_child(pc)
		pc.setup(office.desks[i].screen_quad, office.desks[i].monitor, i == my_desk)
		pcs.append(pc)
	# jogador local
	local_player = Player.new()
	add_child(local_player)
	local_player.setup(self, my_desk)
	local_player.pc = pcs[my_desk]
	local_player.pc.work.connect(_on_work)
	local_player.pc.fun.connect(_on_fun)
	local_player.pc.mistake.connect(_on_mistake)
	var me_body := Telinha.new()
	local_player.add_child(me_body)
	me_body.setup(Settings.look)
	_set_layer(me_body, 2)
	# outros jogadores
	for id in Net.players:
		if id != Game.me():
			_add_remote(id)
	boss = Boss.new()
	add_child(boss)
	boss.setup(self)
	hall = Hall.new()
	add_child(hall)
	hall.build()
	hall.counter_it.used.connect(func(_p): hud.open_shop())
	hall.exit_it.used.connect(func(_p):
		if Game.host():
			hud.close_modal()
			Game.next_day()
		else:
			hud.toast("Quem abre a porta é o anfitrião.", ""))
	for it in [hall.counter_it, hall.exit_it]:
		it.check = func(_p): return "" if Game.phase == "hall" else " "
	heists = preload("res://game/heist_world.gd").new()
	heists.name = "Heists"     # nome fixo: os RPCs usam o caminho do nó
	add_child(heists)
	heists.setup(self)
	# interações fixas do mapa
	for it in office.interactables:
		it.used.connect(_on_interact.bind(it))
		it.check = _check_interact.bind(it)
	hud = preload("res://ui/hud.gd").new()
	add_child(hud)
	hud.setup(self)
	Game.phase_changed.connect(_on_phase)
	if OS.get_cmdline_user_args().has("--autoplay") or OS.get_cmdline_args().has("--autoplay"):
		autoplay = preload("res://tools/autoplay.gd").new()
		add_child(autoplay)
		autoplay.setup(self)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	Sfx.ambience(true)
	Sfx.stop_music()
	Game.world_ready(self)

func _set_layer(n: Node, layer_bit: int) -> void:
	if n is VisualInstance3D:
		n.layers = layer_bit
	for c in n.get_children():
		_set_layer(c, layer_bit)

func _add_remote(id: int) -> void:
	var rp := RemotePlayer.new()
	add_child(rp)
	var info: Dictionary = Net.players[id]
	rp.setup(self, id, int(info.get("look", 0)), str(info.get("name", "?")))
	rp.global_position = office.desks[int(info.desk)].chair
	remotes[id] = rp

func remove_player(id: int) -> void:
	if remotes.has(id):
		remotes[id].queue_free()
		remotes.erase(id)

# ------------------------------------------------------------------ luz e ambiente
func _environment() -> void:
	var we := WorldEnvironment.new()
	env = Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color("#6fa8e8")
	sm.sky_horizon_color = Color("#f5d6a8")
	sm.ground_horizon_color = Color("#d9b48c")
	sm.ground_bottom_color = Color("#6b5a4a")
	sm.sun_angle_max = 20.0
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.05
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 1.1
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.12
	env.adjustment_contrast = 1.04
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 40.0
	sun.light_energy = 2.2
	sun.light_angular_distance = 1.2
	add_child(sun)
	_apply_quality()
	Settings.quality_changed.connect(_apply_quality)

func _apply_quality() -> void:
	var q := Settings.quality
	env.ssao_enabled = q >= 1
	env.ssao_radius = 1.2
	env.ssao_intensity = 1.6
	env.ssil_enabled = q >= 2
	env.sdfgi_enabled = q >= 2
	env.sdfgi_use_occlusion = true
	env.sdfgi_energy = 0.9
	env.sdfgi_cascades = 2
	env.sdfgi_min_cell_size = 0.1
	env.volumetric_fog_enabled = q >= 2
	env.volumetric_fog_density = 0.012
	env.volumetric_fog_albedo = Color(1.0, 0.95, 0.85)
	env.volumetric_fog_anisotropy = 0.6
	sun.light_volumetric_fog_energy = 2.5
	sun.shadow_blur = 1.0
	get_viewport().msaa_3d = Viewport.MSAA_2X if q >= 1 else Viewport.MSAA_DISABLED
	get_viewport().scaling_3d_scale = 1.0 if q >= 1 else 0.8

## o sol atravessa o dia: fresco de manhã, dourado à tarde, laranja no fim
func _update_sun() -> void:
	if Game.phase in ["hall", "elevator_down", "over"]:
		sun.light_color = Color("#8a7cff")
		sun.light_energy = 0.25
		sun.rotation_degrees = Vector3(-10, -95, 0)
		env.ambient_light_energy = 0.2
		return
	env.ambient_light_energy = 0.45
	var k := clampf(Game.t / B.DAY_SECONDS, 0.0, 1.0)
	var cols := [Color("#fff4e0"), Color("#ffe2a8"), Color("#ffb46b"), Color("#ff8a5c")]
	var seg := k * (cols.size() - 1)
	var i := mini(int(seg), cols.size() - 2)
	sun.light_color = cols[i].lerp(cols[i + 1], seg - i)
	var elev := lerpf(-38.0, -14.0, k)
	var azim := lerpf(-120.0, -95.0, k)   # vem do oeste
	sun.rotation_degrees = Vector3(elev, azim, 0)
	sun.light_energy = lerpf(2.0, 2.6, k)

# ------------------------------------------------------------------ fases
func _on_phase(p: String) -> void:
	_phase_t = 0.0
	match p:
		"elevator_up":
			_put_in_elevator()
		"day":
			office.elevator_display.text = "7º"
			if Game.host():
				boss.start_day_walk()
		"leaving":
			Sfx.play("day_end_bell")
			hud.big("18:00!", Color("#ffc94a"))
			if local_player.sitting:
				local_player.stand_up()
		"elevator_down":
			_down_done = false
			hall.set_doors(0.0)

func _put_in_elevator() -> void:
	if local_player.sitting:
		local_player.stand_up()
	# todos sobem juntos; o chefe vem na cabine e dá o briefing cara a cara
	var spots := [Vector3(-0.6, 0, 10.5), Vector3(0.6, 0, 10.5), Vector3(-0.6, 0, 11.1), Vector3(0.6, 0, 11.1)]
	local_player.global_position = spots[int(Net.players.get(Game.me(), {}).get("desk", 0)) % 4]
	local_player.look_yaw = PI
	local_player.look_pitch = -0.05
	local_player.velocity = Vector3.ZERO
	boss.global_position = Vector3(0, 0, 11.95)
	boss.yaw = 0.0
	boss.visible = true
	boss.away = false
	boss.steps.clear()
	boss.state = "elevador_manha"
	office.set_elevator(0.0)
	_elev_t = 0.0

func _process(delta: float) -> void:
	if hud == null:
		return
	_phase_t += delta
	_update_sun()
	if Game.phase == "elevator_up":
		_elev_t += delta
		local_player.shake(0.015 if fmod(_elev_t, 1.7) < 0.2 else 0.0)
		if fmod(_elev_t, 0.9) < delta:
			boss.look.say()
		var floor_n := clampi(1 + int(_elev_t / maxf(hud.briefing_len() - 1.0, 1.0) * 6.0), 1, 7)
		office.elevator_display.text = "▲ %dº" % floor_n
		office.set_elevator(0.0)
	elif Game.phase == "day":
		office.set_elevator(clampf(_phase_t * 1.2, 0.0, 1.0) if _phase_t < 6.0 else Game.boss_state.get("elev", 0.0))
	elif Game.phase == "leaving":
		office.set_elevator(minf(_phase_t * 1.5, 1.0))
		office.elevator_display.text = "▼ 18:00"
	elif Game.phase == "elevator_down":
		# a porta fecha com todos dentro, a cabine desce e abre no térreo
		office.set_elevator(maxf(1.0 - _phase_t * 1.4, 0.0))
		if _phase_t > 1.0 and _phase_t < 4.0:
			local_player.shake(0.012)
			office.elevator_display.text = "▼ %dº" % clampi(7 - int((_phase_t - 1.0) * 2.2), 0, 7)
		if _phase_t >= 4.0 and not _down_done:
			_down_done = true
			var rel := local_player.global_position - Vector3(0, 0, 0)
			if not (absf(rel.x) < 1.15 and rel.z > 10.2):
				rel = Vector3(randf_range(-0.6, 0.6), 0, 11.2)
			local_player.global_position = Hall.OFFSET + Vector3(rel.x, 0.05, rel.z)
			local_player.look_yaw = 0.0
			Game.set_phase("hall")
	elif Game.phase == "hall":
		hall.set_doors(minf(_phase_t * 1.2, 1.0))
	# porta, lâmpada e quadro seguem o pacote do chefe
	var bs := Game.boss_state
	office.set_door(bs.get("door", 0.0))
	var lamp: bool = bs.get("lamp", false)
	office.set_lamp(lamp, _phase_t if lamp and bs.get("st", "") == "perseguindo" else 0.0)
	if lamp and not _last_lamp:
		local_player.shake(0.25)
	_last_lamp = lamp
	office.update_board(Game.agenda)
	if office.clock_hands:
		var m := B.clock_min(Game.t)
		office.clock_hands.get_node("hand0").rotation.z = -float(m % 60) / 60.0 * TAU
		office.clock_hands.get_node("hand1").rotation.z = -float(m % 720) / 720.0 * TAU
	# telas dos colegas (modo demonstração com o app que eles têm aberto)
	for id in remotes:
		var st: Dictionary = Game.pstate.get(id, {})
		var d := int(Net.players.get(id, {}).get("desk", 0))
		var app: String = st.get("ap", "")
		if app == "":
			pcs[d].power(false)
		else:
			pcs[d].open(app)
	# Ball Ops faz barulho: enche o instinto do chefe (a Pesca é silenciosa)
	_noise_acc += delta
	if _noise_acc >= 1.0:
		_noise_acc = 0.0
		if local_player.sitting and local_player.pc.focused and local_player.pc.current == "ballops":
			Game.act("instinct", {"amt": B.INSTINCT_BALLOPS * (1.0 - B.UPGRADE_QUIET * Game.up_level("pantufa") * 0.5)})
	_printer_cd = maxf(_printer_cd - delta, 0.0)
	_radio_cd = maxf(_radio_cd - delta, 0.0)

func _physics_process(delta: float) -> void:
	if boss == null or hud == null:
		return
	if Game.host() and Game.phase == "day":
		boss.host_tick(delta)
	elif Game.host():
		boss._pack()

# ------------------------------------------------------------------ PC → estado
func _on_work(amount: float) -> void:
	Game.act("work", {"amt": amount})
	hud.pulse("work")

func _on_fun(amount: float) -> void:
	Game.act("fun", {"amt": amount, "src": "pc"})
	hud.pulse("fun")

func _on_mistake(_why: String) -> void:
	pass

# ------------------------------------------------------------------ interações
func _check_interact(_p: Node, it: Interactable) -> String:
	var parts := it.id.split(":")
	match parts[0]:
		"desk":
			if int(parts[1]) != local_player.desk_idx:
				var owner := ""
				for id in Net.players:
					if int(Net.players[id].desk) == int(parts[1]):
						owner = Net.players[id].name
				return "mesa de %s" % owner if owner != "" else "mesa vazia"
			if local_player.held != "" and local_player.held != "salgadinho":
				return "largue o item antes [Q]"
		"printer":
			if _printer_cd > 0.0:
				return "impressora já travada (%ds)" % ceili(_printer_cd)
			if Game.boss_away():
				return "o chefe nem está no andar"
		"radio":
			if _radio_cd > 0.0:
				return "rádio descansando (%ds)" % ceili(_radio_cd)
			if Game.boss_away():
				return "o chefe nem está no andar"
	if Game.phase != "day":
		return "espere o expediente"
	return ""

func _on_interact(_p: Node, it: Interactable) -> void:
	var parts := it.id.split(":")
	match parts[0]:
		"desk":
			local_player.sit_down()
		"printer", "radio":
			local_player.in_panel = true
			hud.open_panel("fios" if parts[0] == "printer" else "sintonizar", func(ok: bool):
				local_player.in_panel = false
				if ok:
					Game.act("distract", {"what": parts[0]}))
		"snack":
			local_player.activity = "fun"
			Sfx.play("chew", -4.0)
			Game.act("fun", {"amt": B.FUN_SNACK, "pos": it.global_position + Vector3(0, 0.4, 0)})
			Game.act("noise", {"pos": it.global_position, "r": B.NOISE_RADIUS.lanche})
			get_tree().create_timer(2.5).timeout.connect(func(): local_player.activity = "")
		_:
			heists.on_interact(it)

## distração (só no host): a impressora apita / o rádio toca e o chefe vai até lá
func host_distract(_id: int, what: String) -> void:
	var pos: Vector3 = office.points.printer_front if what == "printer" else office.points.kitchen
	var hold := B.PRINTER_JAM_HOLD if what == "printer" else B.RADIO_HOLD
	if boss.distract(pos, hold):
		_distract_fx.rpc(what)

@rpc("authority", "call_local", "reliable")
func _distract_fx(what: String) -> void:
	if what == "printer":
		_printer_cd = B.PRINTER_COOLDOWN
		if _printer_player:
			_printer_player.queue_free()
		var n := Node3D.new()
		add_child(n)
		n.global_position = office.points.printer + Vector3(0, 1, 0)
		_printer_player = Sfx.loop_on("printer_jam", n, -2.0)
		get_tree().create_timer(B.PRINTER_JAM_HOLD + 6.0).timeout.connect(n.queue_free)
		Game.toast.emit("A impressora travou! O chefe vai até lá.", "good")
	else:
		_radio_cd = B.RADIO_COOLDOWN
		var n2 := Node3D.new()
		add_child(n2)
		n2.global_position = office.points.radio
		Sfx.loop_on("radio_music", n2, -4.0)
		get_tree().create_timer(B.RADIO_HOLD + 8.0).timeout.connect(n2.queue_free)
		Game.toast.emit("O rádio da copa começou a tocar. O chefe foi desligar.", "good")

func drop_item(p: Player) -> void:
	heists.drop(p)

func host_confiscate(id: int) -> void:
	heists.host_confiscate(id)

# ------------------------------------------------------------------ retornos visuais
func on_sat(p: Player) -> void:
	hud.tip_once("sentou", "Na tela: [F] trabalha · [1-4] troca de app · [ESPAÇO] alterna jogo↔trabalho · [E] levanta")
	if p.held == "salgadinho":
		p.in_panel = true
		hud.open_panel("comer", func(ok: bool):
			p.in_panel = false
			if ok:
				heists._hold("")
				Game.act("heist", {"a": "step", "step": 2, "msg": "Crocante. Delicioso. Proibido."}))

func on_stood(_p: Player) -> void:
	pass

func on_clutch() -> void:
	Sfx.play("clutch")
	hud.big("CLUTCH!", Game.C_FUN)
	if not Net.online():
		Engine.time_scale = 0.35
		get_tree().create_timer(0.5, true, false, true).timeout.connect(func(): Engine.time_scale = 1.0)

func on_me_fired(reason: String) -> void:
	hud.fired(reason)
	local_player.shake(0.8)

func on_fx(kind: String, a: String, _b: String, _pos: Vector3) -> void:
	match kind:
		"door_warn":
			hud.warn_boss()
		"caught":
			if a == Settings.player_name or not Net.online():
				local_player.shake(0.6)
				hud.flash(Color(1, 0.2, 0.2, 0.5))

func paused_ui() -> bool:
	return hud != null and hud.blocking()
