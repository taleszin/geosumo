precision mediump float;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec2 vTexCoord;

uniform float uTime;
uniform float uArenaRadius;
uniform vec3  uPlayerPos;   // para reação de proximidade
uniform vec3  uEyePos;      // posição da câmera no world space

void main(void) {
    // ── Fresnel Effect ──────────────────────────────────────
    // Mais visível nas bordas do cilindro, transparente de frente
    vec3 viewDir = normalize(uEyePos - vWorldPos);
    vec3 normal  = normalize(vNormal);
    float fresnel = 1.0 - abs(dot(normal, viewDir));
    fresnel = pow(fresnel, 1.8);

    // ── Scanlines animadas (sobem verticalmente) ────────────
    float scanSpeed = uTime * 1.5;
    float scanFreq  = 12.0;
    float scanline  = sin((vTexCoord.y * scanFreq - scanSpeed) * 6.2831853) * 0.5 + 0.5;
    scanline = smoothstep(0.3, 0.7, scanline);

    // Scanlines secundárias (mais finas, mais rápidas)
    float scan2 = sin((vTexCoord.y * scanFreq * 3.0 - uTime * 3.0) * 6.2831853) * 0.5 + 0.5;
    scan2 = smoothstep(0.6, 0.8, scan2) * 0.3;

    // ── Proximidade do jogador → reação ─────────────────────
    // Distância horizontal do jogador até este ponto da barreira
    vec2 playerDir = uPlayerPos.xz - vWorldPos.xz;
    float playerDist = length(playerDir);
    float proximity = smoothstep(6.0, 0.5, playerDist);

    // ── Cor base ────────────────────────────────────────────
    // Ciano normal → vermelho intenso quando jogador está perto
    vec3 baseColor  = vec3(0.0, 0.6, 0.8);     // ciano
    vec3 warnColor  = vec3(1.0, 0.15, 0.05);   // vermelho alarme
    vec3 color = mix(baseColor, warnColor, proximity);

    // Adicionar energia/brilho
    vec3 glowColor = mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.3, 0.1), proximity);

    // ── Hexagonal pattern (tech feel) ───────────────────────
    float hexScale = 4.0;
    vec2 hexUV = vTexCoord * vec2(hexScale * 6.2831853, hexScale);
    float hex = abs(sin(hexUV.x) * cos(hexUV.y * 1.732));
    hex = smoothstep(0.1, 0.15, hex) * 0.15;

    // ── Composição ──────────────────────────────────────────
    float scanMix = scanline * 0.5 + scan2 + hex;
    float alpha = fresnel * (0.15 + scanMix * 0.35 + proximity * 0.4);

    // Brilho pulsante suave
    float pulse = 0.85 + 0.15 * sin(uTime * 2.0 + vTexCoord.x * 6.2831853 * 3.0);
    alpha *= pulse;

    // Glow aditivo na borda
    color = color * (0.6 + scanMix * 0.4) + glowColor * fresnel * 0.3;

    // Fade out no topo e no fundo do cilindro
    float heightFade = smoothstep(0.0, 0.1, vTexCoord.y) * smoothstep(1.0, 0.85, vTexCoord.y);
    alpha *= heightFade;

    // Clamp
    alpha = clamp(alpha, 0.0, 0.85);

    gl_FragColor = vec4(color, alpha);
}
