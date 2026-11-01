extends Node
## A parte do assalto que vive no mundo: lugares marcados, itens na mão, gavetas, banquinho, máquina.
## Os pontos "brilham" (marcador amarelo) só quando são a etapa atual — o jogador nunca fica perdido.

var world: Node
var office: Office
var spots := {}          # nome → {it: Interactable, mark: Node3D}
var held_meshes := {}    # peer id → Node3D na mão
var _day := -1

const SPOT_POS := {
	"cabide": Vector3(7.8, 1.2, -9.1), "caixas": Vector3(9.9, 0.7, -9.2), "geladeira": Vector3(-12.1, 1.1, 4.2),
	"lixeira": Vector3(11.4, 0.4, -0.9), "gaveta_chefe": Vector3(0.8, 0.6, -7.6), "pc_chefe": Vector3(0, 1.0, -8.0),
	"banquinho": Vector3(-10.4, 0.5, 1.6), "relogio": Vector3(12.4, 1.6, -4.6), "maquina": Vector3(-12.2, 1.0, 2.9),
}

func setup(w: Node) -> void:
	world = w
	office = w.office
	# máquina de lanches da copa (sempre lá; só vende o Salgadinho Ouro com moedas)
	var vm := Kit.solid(office, Vector3(0.8, 1.8, 0.7), Vector3(-12.5, 0.9, 2.9), Kit.mat("vermelho", 0.45), 0.06)
	Kit.part(vm, Vector3(0.05, 1.1, 0.55), Vector3(0.41, 0.15, 0), Kit.color_mat(Color(0.8, 0.95, 1.0), 0.05, 0.4), 0.02)
	# banquinho
	var stool := Node3D.new()
	stool.name = "banquinho"
	office.add_child(stool)
	stool.position = Vector3(-10.4, 0, 1.6)
	Kit.cylinder(stool, 0.2, 0.05, Vector3(0, 0.55, 0), Kit.mat("madeira", 0.6))
	for k in 3:
		var a := k * TAU / 3.0
		Kit.cylinder(stool, 0.025, 0.55, Vector3(cos(a) * 0.14, 0.27, sin(a) * 0.14), Kit.mat("madeira_esc"))
	for n in SPOT_POS:
		var it := Interactable.make(office, SPOT_POS[n], Vector3(0.9, 0.9, 0.9), "", "heist:" + n)
		it.used.connect(func(_p): on_interact(it))
		it.check = _check.bind(n)
		var mark := Kit.label(office, "▼", SPOT_POS[n] + Vector3(0, 0.75, 0), 0.35, Color("#ffc94a"))
		mark.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		mark.no_depth_test = true
		mark.outline_size = 10
		mark.outline_modulate = Color(0.2, 0.1, 0, 0.8)
		spots[n] = {"it": it, "mark": mark}
	# gaveta da mesa de cada um (moedas / esconder o grampeador)
	for i in office.desks.size():
		var d: Dictionary = office.desks[i]
		var it2 := Interactable.make(d.root, Vector3(0.5, 0.35, -0.42), Vector3(0.5, 0.4, 0.3), "", "drawer:%d" % i)
		it2.used.connect(func(_p): on_interact(it2))
		it2.check = _check_drawer.bind(i)

func _process(_delta: float) -> void:
	var h: Dictionary = Game.heist
	var active := _active_spots(h)
	var t := Time.get_ticks_msec() / 1000.0
	for n in spots:
		var on: bool = n in active
		spots[n].mark.visible = on and Game.phase == "day" and not world.local_player.sitting
		spots[n].mark.position.y = SPOT_POS[n].y + 0.75 + sin(t * 3.0) * 0.08
		spots[n].it.prompt = _prompt(n)
	var stool: Node3D = office.get_node_or_null("banquinho")
	if stool:
		stool.visible = not _someone_holds("banquinho")
		if h.get("id", "") == "relogio" and int(h.get("step", 0)) == 2:
			stool.position = Vector3(12.2, 0, -4.6)
		elif h.get("id", "") == "relogio" and int(h.get("step", 0)) >= 3 or h.get("done", false):
			stool.position = Vector3(-10.4, 0, 1.6)
	# item na mão: preso à câmera (local) ou ao corpo (remoto)
	for id in Game.ps:
		var item: String = Game.items.get("mao_%d" % id, "")
		_show_held(id, item)

func _active_spots(h: Dictionary) -> Array:
	if h.is_empty() or h.get("done", false):
		return []
	var s := int(h.step)
	match h.id:
		"grampeador":
			if s == 0:
				return SPOTS_LEFT()
			if s == 1:
				return ["gaveta_chefe"]
		"papel":
			if s == 0:
				return SPOTS_LEFT()
			if s == 1:
				return ["pc_chefe"]
		"relogio":
			if s == 0:
				return ["banquinho"]
			if s == 1:
				return ["relogio"]
			if s == 2:
				return ["banquinho"]
		"salgadinho":
			if s == 1:
				return ["maquina"]
	return []

func SPOTS_LEFT() -> Array:
	var rev: Array = Game.items.get("revirados", [])
	var out := []
	for n in Heists.SEARCH_SPOTS:
		if not n in rev:
			out.append(n)
	return out

func _prompt(n: String) -> String:
	match n:
		"cabide", "caixas", "geladeira", "lixeira": return "revirar"
		"gaveta_chefe": return "abrir a gaveta do chefe"
		"pc_chefe": return "trocar o papel de parede"
		"banquinho": return "pegar o banquinho" if int(Game.heist.get("step", 0)) == 0 else "devolver o banquinho"
		"relogio": return "subir e adiantar o relógio"
		"maquina": return "comprar o Salgadinho Ouro"
	return "usar"

func _check(_p: Node, n: String) -> String:
	if not n in _active_spots(Game.heist):
		if n == "maquina":
			return "máquina de lanches (precisa de moedas)"
		return " "          # invisível: não é a etapa agora
	if Game.phase != "day":
		return "espere o expediente"
	if n == "banquinho" and int(Game.heist.step) == 2 and world.local_player.held != "banquinho":
		return "traga o banquinho de volta"
	if n == "relogio" and world.local_player.held != "banquinho":
		return "precisa do banquinho para alcançar"
	return ""

func _check_drawer(_p: Node, i: int) -> String:
	if i != world.local_player.desk_idx:
		return " "
	var h: Dictionary = Game.heist
	if h.get("id", "") == "salgadinho" and int(h.step) == 0:
		return ""
	if h.get("id", "") == "grampeador" and int(h.step) == 2 and world.local_player.held == "grampeador":
		return ""
	return " "

func on_interact(it: Interactable) -> void:
	var p: Player = world.local_player
	var parts := it.id.split(":")
	var kind: String = parts[0]
	var n: String = parts[1]
	if kind == "drawer":
		var h: Dictionary = Game.heist
		if h.id == "salgadinho":
			_panel("revirar", func(): Game.act("heist", {"a": "step", "step": 0, "msg": "Moedas no bolso. Agora, a máquina da copa!"}))
		else:
			_panel("fechadura", func():
				_hold("")
				Game.act("heist", {"a": "step", "step": 2, "msg": "Grampeador escondido. Ninguém vai saber."}))
		return
	match n:
		"cabide", "caixas", "geladeira", "lixeira":
			_panel("revirar", func(): Game.act("heist", {"a": "search", "spot": n}))
		"gaveta_chefe":
			_panel("fechadura", func():
				_hold("grampeador")
				Game.act("heist", {"a": "step", "step": 1, "msg": "PEGOU o grampeador! Não deixe o chefe ver."}))
		"pc_chefe":
			_panel("digitar", func(): Game.act("heist", {"a": "step", "step": 1, "msg": "Papel de parede trocado. Obra-prima."}))
		"banquinho":
			if int(Game.heist.step) == 0:
				_hold("banquinho")
				Game.act("heist", {"a": "step", "step": 0, "msg": "Banquinho na mão. Agora o relógio!"})
			else:
				_hold("")
				Game.act("heist", {"a": "step", "step": 2, "msg": "Banquinho de volta. Perfeito."})
		"relogio":
			_panel("ponteiros", func():
				_hold("")
				Game.act("heist", {"a": "step", "step": 1, "msg": "Relógio adiantado: o dia acaba mais cedo!"})
				Game.act("heist", {"a": "clock"}))
		"maquina":
			_panel("balcao", func():
				_hold("salgadinho")
				Game.act("heist", {"a": "step", "step": 1, "msg": "Salgadinho Ouro na mão. Coma sentado na sua mesa!"}))

func _panel(kind: String, on_ok: Callable) -> void:
	var p: Player = world.local_player
	p.in_panel = true
	world.hud.open_panel(kind, func(ok: bool):
		p.in_panel = false
		if ok:
			on_ok.call())

func _hold(item: String) -> void:
	world.local_player.held = item
	Game.act("heist", {"a": "hold", "item": item})
	if item != "":
		Sfx.play("pickup")
		world.hud.tip_once("item", "Com o item na mão, o chefe te persegue se te ver! [Q] larga.")

func drop(p: Player) -> void:
	if p.held == "":
		return
	Sfx.play("drop")
	world.hud.toast("Você largou o item. Ele voltou para o lugar.", "")
	_hold("")
	Game.act("heist", {"a": "drop"})

## o chefe pegou alguém com o item: confisca e volta uma etapa
func host_confiscate(id: int) -> void:
	var item: String = Game.items.get("mao_%d" % id, "")
	if item == "":
		return
	Game.items["mao_%d" % id] = ""
	sync_hold.rpc(id, "")
	var h: Dictionary = Game.heist
	h.step = maxi(int(h.step) - 1, 0)
	Game.fx("toast", "O chefe confiscou o item. Volte uma etapa.", "bad")

@rpc("authority", "call_local", "reliable")
func sync_hold(id: int, item: String) -> void:
	Game.items["mao_%d" % id] = item
	if id == Game.me() and world:
		world.local_player.held = item
		if item == "" and Game.heist.get("id", "") == "salgadinho" and int(Game.heist.get("step", 0)) == 2:
			pass

func _someone_holds(item: String) -> bool:
	for id in Game.ps:
		if Game.items.get("mao_%d" % id, "") == item:
			return true
	return false

func _show_held(id: int, item: String) -> void:
	var cur: Node3D = held_meshes.get(id)
	if cur and cur.get_meta("item", "") == item:
		return
	if cur:
		cur.queue_free()
		held_meshes.erase(id)
	if item == "":
		return
	var n := Node3D.new()
	n.set_meta("item", item)
	match item:
		"grampeador":
			Kit.part(n, Vector3(0.08, 0.07, 0.24), Vector3.ZERO, Kit.color_mat(Color("#ffcf3a"), 0.2, 0.6), 0.02)
		"banquinho":
			Kit.cylinder(n, 0.2, 0.05, Vector3(0, 0.1, 0), Kit.mat("madeira"))
			Kit.cylinder(n, 0.025, 0.45, Vector3(0, -0.15, 0), Kit.mat("madeira_esc"))
		"salgadinho":
			Kit.part(n, Vector3(0.2, 0.26, 0.06), Vector3.ZERO, Kit.color_mat(Color("#ff9a1f"), 0.5, 0.3), 0.03)
	if id == Game.me():
		world.local_player.cam.add_child(n)
		n.position = Vector3(0.28, -0.25, -0.55)
	elif world.remotes.has(id):
		world.remotes[id].add_child(n)
		n.position = Vector3(0.3, 1.0, -0.35)
	held_meshes[id] = n
