class_name Telinha
extends Node3D
## O personagem: corpo de feijão, patinhas e cabeça de monitor com o rosto na tela.
## Toda animação é procedural (andar, sentar, susto, virar a cabeça).

const LOOKS := [
	{"body": Color("#2fb8a6"), "screen": Color("#bff7ee"), "name": "Teal"},
	{"body": Color("#f27fa5"), "screen": Color("#ffe1ec"), "name": "Rosa"},
	{"body": Color("#ffc94a"), "screen": Color("#fff4cf"), "name": "Mostarda"},
	{"body": Color("#7b61d9"), "screen": Color("#e3dcff"), "name": "Roxo"},
	{"body": Color("#5cbf5a"), "screen": Color("#ddf7d5"), "name": "Verde"},
	{"body": Color("#f58a3a"), "screen": Color("#ffe3cc"), "name": "Laranja"},
]

var is_boss := false
var body: Node3D
var head: Node3D
var face_mat: ShaderMaterial
var arm_l: Node3D
var arm_r: Node3D
var leg_l: Node3D
var leg_r: Node3D
var tie: Node3D
var mood := 0.0
var look_target := Vector2.ZERO
var _look := Vector2.ZERO
var _blink_t := 2.0
var _walk_phase := 0.0
var _talk_t := 0.0
var _flash := 0.0
var _squash := 0.0
var sitting := false
var screen_color := Color.WHITE

func setup(look_idx: int, boss := false) -> void:
	is_boss = boss
	var look: Dictionary = LOOKS[posmod(look_idx, LOOKS.size())]
	var body_c: Color = Color("#3b2f4a") if boss else look.body
	screen_color = Color("#ffd1c4") if boss else look.screen
	var s := 1.22 if boss else 1.0
	scale = Vector3.ONE * s
	body = Node3D.new()
	add_child(body)
	var bm := Kit.color_mat(body_c, 0.55)
	# tronco de feijão
	var torso := Kit.part(body, Vector3(0.56, 0.62, 0.42), Vector3(0, 0.62, 0), bm, 0.2)
	torso.name = "torso"
	if boss:
		# camisa branca e gravata vermelha
		Kit.part(body, Vector3(0.22, 0.4, 0.02), Vector3(0, 0.72, -0.212), Kit.color_mat(Color("#f4f1ea"), 0.6), 0.04)
		tie = Node3D.new()
		tie.position = Vector3(0, 0.88, -0.225)
		body.add_child(tie)
		var tm := Kit.color_mat(Color("#d8202f"), 0.45)
		Kit.part(tie, Vector3(0.09, 0.06, 0.02), Vector3(0, 0, 0), tm, 0.02)
		Kit.part(tie, Vector3(0.1, 0.32, 0.02), Vector3(0, -0.2, 0), tm, 0.03)
	# pernas e braços
	leg_l = _limb(Vector3(-0.14, 0.32, 0), 0.075, 0.34, bm.duplicate())
	leg_r = _limb(Vector3(0.14, 0.32, 0), 0.075, 0.34, bm.duplicate())
	for l in [leg_l, leg_r]:
		Kit.part(l, Vector3(0.15, 0.08, 0.22), Vector3(0, -0.33, -0.04), Kit.color_mat(Color("#22212b"), 0.5), 0.04)
	arm_l = _limb(Vector3(-0.33, 0.82, 0), 0.06, 0.36, bm)
	arm_r = _limb(Vector3(0.33, 0.82, 0), 0.06, 0.36, bm)
	# pescoço e cabeça-monitor
	head = Node3D.new()
	head.position = Vector3(0, 1.05, 0)
	body.add_child(head)
	Kit.cylinder(head, 0.06, 0.12, Vector3(0, 0.02, 0), Kit.color_mat(Color("#55505e"), 0.4))
	# o chefe tem monitor widescreen cinza (identidade do jogo original)
	var hw := 0.88 if boss else 0.62
	var hh := 0.5 if boss else 0.48
	var shell := Kit.color_mat(Color("#8d94a0") if boss else Color("#f3eee4"), 0.45)
	Kit.part(head, Vector3(hw, hh, 0.4 if boss else 0.44), Vector3(0, 0.3, 0.02), shell, 0.08)
	Kit.part(head, Vector3(hw - 0.14, hh - 0.1, 0.2), Vector3(0, 0.3, 0.2), shell, 0.07)
	# antena (o chefe tem duas, mais imponente)
	for ax in ([-0.12, 0.12] if boss else [0.1]):
		var ant := Kit.cylinder(head, 0.012, 0.22, Vector3(ax, 0.62, 0.05), Kit.color_mat(Color("#55505e")))
		ant.rotation.z = -ax * 2.0
		Kit.sphere(head, 0.035, Vector3(ax * 1.45, 0.73, 0.05), Kit.color_mat(Color("#ff4d5e") if boss else body_c, 0.3, 1.2))
	var screen := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(hw - 0.1, hh - 0.1)
	screen.mesh = qm
	screen.position = Vector3(0, 0.3, -0.185 if boss else -0.205)
	screen.rotation.y = PI
	face_mat = ShaderMaterial.new()
	face_mat.shader = preload("res://actors/telinha_face.gdshader")
	face_mat.set_shader_parameter("bg", screen_color)
	face_mat.set_shader_parameter("ink", Color("#2a0b12") if boss else Color("#14202a"))
	screen.material_override = face_mat
	head.add_child(screen)
	# moldura escura em volta da tela
	Kit.part(head, Vector3(hw - 0.04, hh - 0.04, 0.02), Vector3(0, 0.3, -0.17 if boss else -0.19), Kit.color_mat(Color("#1d1b25"), 0.4), 0.05)

func _limb(pos: Vector3, r: float, length: float, m: Material) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = pos
	body.add_child(pivot)
	var c := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = r
	cm.height = length
	cm.radial_segments = 12
	cm.rings = 4
	c.mesh = cm
	c.material_override = m
	c.position = Vector3(0, -length * 0.45, 0)
	pivot.add_child(c)
	return pivot

func set_mood(m: int) -> void:
	mood = float(m)

func say() -> void:
	_talk_t = 0.6

func flash() -> void:
	_flash = 1.0
	_squash = 1.0

## anima: speed = velocidade no chão (m/s); a cabeça olha para look_target (-1..1)
func animate(delta: float, speed: float) -> void:
	_blink_t -= delta
	var blink := 1.0
	if _blink_t < 0.0:
		blink = clampf(absf(_blink_t + 0.07) / 0.07, 0.0, 1.0)
		if _blink_t < -0.14:
			_blink_t = randf_range(1.8, 4.5)
	_look = _look.lerp(look_target, 1.0 - exp(-8.0 * delta))
	_talk_t = maxf(_talk_t - delta, 0.0)
	_flash = maxf(_flash - delta * 3.0, 0.0)
	_squash = maxf(_squash - delta * 4.0, 0.0)
	face_mat.set_shader_parameter("blink", blink)
	face_mat.set_shader_parameter("look", _look)
	face_mat.set_shader_parameter("mood", mood)
	face_mat.set_shader_parameter("talk", absf(sin(_talk_t * 22.0)) if _talk_t > 0.0 else 0.0)
	face_mat.set_shader_parameter("flash", _flash)
	var t := Time.get_ticks_msec() / 1000.0
	if sitting:
		leg_l.rotation.x = lerpf(leg_l.rotation.x, -1.45, 0.2)
		leg_r.rotation.x = lerpf(leg_r.rotation.x, -1.45, 0.2)
		arm_l.rotation.x = lerpf(arm_l.rotation.x, -1.1, 0.2)
		arm_r.rotation.x = lerpf(arm_r.rotation.x, -1.1 + sin(t * 18.0) * 0.08, 0.2)
		body.position.y = lerpf(body.position.y, -0.12, 0.2)
		head.rotation.y = _look.x * -0.5
		return
	var moving := clampf(speed / 3.0, 0.0, 1.6)
	_walk_phase += delta * (4.0 + speed * 2.6) * (1.0 if speed > 0.1 else 0.0)
	var sw := sin(_walk_phase) * 0.6 * moving
	leg_l.rotation.x = sw
	leg_r.rotation.x = -sw
	arm_l.rotation.x = -sw * 0.8
	arm_r.rotation.x = sw * 0.8
	arm_l.rotation.z = 0.12
	arm_r.rotation.z = -0.12
	var bob := absf(sin(_walk_phase)) * 0.05 * moving + sin(t * 2.2) * 0.008
	body.position.y = bob
	var sq := 1.0 + _squash * 0.18 * sin(_squash * 20.0)
	body.scale = Vector3(1.0 / sq, sq, 1.0 / sq)
	body.rotation.x = -0.08 * moving
	head.rotation.y = _look.x * -0.6
	head.rotation.x = _look.y * 0.25
	if tie:
		tie.rotation.x = sin(_walk_phase * 2.0) * 0.15 * moving
