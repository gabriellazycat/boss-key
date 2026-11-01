class_name Kit
## Caixa de ferramentas do cenário: blocos arredondados (cara de brinquedo), materiais da paleta
## e atalhos para criar peças com colisão.

const PAL := {
	"piso": Color("#c9b79c"), "carpete": Color("#5d7a8c"), "parede": Color("#f1e6d2"), "parede2": Color("#e7d4b6"),
	"rodape": Color("#8a6a4f"), "madeira": Color("#c58a55"), "madeira_esc": Color("#7a4f33"), "mesa": Color("#e9c98f"),
	"metal": Color("#9aa3ad"), "metal_esc": Color("#4b525c"), "preto": Color("#22212b"), "branco": Color("#fbf8f2"),
	"teal": Color("#2fb8a6"), "vermelho": Color("#e8394d"), "amarelo": Color("#ffc94a"), "laranja": Color("#f58a3a"),
	"rosa": Color("#f27fa5"), "roxo": Color("#7b61d9"), "verde": Color("#5cbf5a"), "azul": Color("#3d8bff"),
	"vidro": Color(0.75, 0.9, 1.0, 0.18), "chefe": Color("#5a2a33"), "chefe_piso": Color("#7d3b3b"), "planta": Color("#3f9b52"),
}

static var _meshes := {}
static var _mats := {}

## material da paleta (cacheado). rough: aspereza; emit: brilho próprio
static func mat(key: String, rough := 0.75, emit := 0.0) -> StandardMaterial3D:
	var id := "%s|%.2f|%.2f" % [key, rough, emit]
	if _mats.has(id):
		return _mats[id]
	var m := StandardMaterial3D.new()
	var c: Color = PAL.get(key, Color.MAGENTA)
	m.albedo_color = c
	m.roughness = rough
	m.metallic_specular = 0.35
	if c.a < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.roughness = 0.05
		m.metallic_specular = 0.9
	if emit > 0.0:
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = emit
	_mats[id] = m
	return m

static func color_mat(c: Color, rough := 0.7, emit := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic_specular = 0.35
	if emit > 0.0:
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = emit
	return m

## caixa com quinas arredondadas de raio r (malha cacheada por tamanho)
static func rbox(size: Vector3, r := 0.04) -> ArrayMesh:
	r = minf(r, minf(size.x, minf(size.y, size.z)) * 0.5 - 0.001)
	var key := "%s|%.3f" % [size, r]
	if _meshes.has(key):
		return _meshes[key]
	var h := size * 0.5
	var inner := h - Vector3.ONE * r
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var ns := 3 if r > 0.004 else 0
	# coordenadas de uma face: faixas curvas junto às bordas, miolo reto
	var coords := func(half: float) -> PackedFloat32Array:
		var a := PackedFloat32Array()
		for i in ns + 1:
			a.append(-half + r * (1.0 - cos(float(i) / maxf(ns, 1) * PI * 0.5)) if ns > 0 else -half)
		for i in range(ns, -1, -1):
			a.append(half - r * (1.0 - cos(float(i) / maxf(ns, 1) * PI * 0.5)) if ns > 0 else half)
		return a
	var axes := [[Vector3.RIGHT, Vector3.UP, Vector3.BACK], [Vector3.LEFT, Vector3.UP, Vector3.FORWARD],
		[Vector3.UP, Vector3.BACK, Vector3.RIGHT], [Vector3.DOWN, Vector3.FORWARD, Vector3.RIGHT],
		[Vector3.BACK, Vector3.UP, Vector3.LEFT], [Vector3.FORWARD, Vector3.UP, Vector3.RIGHT]]
	for ax in axes:
		var n: Vector3 = ax[0]
		var u: Vector3 = ax[1]
		var v: Vector3 = ax[2]
		var hu: float = absf(h.dot(u))
		var hv: float = absf(h.dot(v))
		var hn: float = absf(h.dot(n))
		var cu: PackedFloat32Array = coords.call(hu)
		var cv: PackedFloat32Array = coords.call(hv)
		var grid := []
		for i in cu.size():
			var row := []
			for j in cv.size():
				var p: Vector3 = n * hn + u * cu[i] + v * cv[j]
				var q := p.clamp(-inner, inner)
				var d := p - q
				var nn: Vector3 = d.normalized() if d.length() > 0.00001 else n
				row.append([q + nn * r, nn, Vector2(float(j) / (cv.size() - 1), float(i) / (cu.size() - 1))])
			grid.append(row)
		for i in cu.size() - 1:
			for j in cv.size() - 1:
				var a = grid[i][j]
				var b = grid[i + 1][j]
				var c = grid[i + 1][j + 1]
				var d2 = grid[i][j + 1]
				for tri in [[a, b, c], [a, c, d2]]:
					# garante a ordem horária vista de fora (padrão do Godot)
					var e1: Vector3 = tri[1][0] - tri[0][0]
					var e2: Vector3 = tri[2][0] - tri[0][0]
					var order: Array = tri if e1.cross(e2).dot(n) < 0.0 else [tri[0], tri[2], tri[1]]
					for vtx in order:
						st.set_normal(vtx[1])
						st.set_uv(vtx[2])
						st.add_vertex(vtx[0])
	var mesh := st.commit()
	_meshes[key] = mesh
	return mesh

## peça visual (sem colisão)
static func part(parent: Node3D, size: Vector3, pos: Vector3, material: Material, r := 0.04, rot_y := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = rbox(size, r)
	mi.material_override = material
	mi.position = pos
	mi.rotation.y = rot_y
	parent.add_child(mi)
	return mi

## peça com colisão (parede, móvel)
static func solid(parent: Node3D, size: Vector3, pos: Vector3, material: Material, r := 0.04, rot_y := 0.0, layer := 1) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	body.rotation.y = rot_y
	body.collision_layer = layer
	body.collision_mask = 0
	parent.add_child(body)
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	if material:
		var mi := MeshInstance3D.new()
		mi.mesh = rbox(size, r)
		mi.material_override = material
		body.add_child(mi)
	return body

static func cylinder(parent: Node3D, radius: float, height: float, pos: Vector3, material: Material, sides := 20) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := CylinderMesh.new()
	m.top_radius = radius
	m.bottom_radius = radius
	m.height = height
	m.radial_segments = sides
	m.rings = 1
	mi.mesh = m
	mi.material_override = material
	mi.position = pos
	parent.add_child(mi)
	return mi

static func sphere(parent: Node3D, radius: float, pos: Vector3, material: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var m := SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	m.radial_segments = 20
	m.rings = 10
	mi.mesh = m
	mi.material_override = material
	mi.position = pos
	parent.add_child(mi)
	return mi

## texto 3D (placas, quadro, etiquetas)
static func label(parent: Node3D, text: String, pos: Vector3, size := 0.12, color := Color.BLACK, rot_y := 0.0, width := 0.0) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font = preload("res://assets/fonts/Fredoka.ttf")
	l.font_size = 96
	l.pixel_size = size / 96.0
	l.modulate = color
	l.outline_size = 0
	l.position = pos
	l.rotation.y = rot_y
	l.double_sided = false
	l.shaded = false
	if width > 0.0:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.width = width / l.pixel_size
	parent.add_child(l)
	return l
