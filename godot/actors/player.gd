class_name Player
extends CharacterBody3D
## O jogador local: primeira pessoa, andar, agachar, sentar no PC, ALT-TAB, interagir, carregar item.

signal prompt_changed(text: String, blocked: bool)

var world: Node
var desk_idx := 0
var desk: Dictionary
var pc: PcScreen
var cam: Camera3D
var look_yaw := 0.0
var look_pitch := 0.0
var sitting := false
var crouching := false
var hidden := false
var held := ""                 # item do assalto na mão
var held_node: Node3D
var activity := ""             # "" · "fun" (lanche, cesta…) · "panel"
var activity_t := 0.0
var in_panel := false
var fired := false
var _sit_t := 0.0              # 0..1 transição de sentar
var _stand_pos := Vector3.ZERO
var _bob := 0.0
var _trauma := 0.0
var _step_acc := 0.0
var _noise_acc := 0.0
var _focus_target: Interactable
var _base_fov := 75.0
var _punch := 0.0
var auto: Node                 # robô de teste (--autoplay), se houver

func setup(w: Node, desk_index: int) -> void:
	world = w
	desk_idx = desk_index
	desk = w.office.desks[desk_index]
	collision_layer = 2
	collision_mask = 1
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.6
	cs.shape = cap
	cs.position.y = 0.8
	add_child(cs)
	cam = Camera3D.new()
	cam.position = Vector3(0, B.EYE_H, 0)
	cam.fov = _base_fov
	cam.near = 0.05
	cam.cull_mask = 0xFFFFF & ~2   # não vê o próprio corpo (camada visual 2)
	add_child(cam)
	cam.current = true
	position = desk.chair + desk.facing * -1.2
	look_yaw = desk.yaw

func _unhandled_input(event: InputEvent) -> void:
	if fired and not sitting:
		pass
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var s := B.MOUSE_SENS * Settings.mouse_sens
		look_yaw -= event.relative.x * s
		look_pitch = clampf(look_pitch - event.relative.y * s, -1.35, 1.35)
		if sitting:
			var rel := wrapf(look_yaw - desk.yaw, -PI, PI)
			look_yaw = desk.yaw + clampf(rel, -1.9, 1.9)
	if in_panel or world.paused_ui():
		return
	if sitting:
		if event.is_action_pressed("clutch"):
			pc.clutch()
			_punch = 1.0
			get_viewport().set_input_as_handled()
			return
		if event.is_action_pressed("interact") and not (event is InputEventMouseButton):
			stand_up()
			return
		if pc.focused:
			pc.handle_input(event)
		return
	if event.is_action_pressed("interact"):
		_try_interact()
	elif event.is_action_pressed("drop") and held != "":
		world.drop_item(self)

func _physics_process(delta: float) -> void:
	_trauma = maxf(_trauma - delta * 1.6, 0.0)
	_punch = maxf(_punch - delta * 5.0, 0.0)
	if sitting:
		_process_sitting(delta)
		return
	var input := Vector2.ZERO
	if not in_panel and not world.paused_ui():
		input = Input.get_vector("move_l", "move_r", "move_f", "move_b")
		if auto:
			input = auto.move_input()
	crouching = Input.is_action_pressed("crouch") and not in_panel
	var speed := B.WALK * (1.0 + B.UPGRADE_SPEED * Game.up_level("tenis"))
	if crouching:
		speed = B.CROUCH
	elif Input.is_action_pressed("run"):
		speed = B.RUN * (1.0 + B.UPGRADE_SPEED * Game.up_level("tenis"))
	if held != "":
		speed *= 0.82
	var dir := (Basis(Vector3.UP, look_yaw) * Vector3(input.x, 0, input.y))
	var target := dir * speed
	velocity.x = lerpf(velocity.x, target.x, 1.0 - exp(-14.0 * delta))
	velocity.z = lerpf(velocity.z, target.z, 1.0 - exp(-14.0 * delta))
	if is_on_floor():
		if Input.is_action_just_pressed("jump") and not in_panel and held == "" and not crouching:
			velocity.y = 4.6
	else:
		velocity.y -= 14.0 * delta
	move_and_slide()
	var flat := Vector2(velocity.x, velocity.z).length()
	# câmera: altura (agachar), balanço do passo, tremida
	var eye := B.EYE_H - (0.55 if crouching else 0.0)
	_bob += delta * flat * 2.2
	var bob_y := sin(_bob * 2.0) * 0.035 * clampf(flat / B.WALK, 0.0, 1.3)
	cam.position.y = lerpf(cam.position.y, eye + bob_y, 1.0 - exp(-12.0 * delta))
	cam.position.x = 0.0
	cam.position.z = 0.0
	cam.rotation = Vector3(look_pitch, 0, 0)
	rotation.y = look_yaw
	_apply_shake()
	cam.fov = lerpf(cam.fov, _base_fov + (6.0 if Input.is_action_pressed("run") and flat > 4.0 else 0.0), 0.1)
	# passos: som e barulho para o chefe
	if is_on_floor() and flat > 0.6:
		_step_acc += delta * flat
		if _step_acc > 1.6:
			_step_acc = 0.0
			var quiet := 1.0 - B.UPGRADE_QUIET * Game.up_level("pantufa")
			Sfx.play("step_soft", -20.0 + (6.0 if flat > 4.5 else 0.0) - (8.0 if crouching else 0.0), randf_range(0.9, 1.1))
			if flat > 4.5 and not crouching:
				_noise(B.NOISE_RADIUS.passo * 2.0 * quiet)
	_update_focus()
	hidden = world.office.in_bath(global_position)

func _process_sitting(delta: float) -> void:
	_sit_t = minf(_sit_t + delta * 3.0, 1.0)
	var eye: Vector3 = desk.seat_eye
	cam.global_position = cam.global_position.lerp(eye, 1.0 - exp(-14.0 * delta)) if _sit_t < 1.0 else eye
	var rel := wrapf(look_yaw - desk.yaw, -PI, PI)
	# olhando para a tela (até ~22° do centro) = foco no PC; virou a cabeça = vê o salão
	var focus := absf(rel) < 0.38 and absf(look_pitch + 0.18) < 0.42
	pc.set_focus(focus and not world.paused_ui())
	cam.global_rotation = Vector3(look_pitch, look_yaw, 0)
	var zoom := 60.0 if focus else 72.0
	cam.fov = lerpf(cam.fov, zoom - _punch * 4.0, 1.0 - exp(-8.0 * delta))
	_apply_shake()
	if auto:
		auto.sit_tick(delta)

func _apply_shake() -> void:
	if _trauma > 0.0:
		var s := _trauma * _trauma
		cam.h_offset = randf_range(-1, 1) * 0.06 * s
		cam.v_offset = randf_range(-1, 1) * 0.06 * s
	else:
		cam.h_offset = 0.0
		cam.v_offset = 0.0

func shake(amount: float) -> void:
	_trauma = clampf(_trauma + amount, 0.0, 1.0)

func _update_focus() -> void:
	var space := get_world_3d().direct_space_state
	var from := cam.global_position
	var to := from - cam.global_basis.z * B.INTERACT_DIST
	var q := PhysicsRayQueryParameters3D.create(from, to, 1 | 4)
	q.collide_with_areas = true
	q.exclude = [get_rid()]
	var hit := space.intersect_ray(q)
	var it: Interactable = null
	if not hit.is_empty() and hit.collider is Interactable:
		it = hit.collider
	if it != _focus_target:
		_focus_target = it
	if it:
		var why := it.blocked_reason(self)
		prompt_changed.emit(why if why != "" else "[%s] %s" % [Settings.key_label(it.key), it.prompt], why != "")
	else:
		prompt_changed.emit("", false)

func _try_interact() -> void:
	if _focus_target and _focus_target.blocked_reason(self) == "":
		_focus_target.use(self)

func sit_down() -> void:
	if sitting or (held != "" and held != "salgadinho"):
		return
	sitting = true
	_sit_t = 0.0
	_stand_pos = global_position
	global_position = desk.chair
	velocity = Vector3.ZERO
	look_yaw = desk.yaw
	look_pitch = -0.18
	pc.power(true)
	prompt_changed.emit("", false)
	world.on_sat(self)

func stand_up() -> void:
	if not sitting:
		return
	sitting = false
	pc.set_focus(false)
	global_position = desk.chair - desk.facing * 0.75
	cam.position = Vector3(0, B.EYE_H, 0)
	cam.rotation = Vector3.ZERO
	look_pitch = 0.0
	world.on_stood(self)

func _noise(r: float) -> void:
	_noise_acc -= 1
	Game.act("noise", {"pos": global_position, "r": r})

## pacote enviado ao host (e reenviado aos outros) 15×/s
func pack() -> Dictionary:
	return {
		"p": global_position, "y": look_yaw, "pi": look_pitch, "s": desk_idx if sitting else -1,
		"a": pc.category() if sitting else "", "ap": pc.current if sitting else "",
		"sw": pc.switched_to_work_at, "act": activity, "h": held, "hid": hidden, "c": crouching,
		"bossroom": world.office.in_boss_room(global_position), "panel": in_panel,
	}

func head_pos() -> Vector3:
	return cam.global_position
