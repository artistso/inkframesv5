#version 300 es
// Brush dab vertex shader — supports textured tips, tilt distortion, and azimuth rotation.
precision highp float;

layout(location = 0) in vec2  aCenter;    // dab centre in canvas pixels
layout(location = 1) in float aSize;      // dab diameter in pixels (pressure + velocity modulated)
layout(location = 2) in float aAngle;     // azimuth rotation (radians) — aligns tip with pen direction
layout(location = 3) in float aFlow;      // per-dab coverage 0..1
layout(location = 4) in float aTilt;      // stylus tilt from vertical (radians, 0=perpendicular)

uniform vec2 uCanvasSize;                  // target framebuffer size in pixels

out float vAngle;
out float vFlow;
out float vTilt;

void main() {
    // Map canvas-pixel coords to clip space [-1, 1]. Y flipped so (0,0) is top-left.
    vec2 ndc = (aCenter / uCanvasSize) * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position  = vec4(ndc, 0.0, 1.0);
    // Tilt squashes the point sprite: a flat stylus (tilt=π/2) makes the dab ~60% as tall.
    float tiltSqueeze = 1.0 - sin(aTilt) * 0.4;
    gl_PointSize = aSize * tiltSqueeze;
    vAngle = aAngle;
    vFlow  = aFlow;
    vTilt  = aTilt;
}
