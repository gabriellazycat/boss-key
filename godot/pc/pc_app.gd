class_name PcApp
extends Control
## Base de um app do PC (BossOS). O app desenha dentro da área de conteúdo (448×236 px, pixel art).
## Só recebe teclado quando o dono está sentado com o app em foco.
## Paleta e fonte fixas para todos os apps terem a mesma cara.

signal earned_work(amount: float)
signal earned_fun(amount: float)
signal noise(radius: float)
signal mistake(text: String)

const W := 448
const H := 236
const COL := {
	"bg": Color("#f6f1e7"), "ink": Color("#1d1b25"), "grid": Color("#d8cfbf"), "accent": Color("#2fb8a6"),
	"red": Color("#e8394d"), "yellow": Color("#ffc94a"), "blue": Color("#3d8bff"), "green": Color("#5cbf5a"),
	"dark": Color("#1b1830"), "mid": Color("#4a4560"), "white": Color("#ffffff"), "pink": Color("#f27fa5"),
}
static var FONT: Font = preload("res://assets/fonts/PixelifySans.ttf")

var app_id := ""
var title := ""
var is_work := false
var key_hint := ""          # texto da barra de dicas embaixo da janela
var focused := false        # dono sentado e olhando a tela
var demo := false           # tela de outro jogador: só anima

func _init() -> void:
	size = Vector2(W, H)
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE

## chamado todo frame pelo PC (mesmo sem foco, para animar)
func app_process(_delta: float) -> void:
	pass

## teclado do dono (só com foco)
func app_input(_event: InputEvent) -> void:
	pass

func on_open() -> void:
	pass

func on_close() -> void:
	pass

func text(pos: Vector2, s: String, sz := 16, c := Color("#1d1b25"), align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string(FONT, pos, s, align, width, sz, c)
