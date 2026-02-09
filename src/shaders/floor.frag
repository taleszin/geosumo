precision mediump float;

varying vec3 vWorldPos;
uniform float uTime;
uniform float uArenaRadius;
uniform vec4 uColor;

void main(void) {
    vec2 uv = vWorldPos.xz;

    // Distância do centro
    float dist = length(uv);
    float normDist = dist / uArenaRadius;

    // ── Grid procedural (dupla resolução) ────────────────────
    // Grid principal (largo)
    vec2 gridA = abs(fract(uv * 0.5) - 0.5);
    float lineAx = smoothstep(0.0, 0.035, gridA.x);
    float lineAz = smoothstep(0.0, 0.035, gridA.y);
    float gridMain = 1.0 - min(lineAx, lineAz);

    // Sub-grid (fino, mais sutil)
    vec2 gridB = abs(fract(uv * 2.0) - 0.5);
    float lineBx = smoothstep(0.0, 0.06, gridB.x);
    float lineBz = smoothstep(0.0, 0.06, gridB.y);
    float gridSub = (1.0 - min(lineBx, lineBz)) * 0.2;

    float gridLine = max(gridMain, gridSub);

    // ── Zona de perigo (borda) ──────────────────────────────
    float edgeFade = smoothstep(0.55, 1.0, normDist);
    float innerGlow = smoothstep(0.0, 0.3, normDist);

    // Pulso na borda (mais intenso perto da borda)
    float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + dist * 2.0);
    float fastPulse = 0.5 + 0.5 * sin(uTime * 6.0 + dist * 4.0);

    // ── Paleta: ciano/roxo (seguro) → vermelho (perigo) ────
    vec3 safeColor   = vec3(0.01, 0.04, 0.06);     // base escura com toque de ciano
    vec3 gridColor   = vec3(0.0,  0.35, 0.5);      // ciano brilhante para grid
    vec3 accentColor = vec3(0.15, 0.0,  0.3);      // roxo para sub-grid

    vec3 dangerColor = vec3(0.4,  0.02, 0.0);      // vermelho escuro base
    vec3 dangerGrid  = vec3(1.0,  0.15, 0.0);      // vermelho brilhante grid

    vec3 baseCol = mix(safeColor, dangerColor, edgeFade);
    vec3 lineCol = mix(gridColor, dangerGrid,  edgeFade);
    vec3 subCol  = mix(accentColor, dangerGrid * 0.5, edgeFade);

    // Composição do grid
    vec3 color = baseCol;
    color = mix(color, subCol,  gridSub * (0.5 + 0.5 * innerGlow));
    color = mix(color, lineCol, gridMain * (0.6 + 0.4 * pulse * edgeFade));

    // ── Anel de borda pulsante ──────────────────────────────
    float edgeRing = smoothstep(uArenaRadius - 0.5, uArenaRadius - 0.1, dist)
                   * (1.0 - smoothstep(uArenaRadius - 0.1, uArenaRadius + 0.2, dist));
    color += dangerGrid * edgeRing * (0.5 + 0.5 * pulse) * 0.8;

    // ── Brilho central sutil (centro da arena) ──────────────
    float centerGlow = 1.0 - smoothstep(0.0, 0.25, normDist);
    color += vec3(0.02, 0.06, 0.1) * centerGlow;

    // ── Efeito de "energia" correndo pelo grid ──────────────
    float energy = sin(uv.x * 3.0 + uTime * 1.5) * sin(uv.y * 3.0 - uTime * 1.2);
    energy = energy * 0.5 + 0.5;
    energy = smoothstep(0.6, 0.9, energy) * 0.08 * (1.0 - edgeFade);
    color += gridColor * energy;

    // ── Fora da arena = transparência total ────────────────
    float arenaAlpha = 1.0 - smoothstep(uArenaRadius - 0.1, uArenaRadius + 0.3, dist);

    // ── Leve especularidade (efeito vidro) ──────────────────
    // Simula reflexo especular simples usando distância
    float specFake = pow(1.0 - normDist, 4.0) * 0.08;
    color += vec3(specFake);

    gl_FragColor = vec4(color, arenaAlpha);
}
