// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMIZATION.JS — Sistema de Personalização do Lutador GEO SUMO
// ═══════════════════════════════════════════════════════════════════════════
//
// Adaptado do universo GEOLIFE: materiais, formas, rostos e paletas
// traduzidos para cubos 3D WebGL com estética neon-voxel.
//
// Cada lutador é definido por 4 eixos de personalização:
//   ◈ FORMA   — Proporções do corpo (cubo, torre, tanque, losango…)
//   ◆ COR     — Paleta neon que colore corpo, glow, braços
//   ◉ OLHOS   — Arranjos de micro-cubos no rosto
//   ◎ BOCA    — Padrões de micro-cubos expressivos
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// FORMAS DO CORPO (adaptadas de shapes.js)
// Cada forma define proporções [x, y, z] do cubo base
// ═══════════════════════════════════════════════════════════════════

export const BODY_SHAPES = [
    {
        id: 'cube',
        name: 'Cubo',
        icon: '■',
        desc: 'Forma sólida e equilibrada',
        bodyScale: [1.0, 1.0, 1.0],
        armOffset: 0.9,
    },
    {
        id: 'tower',
        name: 'Torre',
        icon: '▮',
        desc: 'Alto e imponente, domina o campo',
        bodyScale: [0.72, 1.45, 0.72],
        armOffset: 0.68,
    },
    {
        id: 'tank',
        name: 'Tanque',
        icon: '▬',
        desc: 'Largo e pesado, difícil de empurrar',
        bodyScale: [1.35, 0.78, 1.1],
        armOffset: 1.3,
    },
    {
        id: 'diamond',
        name: 'Losango',
        icon: '◆',
        desc: 'Elegante e angular, corta o vento',
        bodyScale: [0.85, 1.25, 0.85],
        bodyRotZ: Math.PI / 4,
        armOffset: 0.6,
    },
    {
        id: 'flat',
        name: 'Disco',
        icon: '▂',
        desc: 'Baixo e estável como rocha',
        bodyScale: [1.3, 0.50, 1.3],
        armOffset: 1.25,
    },
    {
        id: 'pillar',
        name: 'Pilar',
        icon: '│',
        desc: 'Esbelto e preciso como lâmina',
        bodyScale: [0.55, 1.65, 0.55],
        armOffset: 0.52,
    },
    {
        id: 'star',
        name: 'Estrela',
        icon: '★',
        desc: 'Forma especial com extensões brilhantes',
        bodyScale: [1.0, 1.0, 1.0],
        armOffset: 0.9,
        extras: 'spikes', // EntityRenderer desenha cubos extras
    },
    {
        id: 'hexprism',
        name: 'Prisma',
        icon: '⬡',
        desc: 'Harmonia geométrica perfeita',
        bodyScale: [1.1, 0.9, 0.9],
        armOffset: 1.05,
    },
];

// ═══════════════════════════════════════════════════════════════════
// PALETAS NEON (adaptadas de materials.js + faces.js COLORS)
// Cada paleta define cor do corpo, glow, braços e accents
// ═══════════════════════════════════════════════════════════════════

export const NEON_COLORS = [
    {
        id: 'cyan',
        name: 'Ciano',
        icon: '●',
        material: 'aetherium',
        body:     [0.10, 0.85, 1.00, 1.00],
        armL:     [0.06, 0.52, 0.80, 1.00],
        armR:     [0.30, 0.60, 1.00, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [0.00, 1.00, 1.00, 1.00],
        glow:     [0.00, 0.80, 1.00],
    },
    {
        id: 'magenta',
        name: 'Magenta',
        icon: '●',
        material: 'crystaline',
        body:     [1.00, 0.10, 0.85, 1.00],
        armL:     [0.80, 0.06, 0.52, 1.00],
        armR:     [1.00, 0.30, 0.60, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [1.00, 0.00, 1.00, 1.00],
        glow:     [1.00, 0.00, 0.80],
    },
    {
        id: 'green',
        name: 'Verde Neon',
        icon: '●',
        material: 'verdantia',
        body:     [0.10, 1.00, 0.40, 1.00],
        armL:     [0.06, 0.70, 0.25, 1.00],
        armR:     [0.30, 1.00, 0.55, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [0.00, 1.00, 0.40, 1.00],
        glow:     [0.00, 1.00, 0.30],
    },
    {
        id: 'yellow',
        name: 'Amarelo',
        icon: '●',
        material: 'tempestium',
        body:     [1.00, 1.00, 0.10, 1.00],
        armL:     [0.80, 0.75, 0.06, 1.00],
        armR:     [1.00, 0.90, 0.30, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [1.00, 1.00, 0.00, 1.00],
        glow:     [1.00, 1.00, 0.00],
    },
    {
        id: 'orange',
        name: 'Laranja',
        icon: '●',
        material: 'ignis',
        body:     [1.00, 0.50, 0.08, 1.00],
        armL:     [0.85, 0.35, 0.04, 1.00],
        armR:     [1.00, 0.65, 0.20, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [1.00, 0.40, 0.00, 1.00],
        glow:     [1.00, 0.40, 0.00],
    },
    {
        id: 'pink',
        name: 'Rosa',
        icon: '●',
        material: 'crystaline',
        body:     [1.00, 0.40, 0.70, 1.00],
        armL:     [0.85, 0.25, 0.55, 1.00],
        armR:     [1.00, 0.55, 0.80, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [1.00, 0.40, 0.70, 1.00],
        glow:     [1.00, 0.30, 0.60],
    },
    {
        id: 'purple',
        name: 'Roxo',
        icon: '●',
        material: 'umbralith',
        body:     [0.70, 0.10, 1.00, 1.00],
        armL:     [0.50, 0.06, 0.80, 1.00],
        armR:     [0.85, 0.30, 1.00, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [0.70, 0.00, 1.00, 1.00],
        glow:     [0.60, 0.00, 1.00],
    },
    {
        id: 'red',
        name: 'Vermelho',
        icon: '●',
        material: 'ignis',
        body:     [1.00, 0.15, 0.15, 1.00],
        armL:     [0.80, 0.08, 0.08, 1.00],
        armR:     [1.00, 0.30, 0.20, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [1.00, 0.10, 0.10, 1.00],
        glow:     [1.00, 0.05, 0.05],
    },
    {
        id: 'white',
        name: 'Branco',
        icon: '●',
        material: 'aetherium',
        body:     [0.90, 0.95, 1.00, 1.00],
        armL:     [0.70, 0.75, 0.82, 1.00],
        armR:     [0.95, 0.97, 1.00, 1.00],
        eye:      [0.20, 0.20, 0.20, 1.00], // Olhos escuros em corpo branco!
        mouth:    [0.80, 0.85, 0.90, 1.00],
        glow:     [0.80, 0.90, 1.00],
    },
    {
        id: 'lime',
        name: 'Lima',
        icon: '●',
        material: 'verdantia',
        body:     [0.65, 1.00, 0.08, 1.00],
        armL:     [0.45, 0.80, 0.04, 1.00],
        armR:     [0.75, 1.00, 0.25, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [0.60, 1.00, 0.00, 1.00],
        glow:     [0.50, 1.00, 0.00],
    },
    {
        id: 'teal',
        name: 'Turquesa',
        icon: '●',
        material: 'aetherium',
        body:     [0.05, 0.70, 0.70, 1.00],
        armL:     [0.03, 0.50, 0.52, 1.00],
        armR:     [0.15, 0.80, 0.75, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [0.00, 0.70, 0.70, 1.00],
        glow:     [0.00, 0.65, 0.65],
    },
    {
        id: 'gold',
        name: 'Dourado',
        icon: '●',
        material: 'ferrum',
        body:     [1.00, 0.84, 0.10, 1.00],
        armL:     [0.85, 0.68, 0.06, 1.00],
        armR:     [1.00, 0.90, 0.30, 1.00],
        eye:      [1.00, 1.00, 1.00, 1.00],
        mouth:    [1.00, 0.84, 0.00, 1.00],
        glow:     [1.00, 0.80, 0.10],
    },
];

// ═══════════════════════════════════════════════════════════════════
// TIPOS DE OLHOS (adaptados de faces.js EYES)
// Cada tipo define arranjos de micro-cubos na face frontal
// Retorna array de { offset: [x,y,z], scale: [sx,sy,sz], color }
// ═══════════════════════════════════════════════════════════════════

export const EYE_TYPES = [
    {
        id: 'circle',
        name: 'Redondos',
        icon: '◉',
        desc: 'Olhos redondos e expressivos',
        build: (s, col) => {
            const sp = s * 0.30;
            const y  = s * 0.28;
            const z  = s * 0.96;
            const r  = s * 0.17;
            return [
                // Branco exterior
                { off: [-sp, y, z], sc: [r, r, s*0.04], col: col },
                { off: [ sp, y, z], sc: [r, r, s*0.04], col: col },
                // Pupila escura
                { off: [-sp, y, z+s*0.03], sc: [r*0.5, r*0.5, s*0.03], col: [0,0,0,1] },
                { off: [ sp, y, z+s*0.03], sc: [r*0.5, r*0.5, s*0.03], col: [0,0,0,1] },
                // Brilho
                { off: [-sp+r*0.25, y+r*0.25, z+s*0.05], sc: [r*0.2, r*0.2, s*0.02], col: [1,1,1,1] },
                { off: [ sp+r*0.25, y+r*0.25, z+s*0.05], sc: [r*0.2, r*0.2, s*0.02], col: [1,1,1,1] },
            ];
        },
    },
    {
        id: 'dot',
        name: 'Pontos',
        icon: '•',
        desc: 'Olhos simples e fofos',
        build: (s, col) => {
            const sp = s * 0.28;
            const y  = s * 0.25;
            const z  = s * 0.97;
            const r  = s * 0.09;
            return [
                { off: [-sp, y, z], sc: [r, r, r], col: col },
                { off: [ sp, y, z], sc: [r, r, r], col: col },
            ];
        },
    },
    {
        id: 'pixel',
        name: 'Pixel',
        icon: '▪',
        desc: 'Olhos quadrados estilo 8-bit',
        build: (s, col) => {
            const sp = s * 0.30;
            const y  = s * 0.28;
            const z  = s * 0.96;
            const p  = s * 0.08; // tamanho do pixel
            const cubes = [];
            // Grade 2x2 por olho
            [-sp, sp].forEach(ex => {
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        cubes.push({
                            off: [ex + (dx-0.5)*p*2, y + (dy-0.5)*p*2, z],
                            sc: [p, p, s*0.04],
                            col: col,
                        });
                    }
                }
            });
            return cubes;
        },
    },
    {
        id: 'slit',
        name: 'Felinos',
        icon: '◗',
        desc: 'Olhos de gato, afiados e astutos',
        build: (s, col) => {
            const sp = s * 0.28;
            const y  = s * 0.28;
            const z  = s * 0.96;
            return [
                // Olho largo e fino
                { off: [-sp, y, z], sc: [s*0.18, s*0.06, s*0.04], col: col },
                { off: [ sp, y, z], sc: [s*0.18, s*0.06, s*0.04], col: col },
                // Pupila vertical (fenda)
                { off: [-sp, y, z+s*0.03], sc: [s*0.03, s*0.10, s*0.03], col: [0,0,0,1] },
                { off: [ sp, y, z+s*0.03], sc: [s*0.03, s*0.10, s*0.03], col: [0,0,0,1] },
            ];
        },
    },
    {
        id: 'cyber',
        name: 'Visor',
        icon: '⌐',
        desc: 'Visor cibernético horizontal',
        build: (s, col) => {
            const y = s * 0.28;
            const z = s * 0.96;
            return [
                // Barra longa horizontal (visor)
                { off: [0, y, z], sc: [s*0.65, s*0.08, s*0.04], col: col },
                // Linha brilhante central
                { off: [0, y, z+s*0.03], sc: [s*0.55, s*0.03, s*0.03], col: [1,1,1,0.9] },
            ];
        },
    },
    {
        id: 'cross',
        name: 'Cruz',
        icon: '✚',
        desc: 'Olhos em formato de mira',
        build: (s, col) => {
            const sp = s * 0.30;
            const y  = s * 0.28;
            const z  = s * 0.96;
            const p  = s * 0.05;
            const cubes = [];
            [-sp, sp].forEach(ex => {
                // Cruz: vertical + horizontal
                cubes.push({ off: [ex, y, z], sc: [p, s*0.16, s*0.03], col: col }); // |
                cubes.push({ off: [ex, y, z], sc: [s*0.16, p, s*0.03], col: col }); // —
                // Ponto central brilhante
                cubes.push({ off: [ex, y, z+s*0.03], sc: [p*0.8, p*0.8, s*0.02], col: [1,1,1,1] });
            });
            return cubes;
        },
    },
    {
        id: 'star',
        name: 'Estrela',
        icon: '✦',
        desc: 'Olhos brilhantes estilo anime',
        build: (s, col) => {
            const sp = s * 0.28;
            const y  = s * 0.28;
            const z  = s * 0.96;
            const r  = s * 0.14;
            return [
                // Diamante principal (rotação implícita via scale)
                { off: [-sp, y, z], sc: [r, r*1.3, s*0.04], col: col },
                { off: [ sp, y, z], sc: [r, r*1.3, s*0.04], col: col },
                // Raios horizontais
                { off: [-sp, y, z], sc: [r*1.6, r*0.4, s*0.03], col: col },
                { off: [ sp, y, z], sc: [r*1.6, r*0.4, s*0.03], col: col },
                // Centro brilhante
                { off: [-sp, y, z+s*0.04], sc: [r*0.35, r*0.35, s*0.02], col: [1,1,1,1] },
                { off: [ sp, y, z+s*0.04], sc: [r*0.35, r*0.35, s*0.02], col: [1,1,1,1] },
            ];
        },
    },
    {
        id: 'void',
        name: 'Vazio',
        icon: '○',
        desc: 'Órbitas vazias com ponto de luz',
        build: (s, col) => {
            const sp = s * 0.28;
            const y  = s * 0.28;
            const z  = s * 0.94;
            const r  = s * 0.16;
            return [
                // Órbita escura (recuo no corpo)
                { off: [-sp, y, z], sc: [r, r, s*0.06], col: [0.02, 0.02, 0.05, 1] },
                { off: [ sp, y, z], sc: [r, r, s*0.06], col: [0.02, 0.02, 0.05, 1] },
                // Ponto de luz central
                { off: [-sp, y, z+s*0.06], sc: [r*0.25, r*0.25, s*0.03], col: col },
                { off: [ sp, y, z+s*0.06], sc: [r*0.25, r*0.25, s*0.03], col: col },
            ];
        },
    },
    {
        id: 'heart',
        name: 'Coração',
        icon: '♥',
        desc: 'Olhos apaixonados',
        build: (s, col) => {
            const sp = s * 0.28;
            const y  = s * 0.28;
            const z  = s * 0.96;
            const p  = s * 0.06;
            const cubes = [];
            // Coração feito de mini cubos (5 blocos por olho)
            [-sp, sp].forEach(ex => {
                cubes.push({ off: [ex-p, y+p, z], sc: [p, p, s*0.03], col: col });
                cubes.push({ off: [ex+p, y+p, z], sc: [p, p, s*0.03], col: col });
                cubes.push({ off: [ex-p*1.5, y, z], sc: [p, p, s*0.03], col: col });
                cubes.push({ off: [ex, y, z], sc: [p, p, s*0.03], col: col });
                cubes.push({ off: [ex+p*1.5, y, z], sc: [p, p, s*0.03], col: col });
                cubes.push({ off: [ex, y-p, z], sc: [p, p, s*0.03], col: col });
            });
            return cubes;
        },
    },
    {
        id: 'glitch',
        name: 'Glitch',
        icon: '▓',
        desc: 'Interferência digital caótica',
        build: (s, col) => {
            const sp = s * 0.28;
            const y  = s * 0.28;
            const z  = s * 0.96;
            const p  = s * 0.05;
            const cubes = [];
            // Blocos fragmentados irregulares
            [-sp, sp].forEach(ex => {
                cubes.push({ off: [ex-p*1.5, y+p, z], sc: [p*2.5, p*0.8, s*0.03], col: col });
                cubes.push({ off: [ex+p, y, z], sc: [p*1.5, p*0.8, s*0.03], col: col });
                cubes.push({ off: [ex-p*0.5, y-p, z], sc: [p*2, p*0.8, s*0.03], col: col });
                // Estática
                cubes.push({ off: [ex, y+p*0.5, z+s*0.03], sc: [p*0.5, p*0.5, s*0.02], col: [1,1,1,0.8] });
            });
            return cubes;
        },
    },
];

// ═══════════════════════════════════════════════════════════════════
// TIPOS DE BOCA (adaptados de faces.js MOUTHS)
// ═══════════════════════════════════════════════════════════════════

export const MOUTH_TYPES = [
    {
        id: 'simple',
        name: 'Simples',
        icon: '‿',
        desc: 'Sorriso básico e amigável',
        build: (s, col) => {
            const y = s * -0.22;
            const z = s * 0.96;
            const p = s * 0.06;
            return [
                // Linha curvada (3 blocos: centro baixo, laterais altos)
                { off: [-p*2, y+p*0.4, z], sc: [p, p*0.6, s*0.03], col: col },
                { off: [0, y, z], sc: [p, p*0.6, s*0.03], col: col },
                { off: [p*2, y+p*0.4, z], sc: [p, p*0.6, s*0.03], col: col },
            ];
        },
    },
    {
        id: 'cat',
        name: 'Gatinho',
        icon: 'ω',
        desc: 'Boquinha fofa de gato',
        build: (s, col) => {
            const y = s * -0.20;
            const z = s * 0.96;
            const p = s * 0.05;
            return [
                // W shape (5 pontos)
                { off: [-p*3, y, z], sc: [p, p*0.5, s*0.03], col: col },
                { off: [-p*1.2, y+p, z], sc: [p, p*0.5, s*0.03], col: col },
                { off: [0, y+p*0.3, z], sc: [p, p*0.5, s*0.03], col: col },
                { off: [p*1.2, y+p, z], sc: [p, p*0.5, s*0.03], col: col },
                { off: [p*3, y, z], sc: [p, p*0.5, s*0.03], col: col },
            ];
        },
    },
    {
        id: 'pixel',
        name: 'Pixel',
        icon: '▬',
        desc: 'Boca reta estilo 8-bit',
        build: (s, col) => {
            const y = s * -0.22;
            const z = s * 0.97;
            return [
                { off: [0, y, z], sc: [s*0.25, s*0.04, s*0.03], col: col },
            ];
        },
    },
    {
        id: 'saw',
        name: 'Serra',
        icon: '⋀⋀',
        desc: 'Dentes afiados de zigue-zague',
        build: (s, col) => {
            const y = s * -0.22;
            const z = s * 0.96;
            const p = s * 0.05;
            const cubes = [];
            for (let i = -3; i <= 3; i++) {
                cubes.push({
                    off: [i * p * 1.2, y + (i % 2 === 0 ? p*0.5 : -p*0.3), z],
                    sc: [p*0.8, p*0.6, s*0.03],
                    col: col,
                });
            }
            return cubes;
        },
    },
    {
        id: 'fangs',
        name: 'Presas',
        icon: '⚶',
        desc: 'Caninos pontiagudos de vampiro',
        build: (s, col) => {
            const y = s * -0.20;
            const z = s * 0.96;
            const p = s * 0.05;
            return [
                // Linha horizontal
                { off: [0, y, z], sc: [s*0.22, p*0.5, s*0.03], col: col },
                // Presas (2 cubos maiores nos cantos)
                { off: [-s*0.15, y-p*1.5, z], sc: [p*0.7, p*1.2, s*0.03], col: [1,1,1,1] },
                { off: [ s*0.15, y-p*1.5, z], sc: [p*0.7, p*1.2, s*0.03], col: [1,1,1,1] },
            ];
        },
    },
    {
        id: 'joker',
        name: 'Coringa',
        icon: '☺',
        desc: 'Sorriso maníaco e largo',
        build: (s, col) => {
            const y = s * -0.18;
            const z = s * 0.96;
            const p = s * 0.04;
            const cubes = [];
            // Sorriso largo curvando para cima nos cantos
            for (let i = -4; i <= 4; i++) {
                const curve = Math.abs(i) * Math.abs(i) * p * 0.12;
                cubes.push({
                    off: [i * p * 1.8, y - curve, z],
                    sc: [p*1.2, p*0.5, s*0.03],
                    col: col,
                });
            }
            return cubes;
        },
    },
    {
        id: 'robot',
        name: 'Robô',
        icon: '═',
        desc: 'Boca digital segmentada',
        build: (s, col) => {
            const y = s * -0.22;
            const z = s * 0.96;
            const p = s * 0.06;
            return [
                // Segmentos separados
                { off: [-p*2.5, y, z], sc: [p*0.8, p*0.5, s*0.03], col: col },
                { off: [-p*0.8, y, z], sc: [p*0.8, p*0.5, s*0.03], col: col },
                { off: [ p*0.8, y, z], sc: [p*0.8, p*0.5, s*0.03], col: col },
                { off: [ p*2.5, y, z], sc: [p*0.8, p*0.5, s*0.03], col: col },
            ];
        },
    },
    {
        id: 'uwu',
        name: 'UwU',
        icon: 'ᵕ',
        desc: 'Super fofo estilo UwU',
        build: (s, col) => {
            const y = s * -0.18;
            const z = s * 0.96;
            const p = s * 0.04;
            return [
                // Pequeno sorriso curvado
                { off: [-p*1.2, y+p*0.6, z], sc: [p, p*0.4, s*0.03], col: col },
                { off: [0, y, z], sc: [p*0.8, p*0.4, s*0.03], col: col },
                { off: [p*1.2, y+p*0.6, z], sc: [p, p*0.4, s*0.03], col: col },
            ];
        },
    },
    {
        id: 'bubble',
        name: 'Bolha',
        icon: '○',
        desc: 'Boquinha redonda de surpresa',
        build: (s, col) => {
            const y = s * -0.20;
            const z = s * 0.96;
            const r = s * 0.08;
            return [
                // Anel circular (representado por cubos formando O)
                { off: [0, y, z], sc: [r, r, s*0.04], col: col },
                { off: [0, y, z+s*0.03], sc: [r*0.5, r*0.5, s*0.03], col: [0,0,0,1] },
            ];
        },
    },
    {
        id: 'none',
        name: 'Sem Boca',
        icon: '—',
        desc: 'Misterioso e silencioso',
        build: () => [],
    },
];

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

export const SHAPE_IDS  = BODY_SHAPES.map(s => s.id);
export const COLOR_IDS  = NEON_COLORS.map(c => c.id);
export const EYE_IDS    = EYE_TYPES.map(e => e.id);
export const MOUTH_IDS  = MOUTH_TYPES.map(m => m.id);

export function getShape(id)  { return BODY_SHAPES.find(s => s.id === id) || BODY_SHAPES[0]; }
export function getColor(id)  { return NEON_COLORS.find(c => c.id === id) || NEON_COLORS[0]; }
export function getEyes(id)   { return EYE_TYPES.find(e => e.id === id) || EYE_TYPES[0]; }
export function getMouth(id)  { return MOUTH_TYPES.find(m => m.id === id) || MOUTH_TYPES[0]; }

/** Gera customização aleatória para inimigos */
export function randomCustomization() {
    return {
        shape: SHAPE_IDS[Math.floor(Math.random() * SHAPE_IDS.length)],
        color: COLOR_IDS[Math.floor(Math.random() * COLOR_IDS.length)],
        eyes:  EYE_IDS[Math.floor(Math.random() * EYE_IDS.length)],
        mouth: MOUTH_IDS[Math.floor(Math.random() * MOUTH_IDS.length)],
    };
}

/** Customização padrão do jogador */
export function defaultCustomization() {
    return {
        shape: 'cube',
        color: 'cyan',
        eyes:  'circle',
        mouth: 'simple',
    };
}

/** Próximo item em uma lista circular */
export function cycleOption(list, currentId, dir = 1) {
    const idx = list.indexOf(currentId);
    const next = (idx + dir + list.length) % list.length;
    return list[next];
}
