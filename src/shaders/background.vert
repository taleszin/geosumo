attribute vec2 aPosition;

varying vec2 vUV;

void main(void) {
    vUV = aPosition * 0.5 + 0.5;         // 0..1 screenspace
    gl_Position = vec4(aPosition, 0.999, 1.0); // far plane
}
