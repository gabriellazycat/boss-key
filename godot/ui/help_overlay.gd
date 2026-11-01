class_name HelpOverlay
## Ajuda (segure TAB): controles e as regras em 6 linhas.

static func make(theme: Theme) -> Control:
	var p := PanelContainer.new()
	p.theme = theme
	p.set_anchors_preset(Control.PRESET_CENTER)
	p.position = Vector2(-430, -270)
	p.custom_minimum_size = Vector2(860, 540)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	p.add_child(v)
	v.add_child(UiTheme.title("COMO ENROLAR SEM SER DEMITIDO", 30))
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 40)
	v.add_child(cols)
	var left := UiTheme.text("""EM PÉ
WASD andar · SHIFT correr · CTRL agachar
E usar / sentar · Q largar item
ESPAÇO pular

SENTADO NO PC
F trabalhar (planilha no ritmo)
A / D triagem de e-mails
1-4 trocar de app
ESPAÇO alterna JOGO ↔ TRABALHO
Mouse vira a cabeça (olhe a porta do chefe!)
E levantar""", 18)
	left.custom_minimum_size = Vector2(380, 0)
	cols.add_child(left)
	var right := UiTheme.text("""REGRAS
• Às 18h você precisa ter batido a cota de TRABALHO e a meta de FUN. Faltou uma = 1 strike.
• Se o chefe te VÊ enrolando, a SUSPEITA sobe cada vez mais rápido. 100% = demitido (1 strike).
• 3 strikes = fim da run. O 1º dia é treino.
• A agenda do chefe fica no quadro ao lado da porta dele. A lâmpada vermelha acesa = ele está no salão.
• Quando ele sai do andar (almoço), é a hora do ASSALTO do dia.
• Trocar para o trabalho no último segundo antes dele ler a tela = CLUTCH (bônus de FUN).""", 18)
	right.custom_minimum_size = Vector2(400, 0)
	cols.add_child(right)
	return p
