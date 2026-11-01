class_name Boss
extends Node3D
## O chefe. No host, roda a IA (agenda, ronda, conferir tela, perseguir, ouvir, distrair).
## Nos convidados, só desenha o que chega em Game.boss_state.

var world: Node
var office: Office
var look: Telinha
var body: AnimatableBody3D
var state := "sala"            # sala · porta · andando · conferindo · encarando · fora · perseguindo · distraido · investigando · elevador
var steps: Array = []          # fila de passos do plano atual
var _step_t := 0.0
var speed := B.BOSS_WALK
var yaw := 0.0
var _vel := 0.0
var lamp := false
var door := 0.0
var _door_target := 0.0
var away := false
var elev := 0.0                # portas do elevador (0 fechada · 1 aberta)
var _elev_target := 0.0
var mood := 0
var bubble := ""               # "?" "!" "..." acima da cabeça
var task_label := ""           # o que está fazendo agora (aparece no HUD)
var current_idx := -1          # compromisso da agenda em execução
var chase_id := 0
var _chase_lost := 0.0
var _seen := {}                # id → {t, off, acc_pop}
var _check_id := -1
var _check_t := 0.0
var _checked := false
var _talk_cd := 0.0
var _remote_target := Vector3.ZERO
var _remote_yaw := 0.0

func setup(w: Node) -> void:
	world = w
	office = w.office
	look = Telinha.new()
	add_child(look)
	look.setup(0, true)
	body = AnimatableBody3D.new()
	body.collision_layer = 8
	body.collision_mask = 0
	body.sync_to_physics = false
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.42
	cap.height = 1.9
	cs.shape = cap
	cs.position.y = 0.95
	body.add_child(cs)
	add_child(body)
	global_position = office.points.boss_desk
	yaw = 0.0
	rotation.y = yaw

# ------------------------------------------------------------------ IA (só o host)
var instinct := 0.0

## barulho de jogo enche o instinto; cheio, ele abre a porta e espia o salão (fora da agenda)
func add_instinct(amount: float) -> void:
	instinct += amount

func host_tick(delta: float) -> void:
	_talk_cd = maxf(_talk_cd - delta, 0.0)
	instinct = maxf(instinct - B.INSTINCT_DECAY * delta, 0.0)
	if instinct >= B.INSTINCT_PEEK and state == "sala" and steps.is_empty() and Game.t > B.CALM_SECONDS:
		instinct = 0.0
		task_label = "Espiando (ouviu barulho de jogo)"
		_leave_room()
		steps.append({"wait": B.PEEK_TIME, "look_around": true, "mood": 4})
		_return_room()
		Game.fx("toast", "O chefe ouviu barulho de jogo e vai espiar!", "bad")
	_run_agenda()
	_run_steps(delta)
	if state != "fora" and state != "sala" and state != "elevador":
		_perceive(delta)
	elif state == "sala":
		_perceive_room_intruders()
	door = move_toward(door, _door_target, delta * 1.6)
	elev = move_toward(elev, _elev_target, delta * 0.9)
	lamp = not away and state != "sala"
	_pack()

func _pack() -> void:
	Game.boss_state = {"p": global_position, "y": yaw, "st": state, "m": mood, "lamp": lamp, "door": door,
		"away": away, "elev": elev, "b": bubble, "task": task_label, "v": _vel}

func _run_agenda() -> void:
	if Game.phase != "day" or Game.t < B.CALM_SECONDS:
		return
	for i in Game.agenda.size():
		var e: Dictionary = Game.agenda[i]
		if (e.state == "" or e.state == "atrasado") and Game.t >= e.t:
			if state != "sala" or not steps.is_empty():
				e.state = "atrasado"
				return
			_start(i)
			return

func _start(i: int) -> void:
	var e: Dictionary = Game.agenda[i]
	e.state = "agora"
	current_idx = i
	task_label = B.AGENDA_KIND[e.kind].nome
	steps.clear()
	match e.kind:
		"telefone":
			steps = [{"phone": e.dur}, {"done": i}]
			return
		"ronda":
			_leave_room()
			for d in _ronda_desks():
				steps.append({"go": office.desks[d].behind})
				steps.append({"check": d})
			steps.append({"go": office.points.board if randf() < 0.5 else Vector3(0, 0, 5.4)})
			steps.append({"wait": 1.5, "look_around": true})
		"cafe":
			_leave_room()
			steps.append({"go": office.points.kitchen})
			steps.append({"wait": e.dur, "look_around": true, "mood": 1})
			for d in _ronda_desks().slice(0, 2):
				steps.append({"go": office.desks[d].behind})
				steps.append({"check": d})
		"impressao":
			_leave_room()
			steps.append({"go": office.points.printer_front})
			steps.append({"wait": e.dur, "look_around": true})
		"almoco", "reuniao":
			_leave_room()
			steps.append({"go": office.points.elevator_out})
			steps.append({"elev": 1.0})
			steps.append({"go": office.points.elevator_in})
			steps.append({"elev": 0.0})
			steps.append({"away": e.dur})
			steps.append({"arrive": true})
			steps.append({"elev": 1.0})
			steps.append({"go": office.points.elevator_out})
			steps.append({"elev_close": true})
			for d in _ronda_desks().slice(0, 2):
				steps.append({"go": office.desks[d].behind})
				steps.append({"check": d})
	_return_room()
	steps.append({"done": i})

## mesas a conferir: as dos jogadores (todas) + uma vazia para variar o caminho
func _ronda_desks() -> Array:
	var used := []
	for id in Net.players:
		used.append(int(Net.players[id].desk))
	var rng := Game.day_rng(current_idx + 100)
	var extra := rng.randi_range(0, office.desks.size() - 1)
	if not extra in used and used.size() < 3:
		used.append(extra)
	used.shuffle()
	return used

## começo do expediente: sai da cabine com todo mundo e vai para a sala dele
func start_day_walk() -> void:
	steps.clear()
	away = false
	visible = true
	task_label = "Chegando ao escritório"
	steps.append({"go": office.points.elevator_out})
	steps.append_array(_route(office.points.door_out))
	_return_room()

func _leave_room() -> void:
	steps.append({"go": office.points.door_in})
	steps.append({"door": 1.0})
	steps.append({"go": office.points.door_out})
	steps.append({"wait": B.BOSS_DOOR_PAUSE, "look_around": true})

func _return_room() -> void:
	steps.append({"go": office.points.door_out})
	steps.append({"go": office.points.door_in})
	steps.append({"door": 0.0})
	steps.append({"go": office.points.boss_desk})
	steps.append({"sit": true})

func _run_steps(delta: float) -> void:
	_vel = 0.0
	if steps.is_empty():
		return
	var s: Dictionary = steps[0]
	if s.has("go"):
		if state != "perseguindo" and state != "investigando":
			state = "andando"
		if _walk_to(s.go, speed * (1.0 + B.BOSS_WALK_PER_DAY * (Game.day - 1)), delta):
			steps.pop_front()
	elif s.has("path"):
		if s.path.is_empty():
			steps.pop_front()
		elif _walk_to(s.path[0], speed, delta):
			s.path.remove_at(0)
	elif s.has("door"):
		_door_target = s.door
		if s.door > 0.5 and door == 0.0:
			Game.fx("sfx", "door_open", "", office.DOOR + Vector3(0, 1.5, 0))
			Game.fx("door_warn")
		if s.door < 0.5 and door == 1.0:
			Game.fx("sfx", "door_close", "", office.DOOR + Vector3(0, 1.5, 0))
		if door == _door_target:
			steps.pop_front()
	elif s.has("wait"):
		state = "parado"
		mood = s.get("mood", 0)
		_step_t += delta
		if s.get("look_around", false):
			yaw += sin(_step_t * 1.6) * delta * 1.2
		if _step_t >= s.wait:
			_step_t = 0.0
			mood = 0
			steps.pop_front()
	elif s.has("check"):
		_do_check(s.check, delta)
	elif s.has("phone"):
		state = "sala"
		task_label = "Ao telefone (na sala)"
		_step_t += delta
		if _step_t >= s.phone:
			_step_t = 0.0
			steps.pop_front()
	elif s.has("elev"):
		_elev_target = s.elev
		if elev == _elev_target:
			steps.pop_front()
	elif s.has("elev_close"):
		_elev_target = 0.0
		steps.pop_front()
	elif s.has("away"):
		if not away:
			away = true
			visible = false
			state = "fora"
			Game.fx("toast", "O chefe saiu do andar! Volta lá pelas %s." % B.clock_text(Game.t + s.away), "good")
		_step_t += delta
		if _step_t >= s.away:
			_step_t = 0.0
			steps.pop_front()
	elif s.has("arrive"):
		# o elevador avisa antes de abrir: "plim" + 3,5 s
		if _step_t == 0.0:
			away = false
			visible = true
			state = "elevador"
			Game.fx("sfx", "elevator_ding")
			Game.fx("toast", "PLIM! O elevador está chegando…", "bad")
		_step_t += delta
		if _step_t >= 3.5:
			_step_t = 0.0
			steps.pop_front()
	elif s.has("sit"):
		state = "sala"
		task_label = ""
		yaw = lerp_angle(yaw, 0.0, 0.2)
		steps.pop_front()
	elif s.has("done"):
		var i: int = s.done
		if i >= 0 and i < Game.agenda.size():
			Game.agenda[i].state = "feito"
		current_idx = -1
		steps.pop_front()
	elif s.has("chase"):
		_do_chase(delta)
	elif s.has("hold"):
		state = "distraido"
		_step_t += delta
		yaw += sin(_step_t * 2.0) * delta * 0.4
		if _step_t >= s.hold:
			_step_t = 0.0
			steps.pop_front()

## anda em linha reta até p; devolve true ao chegar
func _walk_to(p: Vector3, spd: float, delta: float) -> bool:
	var to := p - global_position
	to.y = 0.0
	var d := to.length()
	if d < 0.12:
		return true
	var step := minf(spd * delta, d)
	global_position += to / d * step
	_vel = spd
	var want := atan2(-to.x, -to.z)
	yaw = lerp_angle(yaw, want, 1.0 - exp(-10.0 * delta))
	return false

## leva o chefe a um ponto pelo grafo (desvia de paredes)
func _route(target: Vector3) -> Array:
	var out := []
	for p in office.path(global_position, target):
		out.append({"go": p})
	return out

# ------------------------------------------------------------------ conferir a tela
func _do_check(d: int, delta: float) -> void:
	state = "conferindo"
	if _check_id != d:
		_check_id = d
		_check_t = 0.0
		_checked = false
	_check_t += delta
	var chair: Vector3 = office.desks[d].chair
	var want := atan2(-(chair.x - global_position.x), -(chair.z - global_position.z))
	yaw = lerp_angle(yaw, want, 1.0 - exp(-8.0 * delta))
	var owner := _owner_of(d)
	var identify := B.BOSS_IDENTIFY / B.sharp(Game.day)
	if not _checked and _check_t >= identify:
		_checked = true
		if owner != 0:
			var st: Dictionary = Game.pstate.get(owner, {})
			var name := _pname(owner)
			if Game.ps.get(owner, {}).get("fired", false):
				pass
			elif int(st.get("s", -1)) == d and st.get("a", "") == "g":
				mood = 2
				bubble = "!"
				Game.add_sus(owner, B.SUS_SCREEN_CAUGHT * B.sharp(Game.day), "jogando no PC")
				Game.fx("popup", "+%d 👁 jogando no PC!" % int(B.SUS_SCREEN_CAUGHT * B.sharp(Game.day)), "sus", chair + Vector3(0, 1.6, 0))
				Game.fx("sfx", "boss_shout", "", global_position + Vector3(0, 2, 0))
				Game.fx("caught", name)
			elif int(st.get("s", -1)) == d and st.get("a", "") == "w":
				var sw: float = st.get("sw", -99.0)
				if Game.t - sw <= B.CLUTCH_WINDOW + identify:
					Game._apply(owner, "clutch", {})
				mood = 0
				bubble = ""
			elif int(st.get("s", -1)) != d:
				bubble = "?"
				mood = 4
				Game.add_sus(owner, 5.0, "mesa vazia na ronda")
				Game.fx("popup", "+5 👁 mesa vazia", "sus", chair + Vector3(0, 1.4, 0))
	if _check_t >= B.BOSS_CHECK_TIME:
		_check_id = -1
		bubble = ""
		mood = 0
		steps.pop_front()

func _owner_of(d: int) -> int:
	for id in Net.players:
		if int(Net.players[id].desk) == d and Game.ps.has(id):
			return id
	return 0

func _pname(id: int) -> String:
	return Net.players.get(id, {}).get("name", "?")

# ------------------------------------------------------------------ percepção
func eye() -> Vector3:
	return global_position + Vector3(0, 1.85, 0)

func forward() -> Vector3:
	return Vector3(-sin(yaw), 0, -cos(yaw))

func sees(p: Vector3, fov_deg := B.BOSS_FOV_DEG, rng := B.BOSS_RANGE) -> bool:
	var e := eye()
	var to := p - e
	var flat := Vector3(to.x, 0, to.z)
	if flat.length() > rng:
		return false
	if flat.length() > 0.9 and rad_to_deg(forward().angle_to(flat.normalized())) > fov_deg * 0.5:
		return false
	var q := PhysicsRayQueryParameters3D.create(e, p, 1)
	return world.get_world_3d().direct_space_state.intersect_ray(q).is_empty()

func _player_point(st: Dictionary) -> Vector3:
	var p: Vector3 = st.get("p", Vector3.ZERO)
	var h := 1.05 if int(st.get("s", -1)) >= 0 else (0.85 if st.get("c", false) else 1.35)
	return p + Vector3(0, h, 0)

func _perceive(delta: float) -> void:
	if Game.t < B.CALM_SECONDS:
		return
	for id in Game.ps:
		var p: Dictionary = Game.ps[id]
		var st: Dictionary = Game.pstate.get(id, {})
		if p.fired or st.is_empty() or st.get("hid", false):
			_forget(id, delta)
			continue
		var sev := ""
		var why := ""
		var pos := _player_point(st)
		if st.get("h", "") != "":
			sev = "grave"
			why = "com algo roubado na mão"
		elif st.get("bossroom", false):
			sev = "grave"
			why = "na sala do chefe"
		elif int(st.get("s", -1)) >= 0:
			if st.get("a", "") == "g":
				var desk: Dictionary = office.desks[int(st.s)]
				var to_boss: Vector3 = (global_position - desk.chair)
				to_boss.y = 0
				# o brilho laranja do jogo denuncia de até 9 m; a tela em si, de perto e por trás
				if to_boss.length() < 9.0:
					sev = "media"
					why = "jogando no PC"
		elif st.get("act", "") == "fun":
			sev = "media"
			why = "enrolando"
		elif not st.get("panel", false):
			var desk2: Dictionary = office.desks[int(Net.players.get(id, {}).get("desk", 0))]
			if pos.distance_to(desk2.chair + Vector3(0, 1.3, 0)) > 2.4:
				sev = "leve"
				why = "passeando à toa"
		elif st.get("panel", false):
			sev = "media"
			why = "mexendo onde não devia"
		if sev == "" or not sees(pos):
			_forget(id, delta)
			continue
		var rec: Dictionary = _seen.get(id, {"t": 0.0, "off": 0.0, "acc": 0.0, "pop": 0.0})
		rec.t += delta
		rec.off = 0.0
		var mult := minf(pow(2.0, rec.t / B.SUS_DOUBLE_EVERY), B.SUS_MULT_CAP)
		var amt: float = B.SUS_RATE[sev] * mult * B.sharp(Game.day) * delta
		Game.add_sus(id, amt, why)
		rec.acc += amt
		rec.pop += delta
		if rec.pop >= 0.8:
			Game.fx("popup", "+%d 👁 %s" % [ceili(rec.acc), why], "sus", pos + Vector3(0, 0.6, 0))
			rec.pop = 0.0
			rec.acc = 0.0
		_seen[id] = rec
		bubble = "!" if sev == "grave" else "?"
		mood = 2 if sev == "grave" else 4
		if sev == "grave" and state != "perseguindo":
			_begin_chase(id)

func _forget(id: int, delta: float) -> void:
	if not _seen.has(id):
		return
	var rec: Dictionary = _seen[id]
	rec.off += delta
	if rec.off >= B.SUS_FORGET:
		_seen.erase(id)

## dentro da sala com o chefe nela = flagrante na hora
func _perceive_room_intruders() -> void:
	for id in Game.ps:
		var st: Dictionary = Game.pstate.get(id, {})
		if st.get("bossroom", false) and not Game.ps[id].fired and sees(_player_point(st), 160.0, 7.0):
			_begin_chase(id)
			_perceive(get_physics_process_delta_time())
			return

# ------------------------------------------------------------------ perseguição
func _begin_chase(id: int) -> void:
	if away:
		return
	chase_id = id
	_chase_lost = 0.0
	state = "perseguindo"
	mood = 2
	bubble = "!"
	if _door_target < 1.0:
		_door_target = 1.0
	steps.push_front({"chase": true})
	Game.fx("sfx", "chase_sting")
	Game.fx("toast", "%s: O QUE É ISSO?!" % _pname(id), "bad")

func _do_chase(delta: float) -> void:
	state = "perseguindo"
	var st: Dictionary = Game.pstate.get(chase_id, {})
	if st.is_empty() or Game.ps.get(chase_id, {}).get("fired", true):
		_end_chase(false)
		return
	var target: Vector3 = st.p
	var pos := _player_point(st)
	var seen := sees(pos, 200.0, 18.0)
	_chase_lost = 0.0 if seen else _chase_lost + delta
	# sentou com trabalho na tela: despistou
	if int(st.get("s", -1)) >= 0 and st.get("a", "") == "w" and st.get("h", "") == "":
		Game.fx("toast", "%s despistou o chefe." % _pname(chase_id), "good")
		_end_chase(false)
		return
	if st.get("hid", false) or _chase_lost > B.CHASE_GIVE_UP:
		if st.get("hid", false):
			Game.add_sus(chase_id, 12.0, "fugiu para o banheiro")
			Game.fx("popup", "+12 👁 fugiu para o banheiro", "sus", office.points.bath_door + Vector3(0, 2, 0))
		_end_chase(false)
		return
	var goal := target
	if not seen:
		var path := office.path(global_position, target)
		goal = path[1] if path.size() > 1 else target
	_walk_to(goal, B.BOSS_CHASE * minf(B.sharp(Game.day), 1.3), delta)
	if global_position.distance_to(target) < B.CATCH_DIST:
		Game.add_sus(chase_id, B.SUS_CAUGHT_CHASE * B.sharp(Game.day), "pego no flagra")
		Game.fx("popup", "+%d 👁 PEGO NO FLAGRA!" % int(B.SUS_CAUGHT_CHASE * B.sharp(Game.day)), "sus", target + Vector3(0, 2, 0))
		Game.fx("sfx", "caught")
		world.host_confiscate(chase_id)
		_end_chase(true)

func _end_chase(_caught: bool) -> void:
	steps.pop_front()
	chase_id = 0
	mood = 0
	bubble = ""
	# volta para a sala pelo grafo e retoma o expediente
	steps = _route(office.points.door_out)
	_return_room()
	if current_idx >= 0:
		steps.append({"done": current_idx})

# ------------------------------------------------------------------ barulho e distrações
func hear(pos: Vector3, r: float, _who: int) -> void:
	if away or state in ["perseguindo", "sala", "elevador", "distraido"]:
		return
	if global_position.distance_to(pos) > r:
		return
	bubble = "?"
	var keep := steps.duplicate()
	steps = _route(pos)
	steps.append({"wait": 2.0, "look_around": true})
	steps.append_array(keep)
	state = "investigando"

func distract(pos: Vector3, hold: float) -> bool:
	if away or state == "perseguindo" or state == "elevador":
		return false
	var from := global_position
	steps.clear()
	if state == "sala":
		_leave_room()
		from = office.points.door_out
	for p in office.path(from, pos):
		steps.append({"go": p})
	steps.append({"hold": hold})
	_return_room()
	if current_idx >= 0:
		steps.append({"done": current_idx})
	return true

# ------------------------------------------------------------------ visual (todos)
func _process(delta: float) -> void:
	if not Game.host() and not Game.boss_state.is_empty():
		var bs: Dictionary = Game.boss_state
		_remote_target = bs.p
		global_position = global_position.lerp(_remote_target, 1.0 - exp(-12.0 * delta))
		yaw = lerp_angle(yaw, bs.y, 1.0 - exp(-12.0 * delta))
		state = bs.st
		mood = bs.m
		visible = not bs.away
		_vel = bs.get("v", 0.0)
	rotation.y = yaw
	look.set_mood(mood)
	look.look_target = Vector2(sin(Time.get_ticks_msec() / 900.0) * 0.4, 0) if state == "parado" else Vector2.ZERO
	look.animate(delta, _vel)
	body.global_transform = global_transform
