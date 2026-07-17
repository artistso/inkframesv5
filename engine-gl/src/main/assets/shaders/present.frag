#version 300 es
// Presents the composited canvas onto the screen under the viewport transform
// (pan / zoom / rotate), over a checkerboard so transparent regions are visible.
//
// For each screen fragment we take its view-space pixel (top-left origin to match
// Android touch coords), map it back into canvas pixel space via the packed inverse
// affine (uInv), and sample the canvas texture. Fragments that fall outside the canvas
// show only the backdrop.
precision highp float;

uniform sampler2D uCanvas;
uniform vec2 uScreenSize;   // viewport size in pixels
uniform vec2 uCanvasSize;   // canvas size in pixels
uniform vec4 uInv;          // inverse affine: (iax, iay, ibx, iby)
uniform int uShowChecker;
uniform vec3 uBackground;

out vec4 fragColor;

vec3 checker(vec2 screenPx) {
    float s = 16.0;
    vec2 c = floor(screenPx / s);
    float m = mod(c.x + c.y, 2.0);
    return mix(vec3(0.80), vec3(0.92), m);
}

void main() {
    // Screen pixel in top-left origin (gl_FragCoord is bottom-left origin).
    vec2 vp = vec2(gl_FragCoord.x, uScreenSize.y - gl_FragCoord.y);

    // Inverse transform: canvas = (iax + i*iay) * view + (ibx + i*iby)
    vec2 cp;
    cp.x = uInv.x * vp.x - uInv.y * vp.y + uInv.z;
    cp.y = uInv.y * vp.x + uInv.x * vp.y + uInv.w;

    vec3 bg = (uShowChecker == 1) ? checker(vp) : uBackground;

    // Canvas texture has v=0 at the bottom; canvas pixel y=0 is the top row.
    vec2 uv = vec2(cp.x / uCanvasSize.x, 1.0 - cp.y / uCanvasSize.y);

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(bg, 1.0);
        return;
    }

    vec4 col = texture(uCanvas, uv);
    vec3 outRgb = mix(bg, col.rgb, col.a);
    fragColor = vec4(outRgb, 1.0);
}
