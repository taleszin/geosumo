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
import * as Haptic from '../engine/Haptic.js';
import { setExpression, EXPR_STUNNED } from './Entity.js';

// ── Constantes de física ─────────────────────────────────────
export const GRAVITY        = 0.018;
export const GROUND_Y       = 0.0;
export const FALL_THRESHOLD = -12.0;
export const MAX_HEIGHT     = 8.0;   // Limite máximo de altura (teto invisível)

const GROUND_FRICTION = 0.86;        // alto = pesado
const AIR_FRICTION    = 0.98;
const MAX_VELOCITY    = 0.9;         // teto generoso (charge pode ir além brevemente)
const ROT_DAMPING     = 0.88;
const FLASH_DECAY     = 0.86;
const HIT_COOLDOWN    = 8;           // frames entre hits (mais rápido = mais agressivo)

// ── Constantes de impacto SUMO ───────────────────────────────
const BASE_ARM_IMPACT    = 0.06;     // força base de um soco (reduzido: 0.11 → 0.06)
const MOMENTUM_MULT      = 1.8;     // quanto a velocidade do atacante multiplica (reduzido: 2.5 → 1.8)
const ARM_SPEED_MULT     = 3.0;     // quanto a velocidade do braço contribui (reduzido: 4.0 → 3.0)
const EDGE_KNOCKBACK_MULT = 1.3;    // quanto a borda amplifica knockback (reduzido: 1.5 → 1.3)
const CHARGE_IMPACT_MULT  = 2.0;    // multiplicador de dano/impulso quando charge (reduzido: 2.5 → 2.0)
const BODY_SLAM_FORCE     = 0.15;   // força da colisão corpo-a-corpo com charge (reduzido: 0.25 → 0.15)
const BODY_SLAM_DAMAGE    = 8;      // dano do body slam
const RECOIL_FACTOR       = 0.2;    // quanto o atacante recua (Newton 3ª lei)
const LIFT_FORCE          = 0.04;   // quanto o defensor é levantado (REDUZIDO: 0.12 → 0.04)
const DAMAGE_PER_FORCE    = 2.5;    // conversão força → dano % (Smash Bros style)

// ── Constantes de hitstun (atordoamento após hit) ────────
const BASE_HITSTUN        = 15;     // frames base de hitstun (0.25s a 60fps)
const HITSTUN_PER_DAMAGE  = 0.3;    // frames adicionais por 1% de dano
const HITSTUN_FRICTION    = 0.75;   // fricção durante hitstun (mais difícil voltar ao controle)

// ── Update de entidade (gravidade, integração, chão) ─────────

export function updateEntityPhysics(ent) {
    // Gravidade
    ent.vel[1] -= GRAVITY;

    // Integração
    ent.pos[0] += ent.vel[0];
    ent.pos[1] += ent.vel[1];
    ent.pos[2] += ent.vel[2];

    // Limite máximo de altura (teto invisível)
    if (ent.pos[1] > MAX_HEIGHT) {
        ent.pos[1] = MAX_HEIGHT;
        if (ent.vel[1] > 0) ent.vel[1] = 0;
    }

    // Atrito (menos atrito se carregando — para o charge deslizar mais)
    let friction = ent.onGround ? GROUND_FRICTION : AIR_FRICTION;
    if (ent.isCharging) friction = 0.92; // menos atrito durante charge
    // Durante hitstun, MUITO mais atrito (difícil recuperar controle)
    if (ent.hitstunTimer > 0) {
        friction = HITSTUN_FRICTION;
        ent.hitstunTimer--;
    } else if (ent.isEnemy && !ent.isCharging) {
        // CPU desliza mais após knockback (mais fácil eliminar) baseado na dificuldade
        const diffFriction = [0.88, 0.90, 0.92]; // Fácil: desliza MUITO, Médio: desliza mais, Difícil: desliza pouco
        friction = Math.min(friction, diffFriction[_gameDifficulty]);
    }
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

// ── Parâmetros para dificuldade (passados do main.js) ────────
let _gameDifficulty = 1; // 0=Fácil, 1=Médio, 2=Difícil

export function setDifficulty(diff) {
    _gameDifficulty = diff;
}

export function getDifficulty() {
    return _gameDifficulty;
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

    // IGNORA contatos passivos: só considera hit se houver movimento relevante do braço
    // ou movimento do corpo (soco efetivo). Isso impede knockback apenas por encostar.
    const MIN_ARM_SPEED = 0.03;
    const MIN_ATTACKER_SPEED = 0.12;
    if (armSpeed < MIN_ARM_SPEED && attackerSpeed < MIN_ATTACKER_SPEED) return false;

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

        // Pequeno dano e feedback (Smash Bros style: acumula %)
        const damageAdd = impactForce * DAMAGE_PER_FORCE * 0.25;
        defender.damage += damageAdd;
        defender.hitFlash = clamp(impactForce * 0.6, 0.2, 1.0);
        if (shakeCallback) shakeCallback(impactForce * 1.2);

        // SFX especial de atordoamento
        SFX.playImpact( Math.max(0.2, chargePow * 0.6) );
        Haptic.impactPulse(chargePow);

        // Limpar flag para não aplicar múltiplas vezes
        attacker._justCharged = 0;
        attacker[cdKey] = HIT_COOLDOWN;

        return { force: impactForce, damage: damageAdd };
    }

    // ── APLICAR IMPULSO ──────────────────────────────────
    const maxImpulse = 0.55; // aumentado para facilitar empurrão (0.45 → 0.55)
    let impulseX = clamp(impDx * impactForce, -maxImpulse, maxImpulse);
    let impulseZ = clamp(impDz * impactForce, -maxImpulse, maxImpulse);

    // ── SISTEMA DE KNOCKBACK SMASH BROS (FOCO HORIZONTAL) ────
    // 1. Quanto mais dano acumulado, maior o knockback
    const damageMultiplier = 1.0 + (defender.damage / 60) * 1.5; // +150% knockback a cada 60% (muito agressivo)
    
    // 2. Quanto menos vidas restantes, MUITO mais fácil de empurrar
    const livesRatio = defender.lives / (defender.maxLives || 1);
    const livesMultiplier = 1.0 + (1.0 - livesRatio) * 1.2; // até +120% knockback com 0 vidas
    
    // Combina os dois multiplicadores
    const totalKnockbackMult = damageMultiplier * livesMultiplier;
    impulseX *= totalKnockbackMult;
    impulseZ *= totalKnockbackMult;

    // Enemy (CPU) é MAIS fácil de empurrar que o player
    if (defender.isEnemy) {
        const diffKnockback = [1.35, 1.15, 0.95]; // Fácil: +35%, Médio: +15%, Difícil: -5%
        const mult = diffKnockback[_gameDifficulty];
        impulseX *= mult;
        impulseZ *= mult;
    }
    // Player tem resistência moderada
    if (defender.isPlayer) {
        impulseX *= 0.85;
        impulseZ *= 0.85;
    }

    // Clamp após multiplicadores (limite muito maior para knockbacks brutais)
    impulseX = clamp(impulseX, -maxImpulse * 3.5, maxImpulse * 3.5);
    impulseZ = clamp(impulseZ, -maxImpulse * 3.5, maxImpulse * 3.5);

    // Defensor é empurrado
    defender.vel[0] += impulseX;
    // Lift MUITO reduzido - foco no knockback horizontal!
    const liftAmount = impactForce * LIFT_FORCE * 0.3; // MUITO reduzido
    defender.vel[1] += clamp(liftAmount, 0, 0.15); // máximo muito baixo
    defender.vel[2] += impulseZ;

    // Atacante recua (Newton 3ª lei, moderada)
    attacker.vel[0] -= impulseX * RECOIL_FACTOR;
    attacker.vel[2] -= impulseZ * RECOIL_FACTOR;

    // ── DANO ─────────────────────────────────────────────
    let damageAdd = impactForce * DAMAGE_PER_FORCE;
    // Player recebe 25% menos dano (mais tolerante)
    if (defender.isPlayer) damageAdd *= 0.75;
    
    // Armazena o dano antes de aplicar para retornar depois
    const finalDamage = damageAdd;
    
    defender.damage += damageAdd; // Acumula % de dano (Smash Bros style)
    // ── HITSTUN (atordoamento após hit - estilo Smash Bros) ────────────────────────
    // Quanto mais dano, mais tempo atordoado
    let hitstunFrames = BASE_HITSTUN + defender.damage * HITSTUN_PER_DAMAGE;
    
    // Dificuldade afeta hitstun da CPU
    if (defender.isEnemy) {
        const diffMultipliers = [1.5, 1.0, 0.6]; // Fácil: +50%, Médio: normal, Difícil: -40%
        hitstunFrames *= diffMultipliers[_gameDifficulty];
    }
    // Player tem hitstun reduzido (melhor recovery)
    if (defender.isPlayer) {
        hitstunFrames *= 0.7;
    }
    
    defender.hitstunTimer = Math.floor(hitstunFrames);
    // ── FEEDBACK VISUAL ──────────────────────────────────
    defender.hitFlash = clamp(impactForce * 1.2, 0.3, 1.0);
    const tiltForce = clamp(impactForce * 0.15, 0.02, 0.4);
    defender.rot[2] += impDx * tiltForce;
    defender.rot[0] += impDz * tiltForce;

    // Screen shake proporcional ao impacto
    if (shakeCallback) shakeCallback(impactForce * 2.5);

    // Cooldown
    attacker[cdKey] = HIT_COOLDOWN;

    return { force: impactForce, damage: finalDamage }; // retorna força E dano
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
    // OBS: contato corpo-a-corpo não provoca repulsão nas velocidades. A física de
    // empurrão agora é controlada apenas por impactos de braço (checkArmHit) e
    // body-slam quando slamForce > 0. Mantemos pushStrength = 0 para segurança.
    const pushStrength = 0.0;

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
            let bump = slamForce * 0.4;
            // Player resiste mais a body slam também
            if (target.isPlayer) bump *= 0.7;
            
            if (source === a) {
                b.vel[0] += nx * bump;
                b.vel[1] += bump * 0.08; // reduzido de 0.2 para 0.08
                b.vel[2] += nz * bump;
                b.damage += BODY_SLAM_DAMAGE * (bump / BODY_SLAM_FORCE);
                b.hitFlash = 0.5;
            } else {
                a.vel[0] -= nx * bump;
                a.vel[1] += bump * 0.08; // reduzido de 0.2 para 0.08
                a.vel[2] -= nz * bump;
                a.damage += BODY_SLAM_DAMAGE * (bump / BODY_SLAM_FORCE);
                a.hitFlash = 0.5;
            }

            SFX.playBodySlam(chargePow);
            Haptic.heavyPulse();
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
            b.vel[1] += slamForce * 0.1; // reduzido de 0.3 para 0.1
            b.vel[2] += nz * slamForce;
            b.damage += BODY_SLAM_DAMAGE * (slamForce / BODY_SLAM_FORCE);
            b.hitFlash = 0.6;
            b.rot[2] += nx * slamForce * 0.3;
            b.rot[0] += nz * slamForce * 0.3;
        } else {
            a.vel[0] -= nx * slamForce;
            a.vel[1] += slamForce * 0.1; // reduzido de 0.3 para 0.1
            a.vel[2] -= nz * slamForce;
            a.damage += BODY_SLAM_DAMAGE * (slamForce / BODY_SLAM_FORCE);
            a.hitFlash = 0.6;
            a.rot[2] -= nx * slamForce * 0.3;
            a.rot[0] += nz * slamForce * 0.3;
        }

        return slamForce; // retorna para triggerar expressão
    }

    // Feedback leve (sem alterar velocidades) para contatos que não são slam.
    // Usamos um pequeno multiplicador para gerar um valor de "contactForce" que
    // alimenta reações visuais / expressões, mas não aplica impulso físico.
    const contactForce = impulse * Math.max(a.mass, b.mass) * 0.15;
    if (contactForce > 0.05) {
        // Ambos tremem um pouco (visual)
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

    // Dash SFX + haptic
    SFX.playDash(power);
    SFX.setChargeLevel(0);
    Haptic.heavyPulse();

    return power;
}
