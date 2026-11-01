extends Node
## Sons do jogo. play("nome") toca em 2D; at("nome", pos) toca posicional no mundo.
## Os .wav são gerados por tools/gen_sfx.py. Som faltando não quebra nada.

const LOOPS := ["elevator_move", "printer_jam", "radio_music", "fish_reel", "office_ambience", "menu_music", "heartbeat"]

var _cache := {}
var _music: AudioStreamPlayer
var _ambience: AudioStreamPlayer

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_music = AudioStreamPlayer.new()
	_music.bus = "Master"
	add_child(_music)
	_ambience = AudioStreamPlayer.new()
	add_child(_ambience)

func stream(name: String) -> AudioStream:
	if _cache.has(name):
		return _cache[name]
	var path := "res://assets/sfx/%s.wav" % name
	var s: AudioStream = null
	if ResourceLoader.exists(path):
		s = load(path)
		if s is AudioStreamWAV and name in LOOPS:
			s = s.duplicate()
			s.loop_mode = AudioStreamWAV.LOOP_FORWARD
			s.loop_begin = 0
			s.loop_end = int(s.get_length() * s.mix_rate)
	_cache[name] = s
	return s

func play(name: String, vol_db := 0.0, pitch := 1.0) -> AudioStreamPlayer:
	var s := stream(name)
	if s == null:
		return null
	var p := AudioStreamPlayer.new()
	p.stream = s
	p.volume_db = vol_db
	p.pitch_scale = pitch
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)
	return p

## som posicional (precisa de uma árvore 3D ativa)
func at(name: String, pos: Vector3, vol_db := 0.0, pitch := 1.0, max_dist := 30.0) -> AudioStreamPlayer3D:
	var s := stream(name)
	var tree := get_tree()
	if s == null or tree.current_scene == null:
		return null
	var p := AudioStreamPlayer3D.new()
	p.stream = s
	p.volume_db = vol_db
	p.pitch_scale = pitch
	p.max_distance = max_dist
	p.unit_size = 4.0
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	tree.current_scene.add_child(p)
	p.global_position = pos
	p.play()
	p.finished.connect(p.queue_free)
	return p

## laço preso a um nó (impressora, rádio): devolve o player para parar depois
func loop_on(name: String, parent: Node3D, vol_db := 0.0) -> AudioStreamPlayer3D:
	var s := stream(name)
	if s == null:
		return null
	var p := AudioStreamPlayer3D.new()
	p.stream = s
	p.volume_db = vol_db
	p.unit_size = 5.0
	parent.add_child(p)
	p.play()
	return p

func music(name: String, vol_db := -8.0) -> void:
	var s := stream(name)
	if _music.stream == s and _music.playing:
		return
	_music.stream = s
	_music.volume_db = vol_db + linear_to_db(maxf(Settings.music_vol, 0.001))
	if s:
		_music.play()

func stop_music() -> void:
	_music.stop()
	_music.stream = null

func ambience(on: bool) -> void:
	if on and not _ambience.playing:
		_ambience.stream = stream("office_ambience")
		_ambience.volume_db = -6.0
		if _ambience.stream:
			_ambience.play()
	elif not on:
		_ambience.stop()
