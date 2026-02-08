/**
 * Entity.js — Fábrica de entidades com sistema de personalização e EXPRESSÕES.
 *
 * Cada entidade carrega:
 *   - custom config (shape/color/eyes/mouth)
 *   - expression state (normal/attack/hurt/stunned/charging)
 *   - charge state (para tachi-ai e dash)
 */
import { GROUND_Y } from './Physics.js';
import { getColor, getShape, defaultCustomization, randomCustomization } from '../data/Customization.js';

// Sistema de dano estilo Smash Bros: começa em 0%, acumula até 999%+
export const START_DAMAGE = 0;

// ── Expression states ─────────────────────────────────────────
export const EXPR_NORMAL   = 0;
export const EXPR_ATTACK   = 1;   // olhos ferozes, boca aberta
export const EXPR_HURT     = 2;   // olhos X, boca torcida
export const EXPR_STUNNED  = 3;   // olhos em espiral, boca ondulada
export const EXPR_CHARGING = 4;   // olhos concentrados, boca cerrada


/**
 * Cria uma entidade de inimigo com customização aleatória.
 */
export function makeEnemyEntity(pos, size, custom) {
    const e = _buildEntity(pos, size, custom || randomCustomization());
    e.isEnemy = true;
    e.isPlayer = false;
    return e;
}

export function makePlayerEntity(pos, size, custom) {
    const p = _buildEntity(pos, size, custom || defaultCustomization());
    p.isPlayer = true;
    p.isEnemy = false;
    return p;
}

/**
 * Constrói a entidade com todas as propriedades derivadas da customização.
 */
function _buildEntity(pos, size, custom) {
    const palette = getColor(custom.color);
    const shape   = getShape(custom.shape);

    const bodyH = shape.bodyScale[1];
    const correctedPos = [pos[0], GROUND_Y + size * bodyH, pos[2]];

    const bodyColor = palette.body.slice();
    const baseColor = palette.body.slice();

    return {
        pos:       correctedPos,
        vel:       [0, 0, 0],
        rot:       [0, 0, 0],           // [pitch, yaw, roll]
        size,
        mass:      size * size * size,
        damage:    START_DAMAGE,        // % de dano acumulado (estilo Smash Bros)
        hitFlash:  0,
        color:     bodyColor,
        baseColor: baseColor,
        onGround:  true,

        // Customização
        custom:    { ...custom },

        // ── EXPRESSÕES ──────────────────────────────────
        expression:     EXPR_NORMAL,
        expressionTimer: 0,           // tempo restante da expressão (ms-frames)

        // ── CHARGE (dash/tachi-ai) ──────────────────────
        chargeAmount:   0,            // 0..1, quanto está carregando
        isCharging:     false,        // true = segurando carga
        chargeReady:    false,        // true = carga max, pode soltar
        chargeCooldown: 0,            // cooldown entre charges

        // Cooldowns de hit
        _hitCdL: 0,
        _hitCdR: 0,

        arms: {
            left:  _makeArm(palette, 'left'),
            right: _makeArm(palette, 'right'),
        },
    };
}

function _makeArm(palette, side) {
    const c = side === 'left' ? palette.armL.slice() : palette.armR.slice();
    return {
        currentExt: 0.8,
        targetExt:  0.8,
        currentRot: [0, 0],
        targetRot:  [0, 0],
        prevExt:    0.8,
        color:      c,
        // ── Propriedades para física de soco responsivo (player) ──
        _punching:  false,  // estado de soco ativo
        _punchVel:  0,      // velocidade explosiva do soco
    };
}

/**
 * Seta uma expressão temporária na entidade.
 * @param {object} ent
 * @param {number} expr - EXPR_* constant
 * @param {number} duration - duração em "frames" (~60fps)
 */
export function setExpression(ent, expr, duration) {
    // Expressões mais fortes sobrescrevem mais fracas, exceto stunned que sempre ganha
    if (expr === EXPR_STUNNED || ent.expression === EXPR_NORMAL || duration > ent.expressionTimer) {
        ent.expression = expr;
        ent.expressionTimer = duration;
    }
}

/**
 * Tick da expressão: decrementa timer, volta a NORMAL quando acabar.
 */
export function tickExpression(ent) {
    if (ent.expressionTimer > 0) {
        ent.expressionTimer--;
        if (ent.expressionTimer <= 0) {
            ent.expression = EXPR_NORMAL;
        }
    }
    // Charging é controlado externamente, não por timer
    if (ent.isCharging) {
        ent.expression = EXPR_CHARGING;
    }
}
