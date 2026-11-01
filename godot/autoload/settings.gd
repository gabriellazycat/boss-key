extends Node
## Opções, teclas e o pouco que se salva (recorde, personagem, nome).

const PATH := "user://settings.cfg"

var quality := 2            # 0 baixo · 1 médio · 2 alto
var master_vol := 0.9
var music_vol := 0.6
var mouse_sens := 1.0
var fullscreen := false
var player_name := "Você"
var look := 0               # paleta do Telinha escolhida
var best_days := 0
var best_fun := 0
var seen_tips := {}         # dicas de 1ª vez já mostradas

## ação → teclas (e botões do mouse com prefixo "mouse:")
const KEYS := {
	"move_f": ["W", "Up"], "move_b": ["S", "Down"], "move_l": ["A", "Left"], "move_r": ["D", "Right"],
	"run": ["Shift"], "crouch": ["Ctrl", "C"], "jump": ["Space"],
	"interact": ["E", "mouse:1"], "drop": ["Q"], "throw": ["mouse:2"],
	"clutch": ["Space"], "work_hit": ["F"], "sort_a": ["A"], "sort_b": ["D"],
	"app_1": ["1"], "app_2": ["2"], "app_3": ["3"], "app_4": ["4"],
	"help": ["Tab"], "pause": ["Escape", "P"], "skip": ["Enter", "Space"],
}

func _ready() -> void:
	_load()
	_build_input_map()
	apply_video()

func _build_input_map() -> void:
	for action in KEYS:
		if InputMap.has_action(action):
			InputMap.erase_action(action)
		InputMap.add_action(action, 0.2)
		for k in KEYS[action]:
			var ev: InputEvent
			if k.begins_with("mouse:"):
				var mb := InputEventMouseButton.new()
				mb.button_index = int(k.substr(6)) as MouseButton
				ev = mb
			else:
				var kb := InputEventKey.new()
				kb.physical_keycode = OS.find_keycode_from_string(k)
				ev = kb
			InputMap.action_add_event(action, ev)

func apply_video() -> void:
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED)
	var bus := AudioServer.get_bus_index("Master")
	AudioServer.set_bus_volume_db(bus, linear_to_db(maxf(master_vol, 0.001)))
	quality_changed.emit()

signal quality_changed

func save() -> void:
	var c := ConfigFile.new()
	for k in ["quality", "master_vol", "music_vol", "mouse_sens", "fullscreen", "player_name", "look", "best_days", "best_fun", "seen_tips"]:
		c.set_value("s", k, get(k))
	c.save(PATH)

func _load() -> void:
	var c := ConfigFile.new()
	if c.load(PATH) != OK:
		return
	for k in c.get_section_keys("s"):
		set(k, c.get_value("s", k))

## true na primeira vez (e marca como vista)
func first_time(tip: String) -> bool:
	if seen_tips.has(tip):
		return false
	seen_tips[tip] = true
	save()
	return true

func key_label(action: String) -> String:
	var k: String = KEYS.get(action, ["?"])[0]
	match k:
		"mouse:1": return "CLIQUE"
		"mouse:2": return "BOTÃO DIR."
		"Space": return "ESPAÇO"
		"Escape": return "ESC"
		"Shift": return "SHIFT"
		"Tab": return "TAB"
	return k
