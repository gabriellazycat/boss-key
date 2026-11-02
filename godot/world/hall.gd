class_name Hall
extends Node3D
## O hall do térreo (noite): cabine do elevador igual à de cima, balcão de upgrades com um atendente
## Telinha, máquina de lanche, sofá e a porta da rua. Fica longe do andar (OFFSET) e só aparece à noite.

const OFFSET := Vector3(70, 0, 0)
const H := 3.6
var doors: Array[Node3D] = []
var counter_it: Interactable
var exit_it: Interactable
var clerk: Telinha

func build() -> void:
	position = OFFSET
	var wm := Kit.color_mat(Color("#efe2cc"), 0.85)
	# piso de pedra clara com tapete vermelho até a porta
	Kit.solid(self, Vector3(16, 0.2, 12), Vector3(0, -0.1, 5), Kit.color_mat(Color("#d8cfc0"), 0.35), 0.0)
	Kit.part(self, Vector3(2.2, 0.02, 9.0), Vector3(0, 0.012, 5.0), Kit.mat("vermelho", 0.9), 0.0)
	Kit.solid(self, Vector3(16, 0.2, 12), Vector3(0, H + 0.1, 5), Kit.mat("branco", 0.9), 0.0)
	# paredes: leste, oeste, sul (com o vão do elevador); norte é a fachada de vidro com a porta
	Kit.solid(self, Vector3(0.2, H, 12), Vector3(-8, H / 2, 5), wm, 0.0)
	Kit.solid(self, Vector3(0.2, H, 12), Vector3(8, H / 2, 5), wm, 0.0)
	Kit.solid(self, Vector3(6.9, H, 0.2), Vector3(-4.55, H / 2, 10.1), wm, 0.0)
	Kit.solid(self, Vector3(6.9, H, 0.2), Vector3(4.55, H / 2, 10.1), wm, 0.0)
	Kit.solid(self, Vector3(2.2, H - 2.5, 0.2), Vector3(0, 2.5 + (H - 2.5) / 2, 10.1), wm, 0.0)
	for side in [-1.0, 1.0]:
		Kit.solid(self, Vector3(6.9, 0.5, 0.2), Vector3(side * 4.55, 0.25, -1.0), Kit.mat("metal_esc"), 0.0)
		var g := Kit.part(self, Vector3(6.9, H - 0.5, 0.04), Vector3(side * 4.55, 0.5 + (H - 0.5) / 2, -1.0), Kit.color_mat(Color(0.6, 0.75, 1.0, 0.25), 0.05), 0.0)
		g.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		var col := StaticBody3D.new()
		col.position = Vector3(side * 4.55, H / 2, -1.0)
		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(6.9, H, 0.2)
		cs.shape = bs
		col.add_child(cs)
		add_child(col)
	Kit.solid(self, Vector3(2.2, H - 2.6, 0.2), Vector3(0, 2.6 + (H - 2.6) / 2, -1.0), Kit.mat("metal_esc"), 0.0)
	# porta da rua (vidro) e placa SAÍDA
	Kit.solid(self, Vector3(2.0, 2.55, 0.08), Vector3(0, 1.3, -1.0), Kit.color_mat(Color(0.55, 0.75, 0.9), 0.1), 0.02)
	Kit.part(self, Vector3(0.9, 0.28, 0.05), Vector3(0, 3.0, -0.88), Kit.mat("verde", 0.4, 1.2), 0.03)
	Kit.label(self, "SAÍDA", Vector3(0, 3.0, -0.85), 0.16, Color.WHITE)
	exit_it = Interactable.make(self, Vector3(0, 1.2, -0.5), Vector3(2.0, 2.0, 0.8), "ir para casa (próximo dia)", "hall:exit")
	# rua lá fora: calçada, postes, prédios com janelas acesas
	Kit.part(self, Vector3(40, 0.1, 20), Vector3(0, -0.06, -12), Kit.color_mat(Color("#3a3a46"), 0.9), 0.0)
	for i in 5:
		var x := -12.0 + i * 6.0
		Kit.cylinder(self, 0.06, 4.0, Vector3(x, 2.0, -4.0), Kit.mat("metal_esc"))
		Kit.sphere(self, 0.22, Vector3(x, 4.1, -4.0), Kit.color_mat(Color("#ffd27a"), 0.3, 3.0))
		var o := OmniLight3D.new()
		o.position = Vector3(x, 3.8, -4.0)
		o.light_color = Color("#ffcf80")
		o.omni_range = 7.0
		o.light_energy = 1.2
		add_child(o)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	for i in 8:
		var h := rng.randf_range(10, 24)
		var b := Kit.part(self, Vector3(6, h, 6), Vector3(-21 + i * 6.2, h / 2, -20), Kit.color_mat(Color.from_hsv(0.7, 0.25, 0.25), 0.9), 0.1)
		for k in 6:
			Kit.part(b, Vector3(0.7, 0.9, 0.05), Vector3(rng.randf_range(-2.2, 2.2), rng.randf_range(-h / 2 + 1, h / 2 - 1), 3.02), Kit.color_mat(Color("#ffd98a"), 0.5, 2.0), 0.02)
	# balcão de upgrades + atendente
	Kit.solid(self, Vector3(3.2, 1.05, 0.9), Vector3(-5.0, 0.525, 4.0), Kit.mat("madeira", 0.5), 0.05)
	Kit.part(self, Vector3(3.3, 0.06, 1.0), Vector3(-5.0, 1.08, 4.0), Kit.mat("teal", 0.3), 0.02)
	Kit.part(self, Vector3(3.0, 0.6, 0.06), Vector3(-5.0, 2.9, 4.7), Kit.mat("amarelo", 0.4), 0.03)
	Kit.label(self, "UPGRADES", Vector3(-5.0, 2.9, 4.66), 0.3, Color("#5a2a33"), PI)
	clerk = Telinha.new()
	add_child(clerk)
	clerk.setup(5)
	clerk.position = Vector3(-5.0, 0, 4.9)
	clerk.rotation.y = 0.0
	counter_it = Interactable.make(self, Vector3(-5.0, 1.2, 3.4), Vector3(3.0, 1.2, 1.0), "ver os upgrades", "hall:shop")
	# máquina de lanche, sofá e plantas
	Kit.solid(self, Vector3(0.9, 1.9, 0.8), Vector3(6.8, 0.95, 6.5), Kit.mat("vermelho", 0.45), 0.06)
	Kit.part(self, Vector3(0.05, 1.2, 0.6), Vector3(6.34, 1.1, 6.5), Kit.color_mat(Color(0.8, 0.95, 1.0), 0.05, 0.6), 0.02)
	Kit.part(self, Vector3(2.6, 0.45, 0.9), Vector3(5.2, 0.3, 1.0), Kit.mat("roxo", 0.85), 0.12)
	Kit.part(self, Vector3(2.6, 0.7, 0.25), Vector3(5.2, 0.7, 0.6), Kit.mat("roxo", 0.85), 0.1)
	Kit.part(self, Vector3(1.8, 0.4, 0.04), Vector3(0, 3.1, 9.98), Kit.mat("preto", 0.4), 0.03)
	Kit.label(self, "TÉRREO · BOA NOITE!", Vector3(0, 3.1, 9.95), 0.12, Color("#ffb347"), PI)
	for p in [Vector3(-7, 2.9, 2), Vector3(0, 3.0, 5), Vector3(-5, 2.6, 3)]:
		var o2 := OmniLight3D.new()
		o2.position = p
		o2.omni_range = 9.0
		o2.light_energy = 0.9
		o2.light_color = Color("#ffe6c4")
		add_child(o2)
	_cabin()

func _cabin() -> void:
	var em := Kit.mat("metal", 0.4)
	Kit.solid(self, Vector3(2.4, 0.1, 2.4), Vector3(0, -0.05, 11.3), em, 0.0)
	Kit.solid(self, Vector3(0.1, 2.6, 2.4), Vector3(-1.2, 1.3, 11.3), em, 0.0)
	Kit.solid(self, Vector3(0.1, 2.6, 2.4), Vector3(1.2, 1.3, 11.3), em, 0.0)
	Kit.solid(self, Vector3(2.4, 2.6, 0.1), Vector3(0, 1.3, 12.5), em, 0.0)
	Kit.part(self, Vector3(2.3, 0.05, 2.3), Vector3(0, 2.62, 11.3), Kit.color_mat(Color(1, 0.97, 0.9), 0.3, 1.6), 0.0)
	for side in [-1.0, 1.0]:
		var d := Node3D.new()
		d.position = Vector3(side * 0.5, 0, 10.05)
		add_child(d)
		Kit.solid(d, Vector3(1.0, 2.4, 0.06), Vector3(0, 1.2, 0), Kit.mat("metal", 0.55), 0.01)
		doors.append(d)

func set_doors(amount: float) -> void:
	for i in doors.size():
		var side := -1.0 if i == 0 else 1.0
		doors[i].position.x = side * (0.5 + 0.98 * amount)
