#version 300 es
// Fullscreen-quad vertex shader used to composite layer textures and draw the
// final canvas to screen.
precision highp float;

layout(location = 0) in vec2 aPos;   // clip-space quad corners (-1..1)
layout(location = 1) in vec2 aUv;    // texture coords (0..1)

out vec2 vUv;

void main() {
    vUv = aUv;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
