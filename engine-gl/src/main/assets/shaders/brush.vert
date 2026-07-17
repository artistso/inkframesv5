#version 300 es
// Brush dab vertex shader. Each point sprite carries pressure/tilt-derived geometry.
precision highp float;

layout(location = 0) in vec2 aCenter;
layout(location = 1) in float aSize;
layout(location = 2) in float aAngle;
layout(location = 3) in float aFlow;
layout(location = 4) in float aAspect;

uniform vec2 uCanvasSize;

out float vAngle;
out float vFlow;
out float vAspect;

void main() {
    vec2 ndc = (aCenter / uCanvasSize) * 2.0 - 1.0;
    ndc.y = -ndc.y;
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = aSize;
    vAngle = aAngle;
    vFlow = aFlow;
    vAspect = max(aAspect, 1.0);
}
