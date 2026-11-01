class_name Agenda
## A agenda pública do chefe (fica no quadro ao lado da porta dele).
## Sorteada pela semente do dia: todo mundo da sala vê a mesma.

static func build(day: int, rng: RandomNumberGenerator) -> Array:
	var out: Array = []
	# 1) almoço fora: a grande janela do assalto, no meio do dia
	var lunch_dur := maxf(B.AGENDA_KIND.almoco.dur - B.LUNCH_SHRINK_PER_DAY * (day - 1), B.LUNCH_MIN)
	var lunch_t := rng.randf_range(B.t_of(11, 30), B.t_of(13, 15))
	out.append(_e(lunch_t, "almoco", lunch_dur))
	# 2) do 3º dia em diante, uma reunião curta fora do andar à tarde
	if day >= B.SECOND_ABSENCE_FROM_DAY:
		out.append(_e(rng.randf_range(B.t_of(15, 0), B.t_of(16, 30)), "reuniao", B.AGENDA_KIND.reuniao.dur))
	# 3) compromissos no andar
	for k in ["cafe", "telefone", "impressao"]:
		if k == "impressao" and day == 1:
			continue
		_place(out, rng, k, B.AGENDA_KIND[k].dur)
	# 4) rondas: espalhadas, a 1ª logo depois da calmaria
	var n := rng.randi_range(B.AGENDA_RONDAS.x, B.AGENDA_RONDAS.y) + (1 if day >= 4 else 0)
	_place(out, rng, "ronda", 30.0, B.CALM_SECONDS + 8.0, B.CALM_SECONDS + 40.0)
	for i in n - 1:
		_place(out, rng, "ronda", 30.0)
	out.sort_custom(func(a, b): return a.t < b.t)
	return out

static func _e(t: float, kind: String, dur: float) -> Dictionary:
	return {"t": snappedf(t, 1.0), "kind": kind, "dur": dur, "state": ""}

## acha um horário livre (folga de 25 s para os vizinhos)
static func _place(out: Array, rng: RandomNumberGenerator, kind: String, dur: float, lo := -1.0, hi := -1.0) -> void:
	if lo < 0.0:
		lo = B.CALM_SECONDS + 10.0
	if hi < 0.0:
		hi = B.DAY_SECONDS - 45.0
	for tries in 60:
		var t := rng.randf_range(lo, hi)
		var ok := true
		for e in out:
			if t < e.t + e.dur + 25.0 and t + dur + 25.0 > e.t:
				ok = false
				break
		if ok:
			out.append(_e(t, kind, dur))
			return

static func label(e: Dictionary) -> String:
	return "%s  %s" % [B.clock_text(e.t), B.AGENDA_KIND[e.kind].nome]

static func away_kind(kind: String) -> bool:
	return kind == "almoco" or kind == "reuniao"
