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
    const force = player.onGround ? GROUND_FORCE : AIR_FORCE;
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
 */
export function updatePlayerArms(player, input) {
    const arms = player.arms;

    // ── MIRA (rotação) — suave mas precisa ────────────
    const targetRotX = input.aimY * 1.8;  // mais range vertical
    const targetRotY = input.aimX * 2.0;  // mais range horizontal
    
    // Base extension depende da altura da mira (apontar para baixo = mais alcance)
    let baseExt = 1.2 + (input.aimY * -1.5);
    baseExt = clamp(baseExt, 0.6, 5.0);

    // Detectar soco duplo (ambos os botões pressionados)
    const doublePunch = input.lClick && input.rClick;

    // ── BRAÇO ESQUERDO ──────────────────────────────────
    const armL = arms.left;
    
    if (input.lClick) {
        // SOCO! Extensão imediata + overshoot
        armL.targetRot = [targetRotX, doublePunch ? targetRotY * 0.7 : targetRotY];
        armL.targetExt = baseExt + (doublePunch ? 0.8 : 0.5); // extra reach no double punch
        
        // Snap instantâneo na primeira extensão
        if (armL.currentExt < 2.0) {
            armL.currentExt = armL.targetExt * 0.7; // snap to 70% imediatamente
        }
        
        // Overshoot para dar peso
        if (!armL._punching) {
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
        
        if (armR.currentExt < 2.0) {
            armR.currentExt = armR.targetExt * 0.7;
        }
        
        if (!armR._punching) {
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
    _animateArmWithPhysics(armL, 0.25, 0.18);
    _animateArmWithPhysics(armR, 0.25, 0.18);
}

/**
 * Anima um braço com física de mola + overshoot.
 * Muito mais responsivo que simples lerp.
 */
function _animateArmWithPhysics(arm, rotSpeed, extSpeed) {
    // Rotação — suave mas precisa
    const tR = arm.targetRot || [0, 0];
    arm.currentRot[0] = lerp(arm.currentRot[0], tR[0], rotSpeed);
    arm.currentRot[1] = lerp(arm.currentRot[1], tR[1], rotSpeed);

    // Extensão — com momentum e overshoot
    arm.prevExt = arm.currentExt;
    
    if (arm._punching && arm._punchVel > 0) {
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
