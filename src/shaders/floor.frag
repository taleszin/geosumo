precision mediump float;

varying vec3 vWorldPos;
uniform float uTime;
uniform float uArenaRadius;
uniform vec4 uColor;

void main(void) {
    vec2 uv = vWorldPos.xz;

    // Grid procedural
    vec2 grid = abs(fract(uv * 0.5) - 0.5);
    float lineX = smoothstep(0.0, 0.04, grid.x);
    float lineZ = smoothstep(0.0, 0.04, grid.y);
    float gridLine = 1.0 - min(lineX, lineZ);

    // Distância do centro → zona de perigo
    float dist = length(uv);
    float edgeFade = smoothstep(uArenaRadius * 0.6, uArenaRadius, dist);

    // Pulso na borda
    float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + dist * 2.0);

    // Paleta: ciano (seguro) → vermelho (perigo)
    vec3 safeColor  = vec3(0.0, 0.12, 0.15);
    vec3 gridColor  = vec3(0.0, 0.4,  0.5);
    vec3 dangerColor = vec3(0.5, 0.05, 0.0);
    vec3 dangerGrid  = vec3(1.0, 0.2,  0.0);

    vec3 baseCol = mix(safeColor, dangerColor, edgeFade);
    vec3 lineCol = mix(gridColor, dangerGrid,  edgeFade);

    vec3 color = mix(baseCol, lineCol, gridLine * (0.6 + 0.4 * pulse * edgeFade));

    // Anel da borda
    float edgeRing = smoothstep(uArenaRadius - 0.3, uArenaRadius, dist);
    color += edgeRing * dangerGrid * pulse * 0.6;

    // Fora da arena = escuro
    float outside = smoothstep(uArenaRadius, uArenaRadius + 0.5, dist);
    color = mix(color, vec3(0.02, 0.02, 0.02), outside);

    gl_FragColor = vec4(color, 1.0);
}
