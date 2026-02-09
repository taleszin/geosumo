/**
 * EntityRenderer.js — Renderiza lutadores customizados em 3D.
 *
 * FACES em TODAS AS DIREÇÕES: olhos e boca são desenhados
 * na frente, trás, esquerda e direita do corpo.
 *
 * EXPRESSÕES DINÂMICAS: o rosto muda conforme o estado:
 *   - Normal: rosto padrão escolhido
 *   - Attack: olhos furiosos + boca aberta (grito)
 *   - Hurt:   olhos X + boca torcida (dor)
 *   - Stunned: olhos em espiral + boca ondulada (desnorteado)
 *   - Charging: olhos concentrados (pupilas pequenas) + boca cerrada
 */
import { mat4 } from 'gl-matrix';
import { clamp } from '../engine/MathUtils.js';
import { mvPush, mvPop, getMV, drawCube } from '../engine/Renderer.js';
import { getShape, getColor, getEyes, getMouth } from '../data/Customization.js';
import { EXPR_NORMAL, EXPR_ATTACK, EXPR_HURT, EXPR_STUNNED, EXPR_CHARGING } from './Entity.js';
import { getDialog } from './DialogSystem.js';

// ═══════════════════════════════════════════════════════════════════
// MAIN: Desenha entidade completa
// ═══════════════════════════════════════════════════════════════════

export function drawEntity(ent, gameTime) {
    const mv = getMV();
    const custom = ent.custom;
    const shape  = getShape(custom.shape);
    const palette = getColor(custom.color);

    mvPush();
    mat4.translate(mv, mv, ent.pos);
    mat4.rotate(mv, mv, ent.rot[1], [0, 1, 0]);
    mat4.rotate(mv, mv, ent.rot[0], [1, 0, 0]);
    mat4.rotate(mv, mv, ent.rot[2], [0, 0, 1]);

    // ── 1. CORPO ─────────────────────────────────────────
    const basePulse = 1.0 + Math.sin(gameTime * 3.0) * 0.012;
    // Charge visual: corpo pulsa mais forte quando carregando
    const chargePulse = ent.isCharging ? (1.0 + ent.chargeAmount * 0.08 * Math.sin(gameTime * 15.0)) : 1.0;
    const s = ent.size * basePulse * chargePulse;
    const bs = shape.bodyScale;

    if (shape.bodyRotZ) {
        mvPush();
        mat4.rotate(mv, mv, shape.bodyRotZ, [0, 0, 1]);
        drawCube(ent.color, [s * bs[0], s * bs[1], s * bs[2]], ent.hitFlash, 1.3);
        mvPop();
    } else {
        drawCube(ent.color, [s * bs[0], s * bs[1], s * bs[2]], ent.hitFlash, 1.3);
    }

    // ── 2. CHARGE AURA ─────────────────────────────────
    if (ent.isCharging && ent.chargeAmount > 0.3) {
        _drawChargeAura(ent, s, gameTime);
    }

    // ── 3. EXTRAS (spikes, decoração) ────────────────────
    if (shape.extras === 'spikes') {
        _drawSpikes(ent, s, gameTime);
    }

    // ── 4. ROSTO em TODAS AS FACES ──────────────────────
    _drawAllFaces(ent, s, palette, gameTime);

    // ── 5. BRAÇOS ────────────────────────────────────────
    const armOff = shape.armOffset || 0.9;
    _drawArm(ent, 'left',  -1, armOff);
    _drawArm(ent, 'right',  1, armOff);

    mvPop();
}

// ═══════════════════════════════════════════════════════════════════
// TODAS AS FACES — Rosto repetido em 4 direções
// ═══════════════════════════════════════════════════════════════════

/**
 * Desenha olhos e boca em todas as 4 faces do cubo.
 * Cada face recebe uma rotação Y diferente (0°, 90°, 180°, 270°).
 */
function _drawAllFaces(ent, s, palette, gameTime) {
    const mv = getMV();
    const faceRotations = [
        0,                     // frente  (+Z)
        Math.PI,               // trás    (-Z)
        Math.PI * 0.5,         // direita (+X)
       -Math.PI * 0.5,         // esquerda (-X)
    ];

    for (const rotY of faceRotations) {
        mvPush();
        mat4.rotate(mv, mv, rotY, [0, 1, 0]);
        _drawFace(ent, s, palette, gameTime);
        mvPop();
    }
}

/**
 * Desenha uma face completa (olhos + boca) virada para +Z.
 * O chamador rotaciona para a direção desejada.
 */
function _drawFace(ent, s, palette, gameTime) {
    const expr = ent.expression || EXPR_NORMAL;
    
    // SEMPRE renderiza olhos e boca (correção de bug)
    // Usa a expressão apropriada para cada estado
    switch (expr) {
        case EXPR_ATTACK:
            _drawEyesAttack(ent, s, palette, gameTime);
            _drawMouthAttack(ent, s, palette, gameTime);
            break;
        case EXPR_HURT:
            _drawEyesHurt(ent, s, palette, gameTime);
            _drawMouthHurt(ent, s, palette, gameTime);
            break;
        case EXPR_STUNNED:
            _drawEyesStunned(ent, s, palette, gameTime);
            _drawMouthStunned(ent, s, palette, gameTime);
            break;
        case EXPR_CHARGING:
            _drawEyesNormal(ent, s, palette, gameTime);
            _drawMouthNormal(ent, s, palette, gameTime);
            _drawChargeOverlay(ent, s, palette, gameTime);
            break;
        case EXPR_NORMAL:
        default:
            _drawEyesNormal(ent, s, palette, gameTime);
            _drawMouthNormal(ent, s, palette, gameTime);
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════
// NORMAL EYES — Do sistema de customização
// ═══════════════════════════════════════════════════════════════════

function _drawEyesNormal(ent, s, palette, gameTime) {
    const mv = getMV();
    const eyeType = getEyes(ent.custom.eyes);
    const eyeColor = palette.eye;
    const cubes = eyeType.build(s, eyeColor);

    const breathY = Math.sin(gameTime * 2.0) * s * 0.01;

    cubes.forEach(c => {
        mvPush();
        mat4.translate(mv, mv, [c.off[0], c.off[1] + breathY, c.off[2]]);
        drawCube(c.col, c.sc, 0, 2.0);
        mvPop();
    });
}

// ═══════════════════════════════════════════════════════════════════
// NORMAL MOUTH — Do sistema de customização
// ═══════════════════════════════════════════════════════════════════

function _drawMouthNormal(ent, s, palette, _gameTime) {
    const mv = getMV();
    const mouthType = getMouth(ent.custom.mouth);
    const mouthColor = palette.mouth;
    const cubes = mouthType.build(s, mouthColor);

    cubes.forEach(c => {
        mvPush();
        mat4.translate(mv, mv, c.off);
        drawCube(c.col, c.sc, 0, 1.5);
        mvPop();
    });
}

// ═══════════════════════════════════════════════════════════════════
// ATTACK EXPRESSION — Olhos furiosos + boca gritando
// ═══════════════════════════════════════════════════════════════════

function _drawEyesAttack(ent, s, palette, gameTime) {
    const mv = getMV();
    const eyeColor = palette.eye;
    const sp = s * 0.30;
    const y  = s * 0.28;
    const z  = s * 0.97;
    const r  = s * 0.18;

    // Olhos maiores e angulares (furiosos)
    // Sobrancelha raivosa (linha inclinada acima de cada olho)
    const shake = Math.sin(gameTime * 20) * s * 0.01;

    // Olho esquerdo
    mvPush();
    mat4.translate(mv, mv, [-sp + shake, y, z]);
    drawCube(eyeColor, [r, r * 0.85, s * 0.04], 0, 3.0);
    mvPop();
    // Pupila contraída
    mvPush();
    mat4.translate(mv, mv, [-sp + shake, y, z + s * 0.03]);
    drawCube([0, 0, 0, 1], [r * 0.35, r * 0.35, s * 0.03], 0, 1.0);
    mvPop();
    // Sobrancelha esquerda (inclinada para baixo no centro) /
    mvPush();
    mat4.translate(mv, mv, [-sp + shake, y + r * 1.1, z]);
    mat4.rotate(mv, mv, -0.35, [0, 0, 1]);
    drawCube(palette.mouth, [r * 1.1, s * 0.035, s * 0.04], 0, 2.5);
    mvPop();

    // Olho direito
    mvPush();
    mat4.translate(mv, mv, [sp + shake, y, z]);
    drawCube(eyeColor, [r, r * 0.85, s * 0.04], 0, 3.0);
    mvPop();
    mvPush();
    mat4.translate(mv, mv, [sp + shake, y, z + s * 0.03]);
    drawCube([0, 0, 0, 1], [r * 0.35, r * 0.35, s * 0.03], 0, 1.0);
    mvPop();
    // Sobrancelha direita \
    mvPush();
    mat4.translate(mv, mv, [sp + shake, y + r * 1.1, z]);
    mat4.rotate(mv, mv, 0.35, [0, 0, 1]);
    drawCube(palette.mouth, [r * 1.1, s * 0.035, s * 0.04], 0, 2.5);
    mvPop();
}

function _drawMouthAttack(ent, s, palette, gameTime) {
    const mv = getMV();
    const col = palette.mouth;
    const y = s * -0.22;
    const z = s * 0.97;
    const openAmount = 0.6 + 0.15 * Math.sin(gameTime * 12.0);

    // Boca grande aberta (retângulo)
    mvPush();
    mat4.translate(mv, mv, [0, y, z]);
    drawCube(col, [s * 0.2, s * 0.1 * openAmount, s * 0.04], 0, 2.5);
    mvPop();
    // Interior escuro
    mvPush();
    mat4.translate(mv, mv, [0, y, z + s * 0.02]);
    drawCube([0, 0, 0, 1], [s * 0.14, s * 0.06 * openAmount, s * 0.03], 0, 1.0);
    mvPop();
}

// ═══════════════════════════════════════════════════════════════════
// HURT EXPRESSION — Olhos X + boca "au!"
// ═══════════════════════════════════════════════════════════════════

function _drawEyesHurt(ent, s, palette, gameTime) {
    const mv = getMV();
    const col = palette.eye;
    const sp = s * 0.30;
    const y  = s * 0.28;
    const z  = s * 0.97;
    const p  = s * 0.05;
    const flash = 0.5 + 0.5 * Math.sin(gameTime * 18.0);

    // Olhos "X" — duas linhas cruzadas por olho
    [-sp, sp].forEach(ex => {
        // Diagonal \
        mvPush();
        mat4.translate(mv, mv, [ex, y, z]);
        mat4.rotate(mv, mv, 0.78, [0, 0, 1]); // 45°
        drawCube(col, [s * 0.14, p * 0.8, s * 0.03], 0, 2.0 + flash);
        mvPop();
        // Diagonal /
        mvPush();
        mat4.translate(mv, mv, [ex, y, z]);
        mat4.rotate(mv, mv, -0.78, [0, 0, 1]);
        drawCube(col, [s * 0.14, p * 0.8, s * 0.03], 0, 2.0 + flash);
        mvPop();
    });
}

function _drawMouthHurt(ent, s, palette, _gameTime) {
    const mv = getMV();
    const col = palette.mouth;
    const y = s * -0.22;
    const z = s * 0.97;

    // Boca torcida / ondulada (zigue-zague)
    const p = s * 0.04;
    const points = [
        [-p * 3, y + p * 0.5],
        [-p * 1.5, y - p * 0.6],
        [0, y + p * 0.3],
        [p * 1.5, y - p * 0.6],
        [p * 3, y + p * 0.5],
    ];
    points.forEach(([px, py]) => {
        mvPush();
        mat4.translate(mv, mv, [px, py, z]);
        drawCube(col, [p, p * 0.5, s * 0.03], 0, 1.8);
        mvPop();
    });
}

// ═══════════════════════════════════════════════════════════════════
// STUNNED EXPRESSION — Olhos espiral + boca ondulada
// ═══════════════════════════════════════════════════════════════════

function _drawEyesStunned(ent, s, palette, gameTime) {
    const mv = getMV();
    const col = palette.eye;
    const sp = s * 0.30;
    const y  = s * 0.28;
    const z  = s * 0.97;

    // Olhos em espiral — representados como cubos girando
    const spin = gameTime * 6.0; // gira rápido
    const r = s * 0.13;

    [-sp, sp].forEach((ex, idx) => {
        // Anel externo (4 cubos orbitando)
        for (let i = 0; i < 4; i++) {
            const angle = spin + i * (Math.PI / 2) + (idx * 0.5);
            const ox = Math.cos(angle) * r * 0.7;
            const oy = Math.sin(angle) * r * 0.7;
            mvPush();
            mat4.translate(mv, mv, [ex + ox, y + oy, z]);
            drawCube(col, [s * 0.04, s * 0.04, s * 0.03], 0, 2.5);
            mvPop();
        }
        // Centro
        mvPush();
        mat4.translate(mv, mv, [ex, y, z + s * 0.02]);
        drawCube([0, 0, 0, 1], [s * 0.04, s * 0.04, s * 0.03], 0, 1.0);
        mvPop();
    });

    // Estrelinhas/passarinhos voando ao redor da cabeça
    _drawStars(ent, s, palette, gameTime);
}

function _drawStars(ent, s, palette, gameTime) {
    const mv = getMV();
    const starY = s * 0.7;
    const starR = s * 0.6;
    const starCol = [1, 1, 0.3, 1]; // amarelo brilhante

    for (let i = 0; i < 3; i++) {
        const angle = gameTime * 3.0 + i * (Math.PI * 2 / 3);
        const sx = Math.cos(angle) * starR;
        const sz = Math.sin(angle) * starR;
        const bob = Math.sin(gameTime * 5.0 + i) * s * 0.05;
        mvPush();
        mat4.translate(mv, mv, [sx, starY + bob, sz]);
        drawCube(starCol, [s * 0.05, s * 0.05, s * 0.05], 0, 3.0);
        mvPop();
    }
}

function _drawMouthStunned(ent, s, palette, gameTime) {
    const mv = getMV();
    const col = palette.mouth;
    const y = s * -0.22;
    const z = s * 0.97;

    // Boca ondulada ~ (onda senoidal)
    const p = s * 0.04;
    for (let i = -3; i <= 3; i++) {
        const wave = Math.sin(gameTime * 8.0 + i * 0.8) * p * 0.6;
        mvPush();
        mat4.translate(mv, mv, [i * p * 1.3, y + wave, z]);
        drawCube(col, [p * 0.8, p * 0.4, s * 0.03], 0, 1.5);
        mvPop();
    }
}

// ═══════════════════════════════════════════════════════════════════
// CHARGING OVERLAY — Sobrancelhas concentradas sobre olhos normais
// ═══════════════════════════════════════════════════════════════════

function _drawChargeOverlay(ent, s, palette, gameTime) {
    const mv = getMV();
    const sp = s * 0.30;
    const y  = s * 0.28;
    const z  = s * 0.98;
    const r  = s * 0.15;

    const intensity = ent.chargeAmount || 0;
    const glow = 1.5 + intensity * 3.0;
    const col = palette.mouth;

    // Sobrancelhas cerradas (V shape)
    mvPush();
    mat4.translate(mv, mv, [-sp, y + r * 1.0, z]);
    mat4.rotate(mv, mv, -0.25 * intensity, [0, 0, 1]);
    drawCube(col, [r * 0.9 * intensity, s * 0.03, s * 0.04], 0, glow);
    mvPop();

    mvPush();
    mat4.translate(mv, mv, [sp, y + r * 1.0, z]);
    mat4.rotate(mv, mv, 0.25 * intensity, [0, 0, 1]);
    drawCube(col, [r * 0.9 * intensity, s * 0.03, s * 0.04], 0, glow);
    mvPop();
}

// ═══════════════════════════════════════════════════════════════════
// CHARGE AURA — Efeito visual ao redor do corpo quando carregando
// ═══════════════════════════════════════════════════════════════════

function _drawChargeAura(ent, s, gameTime) {
    const mv = getMV();
    const charge = ent.chargeAmount;
    const numParticles = Math.floor(charge * 8);
    const col = ent.color.slice();
    col[3] = 0.4 + charge * 0.3;

    for (let i = 0; i < numParticles; i++) {
        const angle = gameTime * 4.0 + i * (Math.PI * 2 / numParticles);
        const radius = s * (1.2 + charge * 0.5);
        const rise = (gameTime * 2.0 + i) % 1.0;
        const px = Math.cos(angle) * radius;
        const pz = Math.sin(angle) * radius;
        const py = (rise - 0.5) * s * 2.0;
        const sz = s * 0.06 * (1.0 + charge);

        mvPush();
        mat4.translate(mv, mv, [px, py, pz]);
        drawCube(col, [sz, sz, sz], 0, 2.0 + charge * 3.0);
        mvPop();
    }
}

// ═══════════════════════════════════════════════════════════════════
// SPIKES — Extensões para forma "estrela"
// ═══════════════════════════════════════════════════════════════════

function _drawSpikes(ent, s, gameTime) {
    const mv = getMV();
    const col = ent.color;
    const spikeLen = s * 0.5;
    const spikeW   = s * 0.15;
    const glow = 0.8 + 0.2 * Math.sin(gameTime * 4.0);

    const positions = [
        [s + spikeLen * 0.5, 0, 0],
        [-s - spikeLen * 0.5, 0, 0],
        [0, s + spikeLen * 0.5, 0],
        [0, -s - spikeLen * 0.5, 0],
    ];
    const scales = [
        [spikeLen, spikeW, spikeW],
        [spikeLen, spikeW, spikeW],
        [spikeW, spikeLen, spikeW],
        [spikeW, spikeLen, spikeW],
    ];

    positions.forEach((p, i) => {
        mvPush();
        mat4.translate(mv, mv, p);
        const spikeCol = [col[0] * 0.8 + 0.2, col[1] * 0.8 + 0.2, col[2] * 0.8 + 0.2, col[3]];
        drawCube(spikeCol, scales[i], 0, 1.5 * glow);
        mvPop();
    });
}

// ═══════════════════════════════════════════════════════════════════
// BRAÇOS — Articulados com punho
// ═══════════════════════════════════════════════════════════════════

function _drawArm(ent, side, dir, armOffset) {
    const mv  = getMV();
    const arm = ent.arms[side];

    mvPush();
    mat4.translate(mv, mv, [dir * (ent.size * armOffset), 0, 0]);
    mat4.rotate(mv, mv, arm.currentRot[1], [0, 1, 0]);
    mat4.rotate(mv, mv, arm.currentRot[0], [1, 0, 0]);

    const ext = arm.currentExt;
    mat4.translate(mv, mv, [0, 0, ext]);

    const speed = Math.abs(ext - arm.prevExt) * 10;
    const neon  = 1.0 + clamp(speed, 0, 3);

    drawCube(arm.color, [0.25, 0.25, ext], 0, neon);

    // Punho (brilhante e maior quando soco)
    mvPush();
    const punchScale = 0.35 + clamp(speed * 0.15, 0, 0.2);
    mat4.translate(mv, mv, [0, 0, ext * 0.8]);
    const pc = [
        Math.min(1, arm.color[0] + 0.3),
        Math.min(1, arm.color[1] + 0.3),
        Math.min(1, arm.color[2] + 0.3),
        1
    ];
    drawCube(pc, [punchScale, punchScale, punchScale], 0, neon * 1.5);
    mvPop();

    mvPop();
}

// ═══════════════════════════════════════════════════════════════════
// PREVIEW — Para tela de customização (rotação lenta)
// ═══════════════════════════════════════════════════════════════════

export function drawEntityPreview(ent, gameTime) {
    const mv = getMV();

    mvPush();
    mat4.translate(mv, mv, ent.pos);
    mat4.rotate(mv, mv, gameTime * 0.5, [0, 1, 0]);
    mat4.rotate(mv, mv, 0.15, [1, 0, 0]);

    const custom = ent.custom;
    const shape  = getShape(custom.shape);
    const palette = getColor(custom.color);

    const pulse = 1.0 + Math.sin(gameTime * 2.0) * 0.02;
    const s = ent.size * pulse;
    const bs = shape.bodyScale;

    if (shape.bodyRotZ) {
        mvPush();
        mat4.rotate(mv, mv, shape.bodyRotZ, [0, 0, 1]);
        drawCube(ent.color, [s * bs[0], s * bs[1], s * bs[2]], 0, 1.5);
        mvPop();
    } else {
        drawCube(ent.color, [s * bs[0], s * bs[1], s * bs[2]], 0, 1.5);
    }

    if (shape.extras === 'spikes') {
        _drawSpikes(ent, s, gameTime);
    }

    // Preview mostra rosto em todas as faces (como será in-game)
    _drawAllFaces(ent, s, palette, gameTime);

    const armOff = shape.armOffset || 0.9;
    _drawArm(ent, 'left', -1, armOff);
    _drawArm(ent, 'right', 1, armOff);

    mvPop();
}
