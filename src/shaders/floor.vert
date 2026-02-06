attribute vec3 aVertexPosition;
attribute vec3 aVertexNormal;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 vWorldPos;

void main(void) {
    vec4 worldPos = uMVMatrix * vec4(aVertexPosition, 1.0);
    gl_Position = uPMatrix * worldPos;
    vWorldPos = aVertexPosition;
}
