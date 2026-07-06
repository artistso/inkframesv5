#version 300 es
// Brush dab fragment shader.
// Supports both procedural round dabs and texture-mapped tips.
// When uUseTip == 0 the classic soft radial falloff is used (round/ink/airbrush).
// When uUseTip == 1 the tip texture is sampled, rotated by the pen azimuth, and
// multiplied by the radial falloff so edges always feather cleanly.
precision highp float;

uniform vec4      uColor;       // brush colour; .a is a global multiplier (usually 1)
uniform float     uHardness;    // 0 = very soft edge, 1 = crisp edge
uniform sampler2D uTip;         // optional brush tip texture (RGBA, pre-multiplied alpha)
uniform int       uUseTip;      // 0 = procedural round, 1 = texture tip

in float vAngle;   // azimuth rotation in radians
in float vFlow;    // per-dab coverage
in float vTilt;    // stylus tilt (unused in frag for now; available for future distortion)
out vec4 fragColor;

void main() {
    // gl_PointCoord is [0,1] across the sprite; recentre to [-1,1].
    vec2 p = gl_PointCoord * 2.0 - 1.0;

    // Rotate the UV by the pen azimuth so the tip texture aligns with stroke direction.
    float cosA = cos(-vAngle);
    float sinA = sin(-vAngle);
    vec2 pr = vec2(cosA * p.x - sinA * p.y,
                   sinA * p.x + cosA * p.y);

    float dist = length(p);

    // Soft radial falloff — shared by both modes to feather the sprite edge.
    float inner   = clamp(uHardness, 0.0, 0.98);
    float falloff = 1.0 - smoothstep(inner, 1.0, dist);

    float alpha;
    if (uUseTip == 1) {
        // Texture tip: sample the tip texture in rotated UV space.
        // Map rotated [-1,1] back to [0,1] for the sampler.
        vec2 tipUv = pr * 0.5 + 0.5;
        // Discard fragments outside the unit circle (keeps the sprite round).
        if (dist > 1.0) discard;
        vec4 tip = texture(uTip, tipUv);
        // Tip alpha drives coverage; multiply by radial falloff for soft edges.
        alpha = tip.a * falloff * vFlow * uColor.a;
        if (alpha <= 0.004) discard;
        // Tint the tip texture toward the brush colour.
        fragColor = vec4(mix(tip.rgb, uColor.rgb, 0.85) * alpha, alpha);
        return;
    }

    // Procedural round dab (default).
    alpha = falloff * vFlow * uColor.a;
    if (alpha <= 0.004) discard;
    fragColor = vec4(uColor.rgb, alpha);
}
