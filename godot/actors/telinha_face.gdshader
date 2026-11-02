shader_type spatial;
render_mode unshaded, cull_back;
// Rosto do Telinha desenhado na tela da cabeça: olhos, sobrancelhas e boca por SDF.
// mood: 0 neutro · 1 feliz · 2 bravo · 3 assustado · 4 desconfiado · 5 dormindo

uniform vec3 bg : source_color = vec3(0.12, 0.75, 0.68);
uniform vec3 ink : source_color = vec3(0.05, 0.08, 0.12);
uniform float glow = 1.6;
uniform float blink = 1.0;      // 1 aberto · 0 fechado
uniform vec2 look = vec2(0.0);  // -1..1
uniform float mood = 0.0;
uniform float talk = 0.0;       // 0..1 abre a boca
uniform float flash = 0.0;      // pisca branco (susto, dano)
uniform float aspect = 1.35;    // largura/altura da tela
uniform float face_scale = 1.0; // > 1 = traços maiores

float sd_round_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sd_segment(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
	return length(pa - ba * h);
}

// arco de boca: curvatura k (+ sorriso, - tristeza)
float sd_mouth(vec2 p, float w, float k) {
	float x = clamp(p.x, -w, w);
	float y = k * (x * x / (w * w) - 0.5) * 0.12;
	return length(vec2(p.x - x, p.y - y));
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	uv.y = -uv.y;
	uv.x *= aspect;
	uv /= face_scale;
	if (mood > 5.5) {
		// demitido: tela azul com :(
		vec3 blue = mix(vec3(0.09, 0.22, 0.66), vec3(0.23, 0.47, 0.94), UV.y);
		float sad = min(min(length(uv - vec2(-0.3, 0.2)) - 0.08, length(uv - vec2(-0.3, -0.2)) - 0.08),
			abs(length(uv - vec2(0.55, 0.0)) - 0.42) - 0.05);
		sad = min(sad, length(uv - vec2(-0.3, 0.2)) - 0.08);
		float s2 = max(abs(length(uv - vec2(0.55, 0.0)) - 0.42) - 0.05, uv.x - 0.42);
		float d2 = min(min(length(uv - vec2(-0.3, 0.2)) - 0.08, length(uv - vec2(-0.3, -0.2)) - 0.08), s2);
		float a2 = 1.0 - smoothstep(-fwidth(d2), fwidth(d2), d2);
		ALBEDO = mix(blue, vec3(1.0), a2) * glow;
	} else {
	float m = mood;
	vec2 lk = look * vec2(0.16, 0.1);
	float open = clamp(blink, 0.04, 1.0);
	float eye_h = 0.2 * open;
	float eye_w = 0.13;
	if (m > 2.5 && m < 3.5) { eye_h *= 1.35; eye_w *= 1.2; }        // assustado: olhão
	if (m > 3.5 && m < 4.5) { eye_h *= 0.45; }                      // desconfiado: olho apertado
	if (m > 4.5) { eye_h = 0.025; }                                  // dormindo
	float d = 1e3;
	for (int i = 0; i < 2; i++) {
		float s = i == 0 ? -1.0 : 1.0;
		vec2 c = vec2(0.42 * s, 0.12) + lk;
		vec2 p = uv - c;
		if (m > 0.5 && m < 1.5) {
			// feliz: olho em arco ^ ^
			float arc = abs(length(p - vec2(0.0, -0.1)) - 0.16) - 0.035;
			arc = max(arc, -p.y + 0.0 - 0.05);
			d = min(d, arc);
		} else {
			d = min(d, sd_round_box(p, vec2(eye_w, eye_h), min(eye_w, eye_h) * 0.95));
		}
		// sobrancelha brava: barra inclinada
		if (m > 1.5 && m < 2.5) {
			vec2 a = c + vec2(-0.2 * s, 0.34);
			vec2 b = c + vec2(0.16 * s, 0.24);
			d = min(d, sd_segment(uv, a, b) - 0.045);
		}
	}
	// boca
	vec2 mp = uv - vec2(lk.x * 0.6, -0.42);
	float mouth;
	if (talk > 0.05 || (m > 2.5 && m < 3.5)) {
		float o = max(talk, (m > 2.5 && m < 3.5) ? 0.8 : 0.0);
		mouth = sd_round_box(mp, vec2(0.16, 0.05 + 0.1 * o), 0.05);
	} else if (m > 0.5 && m < 1.5) {
		mouth = sd_mouth(mp, 0.24, 1.6) - 0.04;
	} else if (m > 1.5 && m < 2.5) {
		mouth = sd_mouth(mp, 0.2, -1.4) - 0.04;
	} else if (m > 3.5 && m < 4.5) {
		mouth = sd_segment(mp, vec2(-0.14, 0.02), vec2(0.16, -0.03)) - 0.035;
	} else if (m > 4.5) {
		mouth = sd_round_box(mp - vec2(0.05, 0.0), vec2(0.06, 0.06), 0.06);
	} else {
		mouth = sd_mouth(mp, 0.18, 0.7) - 0.035;
	}
	d = min(d, mouth);
	float aa = fwidth(d) * 1.2;
	float shape = 1.0 - smoothstep(-aa, aa, d);
	vec3 col = mix(bg, ink, shape);
	// brilho de tela: linhas de varredura e vinheta
	float scan = 0.88 + 0.12 * sin(UV.y * 260.0 + TIME * 6.0);
	float vig = smoothstep(1.35, 0.4, length(UV * 2.0 - 1.0));
	col *= scan * mix(0.55, 1.0, vig);
	col = mix(col, vec3(1.0), flash);
	ALBEDO = col * glow;
	}
}
