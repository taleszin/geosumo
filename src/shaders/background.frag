precision mediump float;

varying vec2 vUV;
uniform float uTime;
uniform vec2  uResolution;

// ── Hash para estrelas ──────────────────────────────────────
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// ── Noise suave ─────────────────────────────────────────────
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main(void) {
    vec2 uv = vUV;
    float aspect = uResolution.x / uResolution.y;

    // ── 1. Gradiente vertical: Roxo Profundo → Preto ────────
    vec3 topColor    = vec3(0.01, 0.01, 0.03);       // quase preto
    vec3 midColor    = vec3(0.06, 0.01, 0.12);       // roxo profundo
    vec3 bottomColor = vec3(0.02, 0.005, 0.06);      // roxo escuro

    // Gradiente suave com mais roxo no horizonte (meio)
    float horizon = smoothstep(0.0, 0.45, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y));
    vec3 gradient = mix(bottomColor, topColor, uv.y);
    gradient = mix(gradient, midColor, horizon * 0.7);

    // Fluxo de nebulosa sutil
    float nebula = noise(uv * 3.0 + vec2(uTime * 0.01, uTime * 0.005)) * 0.5
                 + noise(uv * 6.0 - vec2(uTime * 0.008, uTime * 0.012)) * 0.25;
    gradient += vec3(0.04, 0.0, 0.08) * nebula * horizon;

    // ── 2. Estrelas cintilantes ─────────────────────────────
    vec2 starUV = uv * vec2(aspect, 1.0); // corrigir aspect ratio

    float stars = 0.0;
    // Camada 1: estrelas grandes esparsas
    {
        vec2 grid = floor(starUV * 40.0);
        float h = hash21(grid);
        vec2 off = vec2(hash21(grid + 0.1), hash21(grid + 0.2));
        vec2 center = (grid + 0.3 + off * 0.4) / 40.0;
        float d = length(starUV - center) * 40.0;
        float bright = step(0.92, h);
        float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 50.0);
        stars += bright * smoothstep(0.5, 0.0, d) * twinkle;
    }
    // Camada 2: estrelas pequenas densas
    {
        vec2 grid = floor(starUV * 120.0);
        float h = hash21(grid + 100.0);
        vec2 off = vec2(hash21(grid + 100.1), hash21(grid + 100.2));
        vec2 center = (grid + 0.2 + off * 0.6) / 120.0;
        float d = length(starUV - center) * 120.0;
        float bright = step(0.95, h);
        float twinkle = 0.5 + 0.5 * sin(uTime * (2.0 + h * 4.0) + h * 80.0);
        stars += bright * smoothstep(0.4, 0.0, d) * twinkle * 0.5;
    }
    // Estrelas mais visíveis no topo, menos perto do horizonte
    stars *= smoothstep(0.2, 0.6, uv.y) * 0.8 + 0.2;

    // ── 3. Grid distante em parallax ────────────────────────
    // Grid de perspectiva no "chão distante" (abaixo do horizonte)
    float gridIntensity = 0.0;
    if (uv.y < 0.42) {
        float depth = 1.0 / max(0.42 - uv.y, 0.01);
        vec2 gridUV = vec2((uv.x - 0.5) * aspect * depth, depth);
        gridUV.y -= uTime * 0.3; // scroll lento

        vec2 g = abs(fract(gridUV * 0.15) - 0.5);
        float lineX = smoothstep(0.0, 0.03 * depth * 0.1, g.x);
        float lineY = smoothstep(0.0, 0.03 * depth * 0.1, g.y);
        float grid = 1.0 - min(lineX, lineY);

        float fadeDist = smoothstep(3.0, 20.0, depth);
        float fadeEdge = smoothstep(0.0, 0.1, 0.42 - uv.y);
        gridIntensity = grid * (1.0 - fadeDist) * fadeEdge * 0.25;
    }
    vec3 gridColor = vec3(0.15, 0.0, 0.35) * gridIntensity;

    // ── Composição final ────────────────────────────────────
    vec3 color = gradient + vec3(stars) * vec3(0.8, 0.85, 1.0) + gridColor;

    // Vignette sutil
    float vig = 1.0 - length((uv - 0.5) * 1.4);
    vig = smoothstep(0.0, 0.7, vig);
    color *= 0.7 + 0.3 * vig;

    gl_FragColor = vec4(color, 1.0);
}
