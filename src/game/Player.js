/**
 * Player.js — Controle do jogador: WASD + mouse + CHARGE (Shift/Espaço).
 *
 * Melhorias de UX:
 *   - Movimento mais responsivo (aceleração mais alta, curva melhor)
 *   - Charge/dash com Shift: segure para carregar, solte para investir
 *   - Braços mais rápidos e punitivos
 *   - Feedback tátil (entidade se inclina na direção do movimento)
 */
import { lerp, clamp } from '../engine/MathUtils.js';
import { chargeUp, releaseCharge } from './Physics.js';
import { getBuffMultipliers } from './PowerUp.js';

// ── Constantes de movimento ──────────────────────────────────
const GROUND_FORCE = 0.045;     // era 0.035 — mais responsivo
const AIR_FORCE    = 0.012;
const YAW_LERP     = 0.14;      // velocidade de rotação do corpo
const CHARGE_SLOW  = 0.4;       // multiplica velocidade durante charge (frenagem)

/**
 * Atualiza movimentação do jogador.
 * @param {object} player
 * @param {object} input
 * @param {number} camYaw — IGNORADO (câmera agora é fixa)
 * @returns {{ charging: boolean, dashPower: number }} feedback para main.js
 */
export function updatePlayerMovement(player, input, camYaw) {
    const buffMults = getBuffMultipliers(player);
    const force = (player.onGround ? GROUND_FORCE : AIR_FORCE) * buffMults.speedMult * buffMults.forceMult;
    let result = { charging: false, dashPower: 0 };

    // Input normalizado (moveX, moveZ já vem de -1..1)
    // WORLD-SPACE: não rotaciona pelo camYaw (câmera fixa)
    let worldX = input.moveX || 0;
    let worldZ = input.moveZ || 0;
    const len = Math.sqrt(worldX * worldX + worldZ * worldZ);
    if (len > 1) { worldX /= len; worldZ /= len; }

    // ── CHARGE SYSTEM ────────────────────────────────────
    const isChargingInput = input.charge;

    if (isChargingInput && player.onGround) {
        chargeUp(player, 1 / 60);
        result.charging = true;

        // Durante charge: movimento reduzido (está "plantando os pés")
        player.vel[0] += worldX * force * CHARGE_SLOW;
        player.vel[2] += worldZ * force * CHARGE_SLOW;
    } else {
        // Se estava carregando e soltou, dispara o dash
        if (player.isCharging) {
            result.dashPower = releaseCharge(player);
        }

        // Movimento normal
        player.vel[0] += worldX * force;
        player.vel[2] += worldZ * force;
    }

    // Yaw: corpo aponta na direção do movimento
    if (len > 0.1) {
        const targetYaw = Math.atan2(worldX, worldZ);
        player.rot[1] = lerp(player.rot[1], targetYaw, YAW_LERP);
    }

    // ── TILT VISUAL ──────────────────────────────────────
    // Corpo se inclina levemente na direção do movimento (feedback visual)
    if (len > 0.1 && player.onGround) {
        const speed = Math.sqrt(player.vel[0] ** 2 + player.vel[2] ** 2);
        const tiltAmount = clamp(speed * 0.15, 0, 0.12);
        // Tilt para frente (pitch) quando andando
        // Convertemos a direção do movimento para local
        const localZ = Math.cos(player.rot[1]) * player.vel[2] + Math.sin(player.rot[1]) * player.vel[0];
        if (localZ > 0.01) {
            player.rot[0] = lerp(player.rot[0], -tiltAmount, 0.08);
        }
    }

    return result;
}

/**
 * Atualiza braços do jogador com sistema ULTRA-RESPONSIVO.
 * 
 * Melhorias UX:
 *   - Extensão IMEDIATA ao clicar (sem lag perceptível)
 *   - Overshoot/bounce para peso e impacto visual
 *   - Mira precisa e suave
 *   - Retração com momentum
 *   - Braços independentes para combos rápidos
 *   - Soco duplo sincronizado quando ambos os botões são pressionados
 *   - Mobile: braços só se movem horizontalmente, sem movimento vertical
 */
export function updatePlayerArms(player, input, isTouchMode = false) {
    const arms = player.arms;

    // ── MIRA (rotação) — suave mas precisa ────────────
    // Mobile: sem movimento vertical (aimY fixo em 0)
    const targetRotX = isTouchMode ? 0 : (input.aimY * 1.8);  // 0 no mobile
    const targetRotY = input.aimX * 2.0;  // mais range horizontal
    
    // Base extension: no mobile, extensão fixa forward; no PC, varia com aimY
    let baseExt;
    if (isTouchMode) {
        baseExt = 1.8; // extensão fixa forward no mobile
    } else {
        // PC: mirar para baixo aumenta alcance, para cima diminui
        baseExt = 1.2 + (input.aimY * -1.0);
        baseExt = clamp(baseExt, 0.6, 3.0);
    }

    // Detectar soco duplo (ambos os botões pressionados)
    const doublePunch = input.lClick && input.rClick;

    // ── BRAÇO ESQUERDO ──────────────────────────────────
    const armL = arms.left;
    
    if (input.lClick) {
        // SOCO! Extensão imediata + overshoot
        armL.targetRot = [targetRotX, doublePunch ? targetRotY * 0.7 : targetRotY];
        armL.targetExt = baseExt + (doublePunch ? 0.8 : 0.5); // extra reach no double punch
        
        // MOBILE: Snap INSTANTÂNEO (padrão ouro)
        if (isTouchMode && !armL._punching) {
            armL.currentExt = armL.targetExt; // snap instantâneo - sem interpolação!
            armL.currentRot[0] = targetRotX;
            armL.currentRot[1] = targetRotY;
            armL._punching = true;
            armL._punchVel = 0; // sem velocity physics no mobile
        }
        // PC: Snap rápido na primeira extensão
        else if (!isTouchMode && armL.currentExt < 2.0) {
            armL.currentExt = armL.targetExt * 0.7; // snap to 70% imediatamente
        }
        
        // Overshoot para dar peso (apenas PC)
        if (!isTouchMode && !armL._punching) {
            armL._punchVel = doublePunch ? 1.0 : 0.8; // mais rápido no double punch
            armL._punching = true;
        }
    } else {
        // Relaxado - retrai suavemente
        armL.targetRot = [0, 0];
        armL.targetExt = 0.8;
        armL._punching = false;
        armL._punchVel = 0;
    }

    // ── BRAÇO DIREITO ───────────────────────────────────
    const armR = arms.right;
    
    if (input.rClick) {
        armR.targetRot = [targetRotX, doublePunch ? -targetRotY * 0.7 : -targetRotY]; // espelhado
        armR.targetExt = baseExt + (doublePunch ? 0.8 : 0.5);
        
        // MOBILE: Snap INSTANTÂNEO
        if (isTouchMode && !armR._punching) {
            armR.currentExt = armR.targetExt;
            armR.currentRot[0] = targetRotX;
            armR.currentRot[1] = doublePunch ? -targetRotY * 0.7 : -targetRotY; // espelhado
            armR._punching = true;
            armR._punchVel = 0;
        }
        // PC: Snap rápido
        else if (!isTouchMode && armR.currentExt < 2.0) {
            armR.currentExt = armR.targetExt * 0.7;
        }
        
        if (!isTouchMode && !armR._punching) {
            armR._punchVel = doublePunch ? 1.0 : 0.8;
            armR._punching = true;
        }
    } else {
        armR.targetRot = [0, 0];
        armR.targetExt = 0.8;
        armR._punching = false;
        armR._punchVel = 0;
    }

    // ── ANIMAÇÃO COM FÍSICA ─────────────────────────────
    // Mobile: retração muito rápida; PC: system atual
    // Power-up NITRO: braços mais rápidos
    const buffMults = getBuffMultipliers(player);
    const armMult = buffMults.armSpeedMult;
    const rotSpeed = (isTouchMode ? 0.45 : 0.25) * armMult;
    const extSpeed = (isTouchMode ? 0.35 : 0.18) * armMult;
    _animateArmWithPhysics(armL, rotSpeed, extSpeed, isTouchMode);
    _animateArmWithPhysics(armR, rotSpeed, extSpeed, isTouchMode);
}

/**
 * Anima um braço com física de mola + overshoot.
 * Muito mais responsivo que simples lerp.
 * Mobile: retração super rápida para UX instantâneo.
 */
function _animateArmWithPhysics(arm, rotSpeed, extSpeed, isTouchMode = false) {
    // Rotação — suave mas precisa
    const tR = arm.targetRot || [0, 0];
    arm.currentRot[0] = lerp(arm.currentRot[0], tR[0], rotSpeed);
    arm.currentRot[1] = lerp(arm.currentRot[1], tR[1], rotSpeed);

    // Extensão — com momentum e overshoot
    arm.prevExt = arm.currentExt;
    
    // Mobile: sem physics, apenas lerp rápido para retração instantânea
    if (isTouchMode) {
        arm.currentExt = lerp(arm.currentExt, arm.targetExt, extSpeed);
    }
    // PC: sistema de physics com overshoot
    else if (arm._punching && arm._punchVel > 0) {
        // Modo explosivo: usa velocidade em vez de lerp
        arm.currentExt += arm._punchVel;
        arm._punchVel *= 0.75; // decay rápido
        
        // Overshoot: passa um pouco do target
        if (arm.currentExt >= arm.targetExt) {
            arm.currentExt = arm.targetExt + 0.3; // overshoot
            arm._punchVel = 0;
        }
    } else {
        // Modo normal: spring para o target
        const diff = arm.targetExt - arm.currentExt;
        const speed = Math.abs(diff) > 2.0 ? extSpeed * 1.5 : extSpeed; // mais rápido se longe
        arm.currentExt = lerp(arm.currentExt, arm.targetExt, speed);
    }
    
    // Clamp para evitar valores loucos
    arm.currentExt = clamp(arm.currentExt, 0.3, 6.0);
}
