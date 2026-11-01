class_name PcScreen
extends Node
## O PC de uma mesa: um SubViewport 2D (BossOS) desenhado ao vivo na tela 3D do monitor.
## Quem passa vê de longe se é planilha (azul-claro) ou jogo (laranja) — inclusive o chefe.

signal work(amount: float)
signal fun(amount: float)
signal mistake(text: String)

const SIZE := Vector2i(480, 320)
const ORDER := ["planilha", "triagem", "ballops", "pesca"]
const SCRIPTS := {
	"planilha": "res://pc/work_rhythm.gd", "triagem": "res://pc/work_triage.gd",
	"ballops": "res://pc/game_shooter.gd", "pesca": "res://pc/game_fish.gd",
}

var vp: SubViewport
var desktop: Control
var apps := {}
var current := ""            # "" = descanso de tela
var last_work := "planilha"
var last_fun := "ballops"
var focused := false
var owner_local := false
var light: OmniLight3D
var switched_to_work_at := -99.0

func setup(quad: MeshInstance3D, monitor: Node3D, local: bool) -> void:
	owner_local = local
	vp = SubViewport.new()
	vp.size = SIZE
	vp.disable_3d = true
	vp.transparent_bg = false
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	add_child(vp)
	desktop = preload("res://pc/desktop.gd").new()
	desktop.pc = self
	vp.add_child(desktop)
	for id in ORDER:
		var path: String = SCRIPTS[id]
		if not ResourceLoader.exists(path):
			continue
		var app: PcApp = load(path).new()
		app.position = Vector2(16, 30)
		app.visible = false
		app.demo = not local
		desktop.add_child(app)
		apps[id] = app
		if local:
			app.earned_work.connect(func(a): work.emit(a))
			app.earned_fun.connect(func(a): fun.emit(a))
			app.mistake.connect(func(t): mistake.emit(t))
	# tela sem sombreamento: nítida, sem reflexo da luz da mesa, e brilha um pouco (glow)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_texture = vp.get_texture()
	m.albedo_color = Color(1.12, 1.12, 1.12)
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	quad.material_override = m
	light = OmniLight3D.new()
	light.position = Vector3(0, 0.35, 0.45)
	light.omni_range = 1.8
	light.light_energy = 0.0
	light.shadow_enabled = false
	monitor.add_child(light)

## categoria do que está na tela: "w" trabalho · "g" jogo · "" nada
func category() -> String:
	if current == "" or not apps.has(current):
		return ""
	return "w" if apps[current].is_work else "g"

func open(id: String) -> void:
	if not apps.has(id) or id == current:
		return
	if current != "" and apps.has(current):
		apps[current].visible = false
		apps[current].on_close()
	var was_game := category() == "g"
	current = id
	var app: PcApp = apps[id]
	app.visible = true
	app.on_open()
	if app.is_work:
		last_work = id
		if was_game:
			switched_to_work_at = Game.t
	else:
		last_fun = id
	desktop.queue_redraw()

## ESPAÇO: alterna entre o último trabalho e o último jogo
func clutch() -> void:
	if category() == "g":
		open(last_work)
	else:
		open(last_fun)
	Sfx.play("alt_tab", -6.0)

func power(on: bool) -> void:
	if on and current == "":
		open(last_work)
	elif not on and current != "":
		apps[current].visible = false
		current = ""
		desktop.queue_redraw()

func set_focus(f: bool) -> void:
	focused = f
	for id in apps:
		apps[id].focused = f and id == current

func handle_input(event: InputEvent) -> void:
	for i in ORDER.size():
		if event.is_action_pressed("app_%d" % (i + 1)):
			open(ORDER[i])
			Sfx.play("ui_click", -8.0)
			return
	if current != "" and apps.has(current):
		apps[current].app_input(event)

func _process(delta: float) -> void:
	if current != "" and apps.has(current):
		var app: PcApp = apps[current]
		app.focused = focused
		app.app_process(delta)
	var cat := category()
	var target := 0.0 if cat == "" else 0.9
	light.light_energy = lerpf(light.light_energy, target, 0.1)
	light.light_color = Color("#9fdcff") if cat == "w" else Color("#ffad5c")
	desktop.tick(delta)
