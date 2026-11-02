class_name Heists
## O assalto do dia: dados das missões e as regras que o host aplica.
## Cada etapa tem um texto de objetivo (uma coisa por vez na tela) e onde acontece.

const DEFS := {
	"grampeador": {"nome": "O Grampeador de Ouro", "etapas": [
		"Ache a chave da gaveta do chefe (revire os lugares marcados)",
		"Entre na sala do chefe e abra a gaveta da mesa dele",
		"Esconda o grampeador na gaveta da SUA mesa",
	]},
	"relogio": {"nome": "Adiantar o Relógio", "etapas": [
		"Pegue o banquinho da copa",
		"Use o banquinho embaixo do relógio (parede leste) e adiante os ponteiros",
		"Devolva o banquinho na copa",
	]},
	"papel": {"nome": "Papel de Parede do Chefe", "etapas": [
		"Ache a senha do PC do chefe (revire os lugares marcados)",
		"Entre na sala do chefe e troque o papel de parede dele",
	]},
	"salgadinho": {"nome": "O Salgadinho Proibido", "etapas": [
		"Pegue as moedas na gaveta da sua mesa",
		"Compre o Salgadinho Ouro na máquina da copa",
		"Coma o salgadinho sentado na sua mesa, sem ninguém ver",
	]},
}
const SEARCH_SPOTS := ["cabide", "caixas", "geladeira", "lixeira"]

static func pick(day: int, rng: RandomNumberGenerator) -> String:
	if day == 1:
		return "grampeador"
	var ids := DEFS.keys()
	return ids[rng.randi_range(0, ids.size() - 1)]

static func initial_items(id: String, rng: RandomNumberGenerator) -> Dictionary:
	var it := {}
	if id == "grampeador" or id == "papel":
		it["segredo"] = SEARCH_SPOTS[rng.randi_range(0, SEARCH_SPOTS.size() - 1)]
		it["revirados"] = []
	return it

static func step_text(h: Dictionary) -> String:
	if h.is_empty() or not DEFS.has(h.get("id", "")):
		return ""
	if h.get("done", false):
		return "Assalto concluído! Agora é só enrolar até as 18h."
	var et: Array = DEFS[h.id].etapas
	return et[mini(int(h.step), et.size() - 1)]

static func steps_count(h: Dictionary) -> int:
	return DEFS[h.id].etapas.size() if DEFS.has(h.get("id", "")) else 0

## o host aplica uma ação de assalto vinda de um jogador
static func host_action(id: int, data: Dictionary) -> void:
	var h: Dictionary = Game.heist
	if h.get("done", false):
		return
	var a: String = data.get("a", "")
	var w = Game.world
	match a:
		"search":
			var spot: String = data.get("spot", "")
			var rev: Array = Game.items.get("revirados", [])
			if spot in rev:
				return
			rev.append(spot)
			Game.items["revirados"] = rev
			if spot == Game.items.get("segredo", ""):
				_advance(id, "Achou! " + ("A chave estava aqui." if h.id == "grampeador" else "A senha estava num post-it."))
			else:
				Game.fx("toast", "Nada aqui…", "")
		"step":
			# só quem fez a etapa válida recebe o item (dois jogadores na mesma gaveta: só um leva)
			if int(data.get("step", -1)) == int(h.step):
				var give: String = str(data.get("give", ""))
				if give != "":
					Game.items["mao_%d" % id] = give
					if w:
						w.heists.sync_hold.rpc(id, give)
				_advance(id, str(data.get("msg", "")))
		"hold":
			if str(data.get("item", "")) != "":
				return
			Game.items["mao_%d" % id] = ""
			if w:
				w.heists.sync_hold.rpc(id, "")
		"drop":
			# largou no meio do caminho: o item volta para o lugar e a etapa recua
			Game.items["mao_%d" % id] = ""
			if w:
				w.heists.sync_hold.rpc(id, "")
			if not h.get("done", false):
				h.step = maxi(int(h.step) - 1, 0)
		"clock":
			Game.t = minf(Game.t + 30.0, B.DAY_SECONDS - 5.0)

static func _advance(id: int, msg: String) -> void:
	var h: Dictionary = Game.heist
	h.step = int(h.step) + 1
	Game.ps[id].fun += B.FUN_HEIST_STEP
	if msg != "":
		Game.fx("toast", msg, "good")
	Game.fx("sfx", "panel_ok")
	if int(h.step) >= steps_count(h):
		h.done = true
		var share := B.FUN_HEIST / maxf(Game.ps.size(), 1.0)
		for pid in Game.ps:
			Game.ps[pid].fun += share
		Game.fx("heist_done", DEFS[h.id].nome)
		Game.fx("sfx", "heist_done")
