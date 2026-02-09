attribute vec3 aVertexPosition;
attribute vec3 aVertexNormal;
attribute vec2 aTexCoord;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewPos;    // posição em view-space
varying vec2 vTexCoord;

void main(void) {
    vec4 viewPos = uMVMatrix * vec4(aVertexPosition, 1.0);
    gl_Position = uPMatrix * viewPos;

    vWorldPos = aVertexPosition;
    vNormal   = aVertexNormal;
    vViewPos  = viewPos.xyz;
    vTexCoord = aTexCoord;
}
