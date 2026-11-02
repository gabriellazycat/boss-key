class_name Report
## Janelas grandes: relatório do dia, loja da noite, fim da run e pausa.

static func _box(width := 720.0) -> Array:
	var p := PanelContainer.new()
	p.custom_minimum_size = Vector2(width, 0)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	p.add_child(v)
	return [p, v]

static func _row(v: VBoxContainer, label: String, value: String, ok: bool) -> void:
	var h := HBoxContainer.new()
	v.add_child(h)
	var l := UiTheme.text(label, 22)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(l)
	h.add_child(UiTheme.text(value + ("  ✓" if ok else "  ✖"), 22, Color("#7dff9a") if ok else Color("#ff6b6b")))

static func make(rep: Dictionary, hud) -> Control:
	var b := _box()
	var v: VBoxContainer = b[1]
	v.add_child(UiTheme.title("FIM DO DIA %d" % rep.day, 42))
	v.add_child(UiTheme.text("18:00 — " + str(rep.why), 18, Color("#c9c3d6")))
	_row(v, "Trabalho (cota do time)", "%d / %d" % [int(rep.quota), int(rep.quota_goal)], rep.quota >= rep.quota_goal)
	_row(v, "FUN (meta)", "%d / %d" % [int(rep.fun_team), int(rep.fun_goal)], rep.fun_team >= rep.fun_goal)
	for id in rep.players:
		var p: Dictionary = rep.players[id]
		var line := "%s — FUN %d · Suspeita %d%% · clutches %d%s" % [p.name, int(p.fun), int(p.sus), int(p.clutches), "  · DEMITIDO(A)" if p.fired else ""]
		v.add_child(UiTheme.text(line, 18, Color("#ffd98a")))
		var reasons: Dictionary = p.reasons
		if not reasons.is_empty():
			var keys := reasons.keys()
			keys.sort_custom(func(a, c): return reasons[a] > reasons[c])
			var parts := []
			for k in keys.slice(0, 3):
				parts.append("%s +%d" % [k, int(reasons[k])])
			v.add_child(UiTheme.text("   De onde veio a Suspeita: " + ", ".join(parts), 16, Color("#c9c3d6")))
	if rep.strikes_add.is_empty():
		v.add_child(UiTheme.text("Dia limpo! Nenhum strike.", 22, Color("#7dff9a")))
	else:
		for s in rep.strikes_add:
			v.add_child(UiTheme.text(("✖ STRIKE: " if rep.counted else "(treino, não conta) ") + s, 20, Color("#ff6b6b")))
	v.add_child(UiTheme.text("Strikes: %d de %d   ·   Carteira: %d FUN para gastar" % [rep.strikes, B.STRIKES_MAX, Game.wallet], 20))
	if Game.phase != "over":
		v.add_child(UiTheme.text("No térreo: o balcão de UPGRADES gasta sua carteira; a porta da rua começa o próximo dia.", 17, Color("#c9c3d6")))
		v.add_child(UiTheme.button("Continuar  ▶", func(): hud.close_modal()))
	return b[0]

static func make_shop(hud) -> Control:
	var b := _box(820)
	var v: VBoxContainer = b[1]
	v.add_child(UiTheme.title("BALCÃO DE UPGRADES — TÉRREO", 36))
	var wallet := UiTheme.text("", 22, Color("#ffc94a"))
	v.add_child(wallet)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 10)
	v.add_child(grid)
	var refresh := func(): pass
	var buttons := {}
	for up in B.UPGRADES:
		var def: Dictionary = B.UPGRADES[up]
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(390, 0)
		var cv := VBoxContainer.new()
		card.add_child(cv)
		var name_l := UiTheme.text(def.nome, 20, Color.WHITE)
		cv.add_child(name_l)
		cv.add_child(UiTheme.text(def.desc, 15, Color("#c9c3d6")))
		var btn := UiTheme.button("", func(): Game.buy(up))
		cv.add_child(btn)
		buttons[up] = [btn, name_l]
		grid.add_child(card)
	refresh = func():
		wallet.text = "Carteira: %d FUN" % Game.wallet
		for up in buttons:
			var price := Game.upgrade_price(up)
			var lvl := Game.up_level(up)
			var btn: Button = buttons[up][0]
			buttons[up][1].text = "%s  %s" % [B.UPGRADES[up].nome, "●".repeat(lvl) + "○".repeat(maxi(B.UPGRADES[up].precos.size() - lvl, 0))]
			if price < 0:
				btn.text = "no máximo" if up != "atestado" or Game.used_atestado else "sem strikes"
				btn.disabled = true
			else:
				btn.text = "Comprar — %d FUN" % price
				btn.disabled = Game.wallet < price
	refresh.call()
	Game.changed.connect(refresh)
	v.add_child(UiTheme.button("Fechar", func():
		Game.changed.disconnect(refresh)
		hud.close_modal()))
	return b[0]

static func make_over(summary: Dictionary, _hud) -> Control:
	var b := _box()
	var v: VBoxContainer = b[1]
	v.add_child(UiTheme.title("FIM DA RUN", 48, Color("#ff6b6b")))
	v.add_child(UiTheme.text("3 strikes. O RH mandou um e-mail educado.", 22, Color("#c9c3d6")))
	v.add_child(UiTheme.text("Dias sobrevividos: %d" % summary.days, 26))
	v.add_child(UiTheme.text("FUN total: %d" % int(summary.fun), 26, Color("#ffc94a")))
	v.add_child(UiTheme.text("Recorde: %d dias · %d FUN" % [Settings.best_days, Settings.best_fun], 20, Color("#c9c3d6")))
	v.add_child(UiTheme.button("Voltar ao menu", func(): Game.quit_run()))
	return b[0]

static func make_pause(hud) -> Control:
	var b := _box(560)
	var v: VBoxContainer = b[1]
	v.add_child(UiTheme.title("PAUSA" if not Net.online() else "MENU (o jogo continua!)", 34))
	if not Net.online():
		hud.get_tree().paused = true
		hud.process_mode = Node.PROCESS_MODE_ALWAYS
	v.add_child(Options.make())
	v.add_child(UiTheme.button("Continuar", func():
		hud.get_tree().paused = false
		hud.close_modal()))
	v.add_child(UiTheme.button("Sair para o menu", func():
		hud.get_tree().paused = false
		Game.quit_run(), Color("#e8394d")))
	return b[0]
