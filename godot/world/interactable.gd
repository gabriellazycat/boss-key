class_name Interactable
extends Area3D
## Algo que o jogador usa olhando e apertando E. O prompt aparece em cima do objeto: "[E] sentar".

signal used(player: Node)

var prompt := "usar"
var key := "interact"
## devolve "" se pode usar agora, ou o motivo (aparece no lugar do prompt)
var check: Callable = Callable()
var id := ""

static func make(parent: Node3D, pos: Vector3, size: Vector3, text: String, ident := "") -> Interactable:
	var it := Interactable.new()
	it.prompt = text
	it.id = ident
	it.position = pos
	it.collision_layer = 4      # camada "interagir"
	it.collision_mask = 0
	it.monitorable = true
	it.monitoring = false
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	it.add_child(cs)
	parent.add_child(it)
	return it

func blocked_reason(player: Node) -> String:
	if check.is_valid():
		return check.call(player)
	return ""

func use(player: Node) -> void:
	used.emit(player)
