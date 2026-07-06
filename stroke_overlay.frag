#version 300 es
// Composites the accumulated stroke scratch buffer onto a cel exactly once, scaling
// its coverage by the brush's overall opacity. Because the whole stroke is flattened
// in the scratch buffer first, overlapping dabs do NOT darken at this step — the cel
// receives a single uniform application at `uOpacity`.
//
// The actual paint-vs-erase decision is made by the fixed-function blend state set by
// the caller (normal source-over for paint, dst-alpha subtract for eraser).
precision highp float;

uniform sampler2D uStroke;   // straight-alpha stroke scratch buffer
uniform float uOpacity;      // brush opacity 0..1, applied once for the whole stroke

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 c = texture(uStroke, vUv);
    fragColor = vec4(c.rgb, c.a * uOpacity);
}
