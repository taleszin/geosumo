attribute vec3 aVertexPosition;
attribute vec3 aVertexNormal;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
uniform mat4 uNMatrix;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLightWeighting;

void main(void) {
    vec4 mvPos = uMVMatrix * vec4(aVertexPosition, 1.0);
    gl_Position = uPMatrix * mvPos;

    // Normal em view space
    vNormal  = normalize((uNMatrix * vec4(aVertexNormal, 0.0)).xyz);
    vViewDir = normalize(-mvPos.xyz);

    // Gouraud — duas luzes direcionais
    vec3 light1 = normalize(vec3( 0.5, 1.0,  0.3));
    vec3 light2 = normalize(vec3(-0.4, 0.6, -0.8));

    float d1 = max(dot(vNormal, light1), 0.0);
    float d2 = max(dot(vNormal, light2), 0.0);

    vec3 ambient = vec3(0.12);
    vLightWeighting = ambient + vec3(0.7) * d1 + vec3(0.25, 0.2, 0.3) * d2;
}
