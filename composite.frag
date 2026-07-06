#version 300 es
// Composites one layer texture over the accumulator with a chosen blend mode and
// per-layer opacity. Blending of src OVER dst uses standard alpha; the blend mode
// affects how RGB are combined before the OVER step.
precision highp float;

uniform sampler2D uLayer;   // current layer (straight alpha)
uniform sampler2D uBelow;   // accumulated result below this layer (straight alpha)
uniform float uOpacity;     // layer opacity 0..1
uniform int uBlend;         // matches BlendMode ordinal
uniform vec3 uTint;         // onion-skin tint colour
uniform float uTintStrength;// 0 = no tint (normal layer), 1 = fully tinted

in vec2 vUv;
out vec4 fragColor;

vec3 applyBlend(vec3 base, vec3 src, int mode) {
    if (mode == 1) return base * src;                                   // MULTIPLY
    if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - src);             // SCREEN
    if (mode == 3) return mix(2.0*base*src, 1.0-2.0*(1.0-base)*(1.0-src), step(0.5, base)); // OVERLAY
    if (mode == 4) return min(base + src, vec3(1.0));                   // ADD
    if (mode == 5) return min(base, src);                              // DARKEN
    if (mode == 6) return max(base, src);                              // LIGHTEN
    if (mode == 7) return abs(base - src);                            // DIFFERENCE
    return src;                                                         // NORMAL
}

void main() {
    vec4 below = texture(uBelow, vUv);
    vec4 layer = texture(uLayer, vUv);
    layer.a *= uOpacity;

    // Onion-skin tint: blend the layer's own colour toward the tint colour. Strength 0
    // leaves normal layers untouched; ghosts pull toward red (past) / blue (future).
    layer.rgb = mix(layer.rgb, uTint, uTintStrength);

    vec3 blended = applyBlend(below.rgb, layer.rgb, uBlend);
    // The blended RGB is what the layer "contributes"; mix toward it by layer alpha.
    vec3 srcRgb = mix(layer.rgb, blended, below.a);

    float outA = layer.a + below.a * (1.0 - layer.a);
    vec3 outRgb = (srcRgb * layer.a + below.rgb * below.a * (1.0 - layer.a));
    if (outA > 0.0) outRgb /= outA;

    fragColor = vec4(outRgb, outA);
}
