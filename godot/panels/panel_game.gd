class_name PanelGame
extends Control
## Base dos minigames em painel (estilo Among Us). O painel fica no centro da tela, o mouse aparece,
## [Q] desiste. O jogador fica parado e meio cego — o chefe pode chegar enquanto isso!
## Área de desenho: 560×380 px. Chame finish(true) ao concluir, finish(false) ao falhar/desistir.

signal done(ok: bool)

const W := 560.0
const H := 380.0
const COL := {
	"bg": Color("#1d1b25"), "panel": Color("#2b2836"), "line": Color("#4a4560"), "text": Color("#f6f1e7"),
	"dim": Color("#9a93ad"), "accent": Color("#2fb8a6"), "red": Color("#e8394d"), "yellow": Color("#ffc94a"),
	"blue": Color("#3d8bff"), "green": Color("#5cbf5a"), "pink": Color("#f27fa5"), "orange": Color("#f58a3a"),
}
static var FONT: Font = preload("res://assets/fonts/Fredoka.ttf")

var title := "Painel"
var hint := ""                 # 1 linha: o que fazer
var speed := 1.0               # upgrade "mãos rápidas" deixa > 1
var _finished := false
var _end_t := 0.0
var _ok := false

func _init() -> void:
	size = Vector2(W, H)
	custom_minimum_size = size
	mouse_filter = Control.MOUSE_FILTER_STOP

func _ready() -> void:
	speed = 1.0 + B.UPGRADE_HANDS * Game.up_level("maos")
	setup()

## monte o estado inicial aqui
func setup() -> void:
	pass

## lógica por frame (já multiplicada pela velocidade se quiser usar `speed`)
func tick(_delta: float) -> void:
	pass

## desenho do conteúdo (a moldura, o título e a dica já são desenhados pela base)
func draw_game() -> void:
	pass

func finish(ok: bool) -> void:
	if _finished:
		return
	_finished = true
	_ok = ok
	_end_t = 0.6 if ok else 0.25
	Sfx.play("panel_ok" if ok else "panel_fail", -4.0)

func _process(delta: float) -> void:
	if _finished:
		_end_t -= delta
		if _end_t <= 0.0:
			done.emit(_ok)
			queue_free()
		queue_redraw()
		return
	tick(delta)
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("drop") or event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		finish(false)

func _draw() -> void:
	draw_rect(Rect2(0, 0, W, H), COL.bg)
	draw_rect(Rect2(0, 0, W, H), COL.line, false, 3.0)
	draw_string(FONT, Vector2(18, 32), title, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, COL.yellow)
	draw_string(FONT, Vector2(W - 120, 30), "[Q] desistir", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, COL.dim)
	draw_string(FONT, Vector2(18, H - 14), hint, HORIZONTAL_ALIGNMENT_LEFT, W - 36, 15, COL.text)
	draw_game()
	if _finished:
		var c: Color = COL.green if _ok else COL.red
		draw_rect(Rect2(0, 0, W, H), Color(c, 0.25))
		var txt := "FEITO!" if _ok else "DESISTIU"
		draw_string(FONT, Vector2(0, H / 2 + 20), txt, HORIZONTAL_ALIGNMENT_CENTER, W, 56, c.lightened(0.3))

func label(pos: Vector2, s: String, sz := 16, c := Color("#f6f1e7"), align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string(FONT, pos, s, align, width, sz, c)

## posição do mouse dentro do painel
func mouse() -> Vector2:
	return get_local_mouse_position()
