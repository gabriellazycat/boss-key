class_name Office
extends Node3D
## O andar do escritório, montado em código. Expõe as mesas, os pontos do mapa e o grafo de
## caminhos do chefe. Planta (m): salão x[-13,13] z[-10,10]; sala do chefe ao norte com a porta
## em (0,-4.5); mesas em arco em volta da porta; copa a oeste; impressora a leste; WC a sudoeste;
## arquivo a nordeste; elevador ao sul.

const H := 3.4
const DOOR := Vector3(0, 0, -4.5)
const ARC_R := 6.6
const DESK_ANGLES := [-52.0, -18.0, 18.0, 52.0]
const BOSS_ROOM := AABB(Vector3(-4.5, 0, -10), Vector3(9, 3, 5.5))
const BATH_ROOM := AABB(Vector3(-13, 0, 6.6), Vector3(4, 3, 3.4))

var desks: Array = []          # [{chair, facing, seat_eye, monitor_pos, behind, screen, chair_node}]
var points := {}               # nome → Vector3 (chão)
var nav := AStar3D.new()
var _nav_names := {}           # nome → id no grafo
var door_pivot: Node3D
var door_open := 0.0           # 0 fechada · 1 aberta
var lamp_mat: StandardMaterial3D
var lamp_light: OmniLight3D
var board_lines: Array[Label3D] = []
var elevator_doors: Array[Node3D] = []
var elevator_open := 0.0
var interactables: Array = []
var clock_hands: Node3D
var elevator_display: Label3D

func build() -> void:
	_floor_and_ceiling()
	_walls()
	_boss_room()
	_desks()
	_kitchen()
	_printer_and_storage()
	_bathroom()
	_elevator()
	_decor()
	_outside()
	_points()

# ------------------------------------------------------------------ casca
func _floor_and_ceiling() -> void:
	Kit.solid(self, Vector3(26, 0.2, 20), Vector3(0, -0.1, 0), Kit.mat("carpete", 0.95), 0.0)
	# faixa de piso de madeira na copa e no corredor do elevador
	Kit.part(self, Vector3(4.4, 0.02, 7.2), Vector3(-10.8, 0.01, 0.5), Kit.mat("piso", 0.6), 0.0)
	Kit.part(self, Vector3(3.2, 0.02, 3.0), Vector3(0, 0.01, 8.5), Kit.mat("piso", 0.6), 0.0)
	var ceil := Kit.solid(self, Vector3(26, 0.2, 20), Vector3(0, H + 0.1, 0), Kit.mat("branco", 0.9), 0.0)
	ceil.get_child(1).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	# painéis de luz no teto (brilho próprio + luz de preenchimento)
	for x in [-8.0, 0.0, 8.0]:
		for z in [-6.0, 0.5, 6.5]:
			Kit.part(self, Vector3(1.6, 0.04, 1.0), Vector3(x, H - 0.02, z), Kit.color_mat(Color(1.0, 0.96, 0.88), 0.4, 2.2), 0.01)
	# luz de preenchimento: salão, sala do chefe, arquivo, copa e WC (sem sombra: barato)
	for p in [Vector3(-7, 3.0, 2), Vector3(7, 3.0, 2), Vector3(0, 3.0, 5), Vector3(0, 2.9, -7.4),
			Vector3(10.5, 2.9, -7.5), Vector3(-10.5, 2.9, -6.5), Vector3(-11, 2.9, 8.3), Vector3(10.5, 2.9, 7)]:
		var o := OmniLight3D.new()
		o.position = p
		o.omni_range = 8.5
		o.light_energy = 0.7
		o.light_color = Color(1.0, 0.93, 0.82)
		o.shadow_enabled = false
		add_child(o)

func _walls() -> void:
	var wm := Kit.mat("parede", 0.9)
	var t := 0.2
	# norte (atrás da sala do chefe e do arquivo)
	Kit.solid(self, Vector3(26.4, H, t), Vector3(0, H / 2, -10.1), wm, 0.0)
	# sul, com a abertura do elevador (x -1.1..1.1)
	Kit.solid(self, Vector3(11.9, H, t), Vector3(-7.05, H / 2, 10.1), wm, 0.0)
	Kit.solid(self, Vector3(11.9, H, t), Vector3(7.05, H / 2, 10.1), wm, 0.0)
	Kit.solid(self, Vector3(2.2, H - 2.5, t), Vector3(0, 2.5 + (H - 2.5) / 2, 10.1), wm, 0.0)
	# oeste e leste com janelas (persianas)
	_window_wall(-13.1, [Vector2(-9.0, -5.0), Vector2(-2.2, 2.2)], wm)
	_window_wall(13.1, [Vector2(-1.0, 3.6), Vector2(5.4, 9.0)], wm)
	# rodapé
	for s in [[Vector3(26, 0.12, 0.04), Vector3(0, 0.06, -9.98)], [Vector3(26, 0.12, 0.04), Vector3(0, 0.06, 9.98)]]:
		Kit.part(self, s[0], s[1], Kit.mat("rodape"), 0.01)

## parede vertical em x, com vãos de janela entre z0..z1 (peitoril 0,95 · topo 2,6)
func _window_wall(x: float, holes: Array, wm: Material) -> void:
	var t := 0.2
	var z := -10.2
	var sill := 0.95
	var top := 2.6
	for hole in holes:
		if hole.x > z:
			Kit.solid(self, Vector3(t, H, hole.x - z), Vector3(x, H / 2, (z + hole.x) / 2), wm, 0.0)
		var w: float = hole.y - hole.x
		var cz: float = (hole.x + hole.y) / 2
		Kit.solid(self, Vector3(t, sill, w), Vector3(x, sill / 2, cz), wm, 0.0)
		Kit.solid(self, Vector3(t, H - top, w), Vector3(x, top + (H - top) / 2, cz), wm, 0.0)
		# vidro (não bloqueia luz do sol) + persiana em lâminas: o sol entra em faixas
		var glass := Kit.part(self, Vector3(0.02, top - sill, w), Vector3(x, (sill + top) / 2, cz), Kit.mat("vidro"), 0.0)
		glass.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var inward := -signf(x)
		var slat_mat := Kit.color_mat(Color("#efe7d8"), 0.6)
		var y := top - 0.06
		while y > sill + 0.25:
			var s := Kit.part(self, Vector3(0.09, 0.012, w - 0.05), Vector3(x + inward * 0.16, y, cz), slat_mat, 0.004)
			s.rotation.z = deg_to_rad(28.0) * inward
			y -= 0.11
		Kit.part(self, Vector3(0.12, 0.05, w), Vector3(x + inward * 0.16, top + 0.02, cz), Kit.mat("metal"), 0.01)
		Kit.part(self, Vector3(0.3, 0.05, w + 0.1), Vector3(x + inward * 0.12, sill - 0.02, cz), Kit.mat("branco"), 0.01)
		z = hole.y
	if z < 10.2:
		Kit.solid(self, Vector3(t, H, 10.2 - z), Vector3(x, H / 2, (z + 10.2) / 2), wm, 0.0)

# ------------------------------------------------------------------ sala do chefe
func _boss_room() -> void:
	var wm := Kit.mat("parede2", 0.9)
	var t := 0.18
	var zf := -4.5
	# laterais
	Kit.solid(self, Vector3(t, H, 5.5), Vector3(-4.5, H / 2, -7.25), wm, 0.0)
	Kit.solid(self, Vector3(t, H, 5.5), Vector3(4.5, H / 2, -7.25), wm, 0.0)
	# frente: sólido | janela | porta | janela | sólido
	for side in [-1.0, 1.0]:
		Kit.solid(self, Vector3(1.2, H, t), Vector3(side * 3.9, H / 2, zf), wm, 0.0)
		Kit.solid(self, Vector3(2.7, 0.9, t), Vector3(side * 1.95, 0.45, zf), wm, 0.0)
		Kit.solid(self, Vector3(2.7, H - 2.4, t), Vector3(side * 1.95, 2.4 + (H - 2.4) / 2, zf), wm, 0.0)
		var g := Kit.part(self, Vector3(2.7, 1.5, 0.02), Vector3(side * 1.95, 1.65, zf), Kit.mat("vidro"), 0.0)
		g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# persiana meio aberta: dá para ver vultos lá dentro
		var y := 2.32
		while y > 1.0:
			var slat := Kit.part(self, Vector3(2.65, 0.012, 0.07), Vector3(side * 1.95, y, zf - 0.12), Kit.color_mat(Color("#d9cdb8"), 0.6), 0.004)
			slat.rotation.x = deg_to_rad(35)
			y -= 0.13
	Kit.solid(self, Vector3(1.2, H - 2.3, t), Vector3(0, 2.3 + (H - 2.3) / 2, zf), wm, 0.0)
	# batentes
	for side in [-1.0, 1.0]:
		Kit.part(self, Vector3(0.1, 2.32, 0.26), Vector3(side * 0.6, 1.16, zf), Kit.mat("madeira_esc"), 0.02)
	Kit.part(self, Vector3(1.3, 0.1, 0.26), Vector3(0, 2.33, zf), Kit.mat("madeira_esc"), 0.02)
	# porta (gira para dentro da sala)
	door_pivot = Node3D.new()
	door_pivot.position = Vector3(-0.55, 0, zf)
	add_child(door_pivot)
	var door := Kit.solid(door_pivot, Vector3(1.1, 2.25, 0.07), Vector3(0.55, 1.125, 0), Kit.mat("madeira", 0.55), 0.02)
	Kit.sphere(door, 0.045, Vector3(0.42, 0.0, 0.06), Kit.mat("amarelo", 0.3))
	Kit.part(door, Vector3(0.5, 0.16, 0.01), Vector3(0, 0.55, 0.04), Kit.mat("amarelo", 0.4), 0.02)
	Kit.label(door, "CHEFE", Vector3(0, 0.55, 0.047), 0.09, Color("#5a2a33"))
	# placa e lâmpada "NA RONDA"
	Kit.part(self, Vector3(1.5, 0.32, 0.05), Vector3(0, 2.85, zf + 0.12), Kit.mat("chefe", 0.5), 0.03)
	Kit.label(self, "DIRETORIA", Vector3(0, 2.85, zf + 0.15), 0.17, Color("#ffd98a"))
	lamp_mat = Kit.color_mat(Color("#ff2a3d"), 0.3, 0.0)
	lamp_mat.emission_enabled = true
	lamp_mat.emission = Color("#ff2a3d")
	lamp_mat.emission_energy_multiplier = 0.0
	var lamp := Kit.sphere(self, 0.13, Vector3(0.98, 2.85, zf + 0.16), lamp_mat)
	lamp.scale = Vector3(1, 1, 0.6)
	lamp_light = OmniLight3D.new()
	lamp_light.position = Vector3(0.98, 2.7, zf + 0.5)
	lamp_light.light_color = Color("#ff3344")
	lamp_light.omni_range = 5.0
	lamp_light.light_energy = 0.0
	add_child(lamp_light)
	Kit.label(self, "NA RONDA", Vector3(0.98, 2.62, zf + 0.12), 0.06, Color("#5a2a33"))
	# piso e móveis da sala
	Kit.part(self, Vector3(8.8, 0.02, 5.3), Vector3(0, 0.012, -7.3), Kit.mat("chefe_piso", 0.95), 0.0)
	Kit.solid(self, Vector3(2.2, 0.08, 1.0), Vector3(0, 0.78, -8.0), Kit.mat("madeira_esc", 0.45), 0.03)
	Kit.solid(self, Vector3(0.5, 0.74, 0.9), Vector3(-0.8, 0.37, -8.0), Kit.mat("madeira_esc"), 0.03)
	Kit.solid(self, Vector3(0.5, 0.74, 0.9), Vector3(0.8, 0.37, -8.0), Kit.mat("madeira_esc"), 0.03)
	Kit.part(self, Vector3(0.62, 0.42, 0.04), Vector3(0, 1.08, -8.3), Kit.mat("preto", 0.3), 0.02)
	Kit.part(self, Vector3(0.56, 0.36, 0.01), Vector3(0, 1.08, -8.275), Kit.color_mat(Color("#3a6fd8"), 0.4, 0.8), 0.0)
	# cadeira executiva
	Kit.part(self, Vector3(0.62, 0.12, 0.6), Vector3(0, 0.5, -8.9), Kit.mat("preto", 0.4), 0.05)
	Kit.part(self, Vector3(0.62, 0.85, 0.12), Vector3(0, 0.98, -9.2), Kit.mat("preto", 0.4), 0.05)
	# quadro "funcionário do mês" (sempre ele)
	Kit.part(self, Vector3(1.0, 0.7, 0.04), Vector3(-2.6, 1.7, -9.95), Kit.mat("amarelo", 0.4), 0.02)
	Kit.label(self, "FUNCIONÁRIO\nDO MÊS\n(eu)", Vector3(-2.6, 1.7, -9.92), 0.09, Color("#5a2a33"))
	# planta e troféus
	_plant(Vector3(3.6, 0, -9.3), 1.3)
	Kit.part(self, Vector3(1.6, 0.9, 0.4), Vector3(2.6, 0.45, -9.7), Kit.mat("madeira_esc"), 0.03)
	for i in 3:
		Kit.cylinder(self, 0.06, 0.25, Vector3(2.1 + i * 0.45, 1.03, -9.7), Kit.mat("amarelo", 0.25))

func set_lamp(on: bool, blink := 0.0) -> void:
	var e := 0.0
	if on:
		e = 4.0 if blink <= 0.0 else (4.0 if fmod(blink, 0.5) < 0.3 else 0.6)
	lamp_mat.emission_energy_multiplier = e
	lamp_light.light_energy = e * 0.5

func set_door(amount: float) -> void:
	door_open = amount
	door_pivot.rotation.y = deg_to_rad(95.0) * amount

# ------------------------------------------------------------------ mesas dos jogadores
func _desks() -> void:
	var colors := ["teal", "rosa", "amarelo", "roxo"]
	for i in DESK_ANGLES.size():
		var a := deg_to_rad(DESK_ANGLES[i])
		var chair := DOOR + Vector3(sin(a), 0, cos(a)) * ARC_R
		var to_door := (DOOR - chair)
		to_door.y = 0
		to_door = to_door.normalized()
		var side := signf(chair.x)
		# vira o monitor para a porta ficar ~40° de lado: dá para ver o chefe sem tirar o olho da tela
		var facing := to_door.rotated(Vector3.UP, deg_to_rad(38.0) * side)
		var yaw := atan2(-facing.x, -facing.z)
		var root := Node3D.new()
		root.position = chair
		root.rotation.y = yaw
		add_child(root)
		var desk_mat := Kit.mat("mesa", 0.55)
		# tampo + pés + gaveteiro (sistema local: -z é para a frente)
		Kit.solid(root, Vector3(1.5, 0.06, 0.78), Vector3(0, 0.74, -0.72), desk_mat, 0.025)
		for sx in [-0.68, 0.68]:
			Kit.part(root, Vector3(0.05, 0.72, 0.7), Vector3(sx, 0.36, -0.72), Kit.mat("metal_esc", 0.4), 0.01)
		Kit.solid(root, Vector3(0.42, 0.6, 0.6), Vector3(0.5, 0.3, -0.75), Kit.mat(colors[i], 0.6), 0.03)
		Kit.part(root, Vector3(0.12, 0.03, 0.02), Vector3(0.5, 0.45, -0.44), Kit.mat("metal"), 0.01)
		# divisória colorida na frente
		Kit.solid(root, Vector3(1.5, 0.42, 0.05), Vector3(0, 0.98, -1.13), Kit.mat(colors[i], 0.8), 0.02)
		# monitor CRT gordinho (a tela recebe o PC ao vivo)
		var mon := Node3D.new()
		mon.position = Vector3(0, 0.77, -0.86)
		root.add_child(mon)
		Kit.part(mon, Vector3(0.66, 0.5, 0.42), Vector3(0, 0.33, 0.0), Kit.mat("branco", 0.45), 0.06)
		Kit.part(mon, Vector3(0.18, 0.06, 0.2), Vector3(0, 0.03, 0.02), Kit.mat("branco", 0.45), 0.02)
		var screen_quad := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(0.56, 0.38)
		screen_quad.mesh = qm
		screen_quad.position = Vector3(0, 0.34, 0.212)
		mon.add_child(screen_quad)
		# teclado e caneca
		Kit.part(root, Vector3(0.46, 0.025, 0.15), Vector3(-0.02, 0.785, -0.48), Kit.mat("branco", 0.5), 0.01)
		Kit.cylinder(root, 0.045, 0.1, Vector3(-0.55, 0.82, -0.55), Kit.mat(colors[(i + 1) % 4], 0.4))
		# cadeira de rodinha
		var chair_node := Node3D.new()
		root.add_child(chair_node)
		Kit.cylinder(chair_node, 0.28, 0.04, Vector3(0, 0.08, 0), Kit.mat("metal_esc"), 5)
		Kit.cylinder(chair_node, 0.03, 0.36, Vector3(0, 0.27, 0), Kit.mat("metal"))
		Kit.part(chair_node, Vector3(0.5, 0.09, 0.48), Vector3(0, 0.47, 0), Kit.mat(colors[i], 0.8), 0.04)
		Kit.part(chair_node, Vector3(0.48, 0.5, 0.08), Vector3(0, 0.78, 0.25), Kit.mat(colors[i], 0.8), 0.04)
		var seat_eye := chair + Vector3(0, B.SIT_EYE_H, 0) + facing * 0.05
		var it := Interactable.make(root, Vector3(0, 0.85, -0.45), Vector3(1.4, 0.9, 1.2), "sentar no seu PC", "desk:%d" % i)
		interactables.append(it)
		desks.append({"chair": chair, "facing": facing, "yaw": yaw, "seat_eye": seat_eye, "root": root,
			"monitor": mon, "screen_quad": screen_quad, "behind": chair - facing * 1.25, "chair_node": chair_node, "it": it})

# ------------------------------------------------------------------ copa, impressora, arquivo, WC
func _kitchen() -> void:
	var cm := Kit.mat("teal", 0.6)
	Kit.solid(self, Vector3(0.7, 0.92, 6.6), Vector3(-12.6, 0.46, 0.3), cm, 0.03)
	Kit.part(self, Vector3(0.74, 0.05, 6.64), Vector3(-12.6, 0.945, 0.3), Kit.mat("branco", 0.3), 0.02)
	# máquina de café
	Kit.part(self, Vector3(0.45, 0.55, 0.4), Vector3(-12.65, 1.25, -2.2), Kit.mat("preto", 0.35), 0.05)
	Kit.part(self, Vector3(0.1, 0.06, 0.1), Vector3(-12.4, 1.05, -2.2), Kit.mat("vermelho", 0.3, 1.5), 0.01)
	# geladeira
	Kit.solid(self, Vector3(0.8, 1.9, 0.8), Vector3(-12.55, 0.95, 4.2), Kit.mat("branco", 0.35), 0.06)
	Kit.part(self, Vector3(0.04, 0.5, 0.04), Vector3(-12.12, 1.25, 3.95), Kit.mat("metal"), 0.01)
	# rádio (distração)
	var radio := Node3D.new()
	radio.position = Vector3(-12.6, 1.07, 1.4)
	add_child(radio)
	Kit.part(radio, Vector3(0.28, 0.2, 0.46), Vector3.ZERO, Kit.mat("laranja", 0.5), 0.05)
	var knob := Kit.cylinder(radio, 0.06, 0.02, Vector3(0.14, 0, 0.1), Kit.mat("preto"), 14)
	knob.rotation.z = PI / 2
	Kit.label(radio, "♪", Vector3(0.145, 0.02, -0.1), 0.12, Color.BLACK, PI / 2)
	points["radio"] = radio.position
	var it := Interactable.make(self, radio.position, Vector3(0.6, 0.5, 0.7), "ligar o rádio (distrai o chefe)", "radio")
	interactables.append(it)
	# lanches no balcão (diversão rápida)
	for k in 3:
		Kit.part(self, Vector3(0.16, 0.22, 0.08), Vector3(-12.55, 1.08, -0.8 + k * 0.22), Kit.mat(["vermelho", "amarelo", "verde"][k], 0.6), 0.03)
	var snack := Interactable.make(self, Vector3(-12.5, 1.1, -0.58), Vector3(0.6, 0.5, 0.9), "comer um lanche", "snack")
	interactables.append(snack)
	# mesinha e banquinho (o banquinho também serve ao assalto do relógio)
	Kit.cylinder(self, 0.45, 0.04, Vector3(-10.4, 0.74, 0.8), Kit.mat("branco", 0.4))
	Kit.cylinder(self, 0.05, 0.72, Vector3(-10.4, 0.37, 0.8), Kit.mat("metal"))
	Kit.label(self, "COPA", Vector3(-12.98, 2.85, 0.3), 0.3, Color("#2fb8a6"), PI / 2)

func _printer_and_storage() -> void:
	# impressora (distração)
	var pr := Node3D.new()
	pr.position = Vector3(12.3, 0, -2.0)
	add_child(pr)
	Kit.solid(pr, Vector3(0.9, 0.75, 0.8), Vector3(0, 0.375, 0), Kit.mat("metal", 0.5), 0.05)
	Kit.part(pr, Vector3(0.8, 0.35, 0.7), Vector3(0, 0.93, 0), Kit.mat("branco", 0.45), 0.06)
	Kit.part(pr, Vector3(0.5, 0.02, 0.4), Vector3(-0.2, 1.12, 0), Kit.mat("branco", 0.9), 0.0)
	Kit.part(pr, Vector3(0.08, 0.05, 0.08), Vector3(-0.38, 1.0, 0.25), Kit.mat("verde", 0.3, 1.5), 0.01)
	points["printer"] = pr.position
	var it := Interactable.make(self, pr.position + Vector3(0, 0.9, 0), Vector3(1.0, 0.8, 1.0), "travar a impressora (distrai o chefe)", "printer")
	interactables.append(it)
	Kit.label(self, "IMPRESSÃO", Vector3(12.98, 2.85, -2.0), 0.24, Color("#3d8bff"), -PI / 2)
	# arquivo (nordeste): estantes e caixas
	for i in 3:
		Kit.solid(self, Vector3(0.45, 2.1, 1.6), Vector3(12.7, 1.05, -9.0 + i * 1.7), Kit.mat("madeira", 0.7), 0.03)
		for j in 4:
			Kit.part(self, Vector3(0.38, 0.32, 0.35), Vector3(12.65, 0.3 + j * 0.5, -9.4 + i * 1.7 + (j % 2) * 0.4), Kit.mat(["amarelo", "branco", "laranja", "azul"][(i + j) % 4], 0.85), 0.02)
	for k in 4:
		Kit.solid(self, Vector3(0.6, 0.45, 0.45), Vector3(9.6 + (k % 2) * 0.7, 0.225 + (k / 2) * 0.45, -9.5), Kit.mat("laranja", 0.85), 0.02)
	# cabideiro
	Kit.cylinder(self, 0.04, 1.8, Vector3(7.8, 0.9, -9.4), Kit.mat("madeira_esc"))
	Kit.part(self, Vector3(0.45, 0.7, 0.2), Vector3(7.8, 1.25, -9.35), Kit.mat("roxo", 0.9), 0.08)
	Kit.label(self, "ARQUIVO", Vector3(10.5, 2.85, -9.98), 0.26, Color("#c58a55"))

func _bathroom() -> void:
	var wm := Kit.mat("parede2", 0.9)
	# parede norte do WC com a porta em x -11.5..-10.5
	Kit.solid(self, Vector3(1.4, H, 0.16), Vector3(-12.3, H / 2, 6.6), wm, 0.0)
	Kit.solid(self, Vector3(1.5, H, 0.16), Vector3(-9.75, H / 2, 6.6), wm, 0.0)
	Kit.solid(self, Vector3(1.0, H - 2.25, 0.16), Vector3(-11.0, 2.25 + (H - 2.25) / 2, 6.6), wm, 0.0)
	Kit.solid(self, Vector3(0.16, H, 3.4), Vector3(-9.0, H / 2, 8.3), wm, 0.0)
	Kit.part(self, Vector3(3.9, 0.02, 3.3), Vector3(-11.0, 0.012, 8.35), Kit.color_mat(Color("#cfe3e8"), 0.3), 0.0)
	# vaso e pia
	Kit.part(self, Vector3(0.45, 0.42, 0.6), Vector3(-12.6, 0.21, 9.4), Kit.mat("branco", 0.2), 0.12)
	Kit.part(self, Vector3(0.45, 0.5, 0.18), Vector3(-12.6, 0.6, 9.75), Kit.mat("branco", 0.2), 0.06)
	Kit.part(self, Vector3(0.5, 0.15, 0.4), Vector3(-9.4, 0.85, 9.6), Kit.mat("branco", 0.2), 0.06)
	Kit.part(self, Vector3(0.6, 0.8, 0.02), Vector3(-9.4, 1.6, 9.96), Kit.color_mat(Color("#bfe8ff"), 0.05), 0.01)
	Kit.part(self, Vector3(0.5, 0.3, 0.05), Vector3(-11.0, 2.45, 6.52), Kit.mat("azul", 0.5), 0.03)
	Kit.label(self, "WC", Vector3(-11.0, 2.45, 6.49), 0.18, Color.WHITE, PI)
	points["bath_in"] = Vector3(-11.4, 0, 8.6)

func _elevator() -> void:
	# cabine atrás da parede sul
	var em := Kit.mat("metal", 0.35)
	Kit.solid(self, Vector3(2.4, 0.1, 2.4), Vector3(0, -0.05, 11.3), em, 0.0)
	Kit.solid(self, Vector3(0.1, 2.6, 2.4), Vector3(-1.2, 1.3, 11.3), em, 0.0)
	Kit.solid(self, Vector3(0.1, 2.6, 2.4), Vector3(1.2, 1.3, 11.3), em, 0.0)
	Kit.solid(self, Vector3(2.4, 2.6, 0.1), Vector3(0, 1.3, 12.5), em, 0.0)
	Kit.part(self, Vector3(2.3, 0.05, 2.3), Vector3(0, 2.62, 11.3), Kit.color_mat(Color(1, 0.97, 0.9), 0.3, 1.6), 0.0)
	var o := OmniLight3D.new()
	o.position = Vector3(0, 2.3, 11.3)
	o.omni_range = 3.0
	o.light_energy = 0.6
	add_child(o)
	for side in [-1.0, 1.0]:
		var d := Node3D.new()
		d.position = Vector3(side * 0.5, 0, 10.05)
		add_child(d)
		Kit.solid(d, Vector3(1.0, 2.4, 0.06), Vector3(0, 1.2, 0), Kit.mat("metal", 0.55), 0.01)
		Kit.part(d, Vector3(0.04, 2.3, 0.08), Vector3(-side * 0.48, 1.2, 0), Kit.mat("metal_esc", 0.4), 0.01)
		elevator_doors.append(d)
	Kit.part(self, Vector3(0.6, 0.25, 0.04), Vector3(0, 2.75, 9.98), Kit.mat("preto", 0.3), 0.02)
	Kit.label(self, "▲ 7º", Vector3(0, 2.75, 9.955), 0.12, Color("#ffb347"), PI)
	# visor de andar por dentro da cabine (o elevador "sobe" de verdade)
	Kit.part(self, Vector3(0.5, 0.2, 0.03), Vector3(0, 2.45, 10.14), Kit.mat("preto", 0.3), 0.02)
	elevator_display = Kit.label(self, "▲ 1º", Vector3(0, 2.45, 10.16), 0.1, Color("#ffb347"), PI)
	points["elevator_in"] = Vector3(0, 0, 11.2)
	points["elevator_out"] = Vector3(0, 0, 8.6)

func set_elevator(amount: float) -> void:
	elevator_open = amount
	for i in elevator_doors.size():
		var side := -1.0 if i == 0 else 1.0
		elevator_doors[i].position.x = side * (0.5 + 0.98 * amount)

# ------------------------------------------------------------------ enfeites e mundo lá fora
func _decor() -> void:
	_plant(Vector3(-8.2, 0, -9.3), 1.0)
	_plant(Vector3(8.3, 0, 9.3), 1.2)
	_plant(Vector3(-5.4, 0, 9.3), 0.9)
	_plant(Vector3(12.4, 0, 9.4), 1.0)
	# bebedouro
	Kit.part(self, Vector3(0.4, 1.0, 0.4), Vector3(6.6, 0.5, 9.6), Kit.mat("branco", 0.4), 0.06)
	Kit.cylinder(self, 0.17, 0.45, Vector3(6.6, 1.25, 9.6), Kit.color_mat(Color(0.55, 0.8, 1.0, 1.0), 0.1))
	# quadro da agenda do chefe (texto atualizado pelo mundo)
	var board := Node3D.new()
	board.position = Vector3(3.9, 1.6, -4.38)
	add_child(board)
	Kit.part(board, Vector3(1.14, 1.2, 0.05), Vector3.ZERO, Kit.mat("madeira_esc"), 0.03)
	Kit.part(board, Vector3(1.04, 1.1, 0.02), Vector3(0, 0, 0.03), Kit.mat("branco", 0.6), 0.01)
	Kit.label(board, "AGENDA DO CHEFE", Vector3(0, 0.47, 0.045), 0.07, Color("#e8394d"))
	for i in 11:
		var l := Kit.label(board, "", Vector3(-0.47, 0.36 - i * 0.078, 0.045), 0.05, Color("#22212b"))
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		board_lines.append(l)
	points["board"] = Vector3(3.9, 0, -3.4)
	# relógio de parede (leste)
	var clock := Node3D.new()
	clock.position = Vector3(12.97, 2.45, -4.6)
	clock.rotation.y = -PI / 2
	add_child(clock)
	var face := Kit.cylinder(clock, 0.32, 0.06, Vector3.ZERO, Kit.mat("branco", 0.4))
	face.rotation.x = PI / 2
	clock_hands = Node3D.new()
	clock.add_child(clock_hands)
	for k in 2:
		var hand := Kit.part(clock_hands, Vector3(0.025, 0.22 - k * 0.07, 0.01), Vector3(0, (0.22 - k * 0.07) / 2, 0.04), Kit.mat("preto"), 0.005)
		hand.name = "hand%d" % k
	points["clock"] = Vector3(12.2, 0, -4.6)
	# pôsteres motivacionais
	_poster(Vector3(-6.0, 1.8, -9.98), 0.0, "SINERGIA", "laranja")
	_poster(Vector3(6.0, 1.8, -9.98), 0.0, "FOCO", "azul")
	_poster(Vector3(-4.0, 1.8, 9.98), PI, "META É META", "vermelho")
	_poster(Vector3(4.0, 1.8, 9.98), PI, "SORRIA :)", "verde")

func _poster(pos: Vector3, rot: float, text: String, color: String) -> void:
	var p := Kit.part(self, Vector3(1.1, 0.75, 0.03), pos, Kit.mat(color, 0.8), 0.02, rot)
	Kit.label(self, text, pos + Vector3(0, 0, 0.025 if rot == 0.0 else -0.025), 0.13, Color.WHITE, rot)
	return

func _plant(pos: Vector3, h: float) -> void:
	Kit.cylinder(self, 0.22, 0.4, pos + Vector3(0, 0.2, 0), Kit.mat("laranja", 0.8))
	var leaf := Kit.mat("planta", 0.8)
	for i in 5:
		var a := float(i) / 5.0 * TAU
		var s := Kit.sphere(self, 0.2 + 0.05 * (i % 2), pos + Vector3(cos(a) * 0.14, 0.45 + h * (0.35 + 0.12 * (i % 3)), sin(a) * 0.14), leaf)
		s.scale = Vector3(1, 1.5, 1)

func _outside() -> void:
	# prédios vizinhos vistos pela janela (o sol da tarde vem do oeste)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for side in [-1.0, 1.0]:
		for i in 9:
			var h := rng.randf_range(8.0, 26.0)
			var w := rng.randf_range(5.0, 9.0)
			var c := Color.from_hsv(rng.randf_range(0.05, 0.12), rng.randf_range(0.15, 0.35), rng.randf_range(0.55, 0.8))
			Kit.part(self, Vector3(w, h, w), Vector3(side * rng.randf_range(24.0, 40.0), h / 2 - 12.0, -24.0 + i * 6.5), Kit.color_mat(c, 0.9), 0.1)

# ------------------------------------------------------------------ pontos e grafo do chefe
func _points() -> void:
	points["boss_desk"] = Vector3(0, 0, -8.4)
	points["door_in"] = Vector3(0, 0, -5.4)
	points["door_out"] = Vector3(0, 0, -3.5)
	points["kitchen"] = Vector3(-11.2, 0, -1.3)
	points["printer_front"] = Vector3(11.1, 0, -2.0)
	points["bath_door"] = Vector3(-11.0, 0, 5.6)
	points["storage"] = Vector3(10.2, 0, -6.6)

## grafo do chefe: nós fixos + o ponto atrás de cada mesa; arestas por linha de visão
func build_nav() -> void:
	var nodes := {
		"boss_desk": points.boss_desk, "door_in": points.door_in, "door_out": points.door_out,
		"mid": Vector3(0, 0, -1.4), "w_mid": Vector3(-3.6, 0, -2.6), "e_mid": Vector3(3.6, 0, -2.6),
		"w_far": Vector3(-8.0, 0, -2.4), "e_far": Vector3(8.0, 0, -2.4), "south": Vector3(0, 0, 5.4),
		"sw": Vector3(-5.6, 0, 5.0), "se": Vector3(5.6, 0, 5.0), "kitchen": points.kitchen,
		"printer_front": points.printer_front, "elevator_out": points.elevator_out, "elevator_in": points.elevator_in,
		"bath_door": points.bath_door, "storage": points.storage, "west_s": Vector3(-9.0, 0, 4.0),
		"east_s": Vector3(9.0, 0, 4.0), "board": points.board, "clock": points.clock, "nw": Vector3(-7.5, 0, -7.0),
	}
	for i in desks.size():
		nodes["desk%d" % i] = desks[i].behind
	var id := 0
	for n in nodes:
		nav.add_point(id, nodes[n])
		_nav_names[n] = id
		id += 1
	var space := get_world_3d().direct_space_state
	var names := nodes.keys()
	for i in names.size():
		for j in range(i + 1, names.size()):
			var a: Vector3 = nodes[names[i]]
			var b: Vector3 = nodes[names[j]]
			if a.distance_to(b) > 10.5:
				continue
			if _clear(space, a, b):
				nav.connect_points(_nav_names[names[i]], _nav_names[names[j]])

func _clear(space: PhysicsDirectSpaceState3D, a: Vector3, b: Vector3) -> bool:
	var side := (b - a).cross(Vector3.UP).normalized() * 0.32
	for off in [Vector3.ZERO, side, -side]:
		for y in [0.3, 1.0]:
			var q := PhysicsRayQueryParameters3D.create(a + off + Vector3(0, y, 0), b + off + Vector3(0, y, 0), 1)
			if not space.intersect_ray(q).is_empty():
				return false
	return true

func path(from: Vector3, to_name_or_pos) -> PackedVector3Array:
	var target: Vector3 = to_name_or_pos if to_name_or_pos is Vector3 else nav.get_point_position(_nav_names[to_name_or_pos])
	var a := nav.get_closest_point(from)
	var b := nav.get_closest_point(target)
	var p := nav.get_point_path(a, b)
	p.append(target)
	return p

func in_boss_room(p: Vector3) -> bool:
	return BOSS_ROOM.has_point(Vector3(p.x, 1.0, p.z)) and p.z < -4.6

func in_bath(p: Vector3) -> bool:
	return BATH_ROOM.has_point(Vector3(p.x, 1.0, p.z))

## escreve a agenda no quadro (✓ feito · ▸ agora · horário)
func update_board(agenda: Array) -> void:
	for i in board_lines.size():
		var l := board_lines[i]
		if i >= agenda.size():
			l.text = ""
			continue
		var e: Dictionary = agenda[i]
		var mark := "   "
		if e.state == "feito":
			mark = "✓ "
			l.modulate = Color(0.45, 0.45, 0.5)
		elif e.state == "agora":
			mark = "▸ "
			l.modulate = Color("#e8394d")
		else:
			l.modulate = Color("#22212b")
		l.text = mark + Agenda.label(e)
