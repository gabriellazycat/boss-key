class_name RemotePlayer
extends Node3D
## Outro jogador, visto daqui: segue o pacote que chega do host com interpolação.

var id := 0
var look: Telinha
var tag: Label3D
var _target := Vector3.ZERO
var _yaw := 0.0
var _speed := 0.0
var _last := Vector3.ZERO
var world: Node

func setup(w: Node, peer_id: int, look_idx: int, pname: String) -> void:
	world = w
	id = peer_id
	look = Telinha.new()
	add_child(look)
	look.setup(look_idx)
	tag = Kit.label(self, pname, Vector3(0, 2.05, 0), 0.16, Color.WHITE)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	tag.outline_size = 12
	tag.outline_modulate = Color(0, 0, 0, 0.7)
	tag.no_depth_test = false

func _process(delta: float) -> void:
	var st: Dictionary = Game.pstate.get(id, {})
	if st.is_empty():
		return
	var desk_i := int(st.get("s", -1))
	look.sitting = desk_i >= 0
	if desk_i >= 0:
		var d: Dictionary = world.office.desks[desk_i]
		_target = d.chair
		_yaw = d.yaw
	else:
		_target = st.p
		_yaw = st.y
	global_position = global_position.lerp(_target, 1.0 - exp(-14.0 * delta))
	rotation.y = lerp_angle(rotation.y, _yaw, 1.0 - exp(-14.0 * delta))
	_speed = lerpf(_speed, (global_position - _last).length() / maxf(delta, 0.001), 0.2)
	_last = global_position
	var fired: bool = Game.ps.get(id, {}).get("fired", false)
	look.set_mood(6 if fired else (3 if Game.boss_state.get("lamp", false) and desk_i >= 0 and st.get("a", "") == "g" else (1 if st.get("act", "") == "fun" else 0)))
	look.look_target = Vector2(0, -st.get("pi", 0.0))
	look.animate(delta, _speed)
	visible = not st.get("hid", false)
	look.scale = Vector3(1, 0.7, 1) if st.get("c", false) and desk_i < 0 else Vector3.ONE
