#version 300 es
// Brush dab vertex shader.
// Each dab is drawn as a point sprite; instance attributes carry per-dab state.
precision highp float;

layout(location = 0) in vec2 aCenter;   // dab center in canvas pixels
layout(location = 1) in float aSize;     // dab diameter in pixels
layout(location = 2) in float aAngle;    // rotation (radians) for non-round tips
layout(location = 3) in float aFlow;     // per-dab coverage 0..1

uniform vec2 uCanvasSize;                // target framebuffer size in pixels

out float vAngle;
out float vFlow;

void main() {
    // Map canvas-pixel coords to clip space [-1, 1]. Y is flipped so (0,0) is top-left.
    vec2 ndc = (aCenter / uCanvasSize) * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = aSize;
    vAngle = aAngle;
    vFlow = aFlow;
}
