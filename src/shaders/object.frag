precision mediump float;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLightWeighting;

uniform vec4  uColor;
uniform float uHitFlash;   // 0..1 — flash branco no impacto
uniform float uNeonPower;  // intensidade do rim-light

void main(void) {
    // Fresnel (rim / neon edge)
    float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    fresnel = pow(fresnel, 2.5) * uNeonPower;

    vec3 baseColor = uColor.rgb * vLightWeighting;

    // Neon na borda usando cor do objeto (mais claro)
    vec3 neonColor = uColor.rgb + vec3(0.4);
    baseColor += neonColor * fresnel;

    // Hit flash (branco aditivo)
    baseColor = mix(baseColor, vec3(1.5), uHitFlash);

    gl_FragColor = vec4(baseColor, uColor.a);
}
