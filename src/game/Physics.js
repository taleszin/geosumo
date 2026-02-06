/**
 * Physics.js — Física estilo SUMÔ pesado.
 *
 * O combate é sobre EMPURRÕES massivos, cargas e momentum.
 * Sistema redesenhado para:
 *   - Impactos de braço muito mais fortes e satisfatórios
 *   - Body slam (colisão corpo-a-corpo quando carregando)
 *   - Knockback amplificado perto da borda da arena
 *   - Charge momentum (tachi-ai): carregar e soltar = impacto brutal
 *   - Massa importa: formas maiores são mais difíceis de empurrar
 */
import { clamp, len2D } from '../engine/MathUtils.js';
import * as SFX from '../audio/SFX.js';
import { setExpression, EXPR_STUNNED } from './Entity.js';

// ── Constantes de física ─────────────────────────────────────
export const GRAVITY        = 0.018;
export const GROUND_Y       = 0.0;
export const FALL_THRESHOLD = -12.0;

const GROUND_FRICTION = 0.86;        // alto = pesado
const AIR_FRICTION    = 0.98;
const MAX_VELOCITY    = 0.9;         // teto generoso (charge pode ir além brevemente)
const ROT_DAMPING     = 0.88;
const FLASH_DECAY     = 0.86;
const HIT_COOLDOWN    = 8;           // frames entre hits (mais rápido = mais agressivo)

// ── Constantes de impacto SUMO ───────────────────────────────
const BASE_ARM_IMPACT    = 0.15;     // força base de um soco
const MOMENTUM_MULT      = 2.5;     // quanto a velocidade do atacante multiplica
const ARM_SPEED_MULT     = 4.0;     // quanto a velocidade do braço contribui
const EDGE_KNOCKBACK_MULT = 2.2;    // quanto a borda amplifica knockback
const CHARGE_IMPACT_MULT  = 3.5;    // multiplicador de dano/impulso quando charge
const BODY_SLAM_FORCE     = 0.25;   // força da colisão corpo-a-corpo com charge
const BODY_SLAM_DAMAGE    = 8;      // dano do body slam
const RECOIL_FACTOR       = 0.2;    // quanto o atacante recua (Newton 3ª lei)
const LIFT_FORCE          = 0.12;   // quanto o defensor é levantado
const DAMAGE_PER_FORCE    = 5.0;    // conversão força → dano HP

// ── Update de entidade (gravidade, integração, chão) ─────────

export function updateEntityPhysics(ent) {
    // Gravidade
    ent.vel[1] -= GRAVITY;

    // Integração
    ent.pos[0] += ent.vel[0];
    ent.pos[1] += ent.vel[1];
    ent.pos[2] += ent.vel[2];

    // Atrito (menos atrito se carregando — para o charge deslizar mais)
    let friction = ent.onGround ? GROUND_FRICTION : AIR_FRICTION;
    if (ent.isCharging) friction = 0.92; // menos atrito durante charge
    ent.vel[0] *= friction;
    ent.vel[2] *= friction;

    // Clamp velocidade horizontal
    const hSpeed = len2D(ent.vel);
    if (hSpeed > MAX_VELOCITY) {
        const scale = MAX_VELOCITY / hSpeed;
        ent.vel[0] *= scale;
        ent.vel[2] *= scale;
    }

    // Colisão com o chão
    ent.onGround = false;
    if (ent.pos[1] <= GROUND_Y + ent.size) {
        ent.pos[1] = GROUND_Y + ent.size;
        if (ent.vel[1] < 0) ent.vel[1] = 0;
        ent.onGround = true;
    }

    // Damping de rotação visual
    ent.rot[0] *= ROT_DAMPING;
    ent.rot[2] *= ROT_DAMPING;

    // Hit flash decay
    ent.hitFlash *= FLASH_DECAY;
    if (ent.hitFlash < 0.01) ent.hitFlash = 0;

    // Hit cooldown tick
    if (ent._hitCdL > 0) ent._hitCdL--;
    if (ent._hitCdR > 0) ent._hitCdR--;

    // Charge cooldown tick
    if (ent.chargeCooldown > 0) ent.chargeCooldown--;
}

// ── Colisão braço vs chão ────────────────────────────────────

export function checkArmGround(ent, side) {
    const arm = ent.arms[side];
    const rotX = arm.currentRot[0];
    const rotY = arm.currentRot[1];

    const dy = Math.sin(rotX);
    const dx = Math.sin(rotY) * Math.cos(rotX);
    const dz = Math.cos(rotY) * Math.cos(rotX);

    const length = arm.currentExt * 2.0 + ent.size;
    const tipY = ent.pos[1] + dy * length;

    if (tipY < GROUND_Y) {
        const pen = GROUND_Y - tipY;
        ent.vel[1] += pen * 0.05;
        ent.vel[0] -= dx * 0.02;
        ent.vel[2] -= dz * 0.02;
        ent.rot[2] += dx * 0.015;
        ent.rot[0] -= dz * 0.015;
    }
}

// ── Colisão braço vs defensor (EMPURRÃO SUMO) ────────────────

export function checkArmHit(attacker, defender, side, sideDir, shakeCallback, arenaRadius) {
    const arm = attacker.arms[side];

    // Cooldown
    const cdKey = side === 'left' ? '_hitCdL' : '_hitCdR';
    if (attacker[cdKey] > 0) return false;

    // Posição da ponta do braço no mundo
    const rotX = arm.currentRot[0];
    const rotY = arm.currentRot[1];
    const yaw  = attacker.rot[1] || 0;

    const ldx = Math.sin(rotY) * Math.cos(rotX);
    const ldy = Math.sin(rotX);
    const ldz = Math.cos(rotY) * Math.cos(rotX);

    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const wdx =  ldx * cosY + ldz * sinY;
    const wdz = -ldx * sinY + ldz * cosY;

    const length = arm.currentExt * 2.0;

    const pivotX = attacker.pos[0] + sideDir * attacker.size * 0.9 * cosY;
    const pivotZ = attacker.pos[2] + sideDir * attacker.size * 0.9 * sinY;

    const tipX = pivotX + wdx * length;
    const tipY = attacker.pos[1] + ldy * length;
    const tipZ = pivotZ + wdz * length;

    // Distância ponta → centro do defensor
    const dxD = tipX - defender.pos[0];
    const dyD = tipY - defender.pos[1];
    const dzD = tipZ - defender.pos[2];
    const dist = Math.sqrt(dxD * dxD + dyD * dyD + dzD * dzD);

    const hitRadius = defender.size * 1.6; // hitbox mais generoso
    if (dist >= hitRadius) return false;

    // ── CÁLCULO DE IMPACTO SUMO ──────────────────────────
    const armSpeed      = Math.abs(arm.currentExt - arm.prevExt);
    const attackerSpeed = len2D(attacker.vel);
    const massRatio     = attacker.mass / (defender.mass || 1);

    // Força = base + velocidade corpo + velocidade braço, escalonada por massa
    let impactForce = BASE_ARM_IMPACT
        + attackerSpeed * MOMENTUM_MULT
        + armSpeed * ARM_SPEED_MULT;
    impactForce *= Math.sqrt(massRatio);

    // Bônus de charge (se o atacante estava carregando)
    if (attacker.chargeAmount > 0.5) {
        impactForce *= (1.0 + attacker.chargeAmount * CHARGE_IMPACT_MULT);
        attacker.chargeAmount = 0;
        attacker.isCharging = false;
    }

    // BORDA AMPLIFICA: quanto mais perto da borda o defensor está, mais knockback
    const defEdgeDist = Math.sqrt(defender.pos[0] ** 2 + defender.pos[2] ** 2);
    const radius = arenaRadius || 12;
    const edgeRatio = clamp(defEdgeDist / radius, 0, 1);
    const edgeBoost = 1.0 + edgeRatio * edgeRatio * EDGE_KNOCKBACK_MULT;
    impactForce *= edgeBoost;

    // ── DIREÇÃO DO EMPURRÃO ──────────────────────────────
    let impDx = defender.pos[0] - attacker.pos[0];
    let impDz = defender.pos[2] - attacker.pos[2];
    const impLen = Math.sqrt(impDx * impDx + impDz * impDz) || 1;
    impDx /= impLen;
    impDz /= impLen;

    // Special handling: if attacker acabou de fazer um charge e é CPU, transformar
    // efeito em ATORDOAMENTO em vez de repulsão exagerada.
    if (attacker._justCharged && attacker.isEnemy) {
        const chargePow = attacker._justCharged || 0;
        // Aplica atordoamento no defensor
        const stunDur = Math.floor(30 + chargePow * 60); // 30..90 frames (~0.5s..1.5s)
        setExpression(defender, EXPR_STUNNED, stunDur);
        // Diminui impulso e dano (apenas um bump leve)
        const reducedImpulseX = clamp(impDx * impactForce * 0.25, -0.3, 0.3);
        const reducedImpulseZ = clamp(impDz * impactForce * 0.25, -0.3, 0.3);

        defender.vel[0] += reducedImpulseX;
        defender.vel[1] += clamp(impactForce * LIFT_FORCE * 0.2, 0, 0.12);
        defender.vel[2] += reducedImpulseZ;

        // Recoil menor
        attacker.vel[0] -= reducedImpulseX * RECOIL_FACTOR;
        attacker.vel[2] -= reducedImpulseZ * RECOIL_FACTOR;

        // Pequeno dano e feedback
        const damage = impactForce * DAMAGE_PER_FORCE * 0.25;
        defender.hp = Math.max(0, defender.hp - damage);
        defender.hitFlash = clamp(impactForce * 0.6, 0.2, 1.0);
        if (shakeCallback) shakeCallback(impactForce * 1.2);

        // SFX especial de atordoamento
        SFX.playImpact( Math.max(0.2, chargePow * 0.6) );

        // Limpar flag para não aplicar múltiplas vezes
        attacker._justCharged = 0;
        attacker[cdKey] = HIT_COOLDOWN;

        return impactForce;
    }

    // ── APLICAR IMPULSO ──────────────────────────────────
    const maxImpulse = 0.8; // muito mais alto que antes (era 0.35)
    const impulseX = clamp(impDx * impactForce, -maxImpulse, maxImpulse);
    const impulseZ = clamp(impDz * impactForce, -maxImpulse, maxImpulse);

    // Defensor é empurrado
    defender.vel[0] += impulseX;
    defender.vel[1] += clamp(impactForce * LIFT_FORCE, 0, 0.25);
    defender.vel[2] += impulseZ;

    // Atacante recua (Newton 3ª lei, moderada)
    attacker.vel[0] -= impulseX * RECOIL_FACTOR;
    attacker.vel[2] -= impulseZ * RECOIL_FACTOR;

    // ── DANO ─────────────────────────────────────────────
    const damage = impactForce * DAMAGE_PER_FORCE;
    defender.hp = Math.max(0, defender.hp - damage);

    // ── FEEDBACK VISUAL ──────────────────────────────────
    defender.hitFlash = clamp(impactForce * 1.2, 0.3, 1.0);
    const tiltForce = clamp(impactForce * 0.15, 0.02, 0.4);
    defender.rot[2] += impDx * tiltForce;
    defender.rot[0] += impDz * tiltForce;

    // Screen shake proporcional ao impacto
    if (shakeCallback) shakeCallback(impactForce * 2.5);

    // Cooldown
    attacker[cdKey] = HIT_COOLDOWN;

    return impactForce; // retorna a força para triggerar expressões
}

// ── Body-vs-body (separação + SUMO PUSH) ─────────────────────

export function bodyCollision(a, b) {
    let dx = b.pos[0] - a.pos[0];
    let dz = b.pos[2] - a.pos[2];
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
    const minDist = a.size + b.size;

    if (dist >= minDist) return 0;

    const overlap = (minDist - dist) * 0.5;
    const nx = dx / dist;
    const nz = dz / dist;

    // Separação
    a.pos[0] -= nx * overlap;
    a.pos[2] -= nz * overlap;
    b.pos[0] += nx * overlap;
    b.pos[2] += nz * overlap;

    // ── SUMO PUSH ────────────────────────────────────────
    // Velocidade relativa no eixo da colisão
    const relVx = a.vel[0] - b.vel[0];
    const relVz = a.vel[2] - b.vel[2];
    const relDot = relVx * nx + relVz * nz;

    if (relDot <= 0) return 0;

    const totalMass = a.mass + b.mass;
    let impulse = relDot / totalMass;

    // Body slam: se um dos dois está carregando, impacto muito maior
    let slamForce = 0;

    if (a.isCharging && a.chargeAmount > 0.5) {
        slamForce = a.chargeAmount * BODY_SLAM_FORCE * a.mass;
        a.chargeAmount = 0;
        a.isCharging = false;
    }
    if (b.isCharging && b.chargeAmount > 0.5) {
        slamForce = Math.max(slamForce, b.chargeAmount * BODY_SLAM_FORCE * b.mass);
        b.chargeAmount = 0;
        b.isCharging = false;
    }

    // Aplicar impulso normal
    const pushStrength = 0.8; // era 0.6
    a.vel[0] -= impulse * b.mass * nx * pushStrength;
    a.vel[2] -= impulse * b.mass * nz * pushStrength;
    b.vel[0] += impulse * a.mass * nx * pushStrength;
    b.vel[2] += impulse * a.mass * nz * pushStrength;

    // Body slam extra
    if (slamForce > 0) {
        // Detect charged source (se algum dos dois acabou de fazer charge)
        const source = (a._justCharged && a._justCharged > 0) ? a : ((b._justCharged && b._justCharged > 0) ? b : null);
        if (source && source.isEnemy) {
            // Se a fonte foi o CPU, aplicar ATORDOAMENTO no oponente ao invés de full slam
            const target = source === a ? b : a;
            const chargePow = source._justCharged || 0;
            const stunDur = Math.floor(40 + chargePow * 80); // 40..120 frames
            setExpression(target, EXPR_STUNNED, stunDur);

            // Aplicar bump reduzido
            const bump = slamForce * 0.4;
            if (source === a) {
                b.vel[0] += nx * bump;
                b.vel[1] += bump * 0.2;
                b.vel[2] += nz * bump;
                b.hp = Math.max(0, b.hp - BODY_SLAM_DAMAGE * (bump / BODY_SLAM_FORCE));
                b.hitFlash = 0.5;
            } else {
                a.vel[0] -= nx * bump;
                a.vel[1] += bump * 0.2;
                a.vel[2] -= nz * bump;
                a.hp = Math.max(0, a.hp - BODY_SLAM_DAMAGE * (bump / BODY_SLAM_FORCE));
                a.hitFlash = 0.5;
            }

            SFX.playBodySlam(chargePow);
            // Limpar flag e aplicar cooldown extra
            source._justCharged = 0;
            source.chargeCooldown += 90;

            return slamForce;
        }

        // Quem estava mais rápido empurra o outro (comportamento original)
        const speedA = len2D(a.vel);
        const speedB = len2D(b.vel);

        if (speedA > speedB) {
            b.vel[0] += nx * slamForce;
            b.vel[1] += slamForce * 0.3;
            b.vel[2] += nz * slamForce;
            b.hp -= BODY_SLAM_DAMAGE * (slamForce / BODY_SLAM_FORCE);
            b.hitFlash = 0.6;
            b.rot[2] += nx * slamForce * 0.3;
            b.rot[0] += nz * slamForce * 0.3;
        } else {
            a.vel[0] -= nx * slamForce;
            a.vel[1] += slamForce * 0.3;
            a.vel[2] -= nz * slamForce;
            a.hp -= BODY_SLAM_DAMAGE * (slamForce / BODY_SLAM_FORCE);
            a.hitFlash = 0.6;
            a.rot[2] -= nx * slamForce * 0.3;
            a.rot[0] += nz * slamForce * 0.3;
        }

        return slamForce; // retorna para triggerar expressão
    }

    // Leve push even without slam (sumo oshi)
    const contactForce = impulse * Math.max(a.mass, b.mass) * pushStrength;
    if (contactForce > 0.05) {
        // Ambos tremem um pouco
        a.rot[2] -= nx * contactForce * 0.05;
        b.rot[2] += nx * contactForce * 0.05;
    }

    return contactForce;
}

// ── Charge (Tachi-ai / Dash) ─────────────────────────────────

/**
 * Incrementa a carga. Chamado a cada frame enquanto o jogador
 * segura o botão de charge.
 */

export function chargeUp(ent, dt) {
    if (ent.chargeCooldown > 0) return;

    ent.isCharging = true;
    ent.chargeAmount = clamp(ent.chargeAmount + dt * 1.2, 0, 1.0);
    ent.chargeReady = ent.chargeAmount >= 0.95;

    // Update charge SFX (continuous tone that rises with charge)
    SFX.setChargeLevel(ent.chargeAmount);
}

/**
 * Libera a carga: aplica impulso na direção que a entidade olha.
 * Retorna a força do dash (para efeitos sonoros/visuais).
 */
export function releaseCharge(ent) {
    if (!ent.isCharging || ent.chargeAmount < 0.2) {
        ent.isCharging = false;
        ent.chargeAmount = 0;
        SFX.setChargeLevel(0);
        return 0;
    }

    const power = ent.chargeAmount;
    const force = power * 0.6 * ent.mass;

    // Direção: para onde o corpo está apontando (yaw)
    const sinY = Math.sin(ent.rot[1]);
    const cosY = Math.cos(ent.rot[1]);

    ent.vel[0] += sinY * force;
    ent.vel[2] += cosY * force;

    // Leve lift
    if (ent.onGround) {
        ent.vel[1] += power * 0.08;
    }

    // Reset
    ent.isCharging = false;
    ent.chargeAmount = 0;
    ent.chargeCooldown = 45; // ~0.75s cooldown

    // Dash SFX
    SFX.playDash(power);
    SFX.setChargeLevel(0);

    return power;
}
