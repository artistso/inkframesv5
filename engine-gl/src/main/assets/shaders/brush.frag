#version 300 es
// Brush dab fragment shader.
// Produces a soft-edged round dab, scaled by the per-dab flow. The dab's RGB is the
// brush color; alpha is (radial falloff * flow). Dabs are stamped into a stroke scratch
// buffer; the brush's overall opacity is applied later, once, at composite time.
precision highp float;

uniform vec4 uColor;      // brush color; uColor.a is a global multiplier (usually 1)
uniform float uHardness;  // 0 = very soft, 1 = crisp edge

in float vAngle;
in float vFlow;
out vec4 fragColor;

void main() {
    // gl_PointCoord is [0,1] across the sprite; recenter to [-1,1].
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float dist = length(p);

    // Smooth radial falloff. Inner radius grows with hardness.
    float inner = clamp(uHardness, 0.0, 0.98);
    float falloff = 1.0 - smoothstep(inner, 1.0, dist);
    float alpha = falloff * vFlow * uColor.a;
    if (alpha <= 0.0) discard;

    fragColor = vec4(uColor.rgb, alpha);
}
