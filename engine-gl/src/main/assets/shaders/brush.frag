#version 300 es
// Tilt-aware brush dab fragment shader. Round tips use aspect 1; eligible stylus tips
// become rotated ellipses as the S Pen approaches the tablet surface.
precision highp float;

uniform vec4 uColor;
uniform float uHardness;

in float vAngle;
in float vFlow;
in float vAspect;
out vec4 fragColor;

void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float c = cos(-vAngle);
    float s = sin(-vAngle);
    vec2 q = mat2(c, -s, s, c) * p;
    q.y *= max(vAspect, 1.0);
    float dist = length(q);

    float inner = clamp(uHardness, 0.0, 0.98);
    float falloff = 1.0 - smoothstep(inner, 1.0, dist);
    float alpha = falloff * vFlow * uColor.a;
    if (alpha <= 0.0) discard;

    fragColor = vec4(uColor.rgb, alpha);
}
