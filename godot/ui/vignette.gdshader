shader_type canvas_item;
// Vinheta vermelha que pulsa quando a Suspeita está subindo.
uniform float amount = 0.0;

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float r = length(uv * vec2(1.0, 1.25));
	float pulse = 0.85 + 0.15 * sin(TIME * 9.0);
	float a = smoothstep(0.75, 1.45, r) * amount * pulse;
	COLOR = vec4(0.85, 0.05, 0.12, a);
}
