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
 * Atualiza braços do jogador baseado em mouse + clique.
 * Agora com extensão mais rápida (socos mais snappy).
 */
export function updatePlayerArms(player, input) {
    const lag = 0.18;         // era 0.14 — braços mais rápidos
    const punchLag = 0.22;    // retração mais lenta (peso do soco)

    const targetRotX = input.aimY * 1.5;
    const targetRotY = input.aimX * 1.8;
    let   targetExt  = 1.5 + (input.aimY * -1.2);
    targetExt = clamp(targetExt, 0.6, 4.5); // extensão máxima maior

    // Esquerdo
    if (input.lClick) {
        player.arms.left.targetRot = [targetRotX, targetRotY];
        player.arms.left.targetExt = targetExt;
    } else {
        player.arms.left.targetRot = [0, 0];
        player.arms.left.targetExt = 0.8;
    }

    // Direito
    if (input.rClick) {
        player.arms.right.targetRot = [targetRotX, -targetRotY];
        player.arms.right.targetExt = targetExt;
    } else {
        player.arms.right.targetRot = [0, 0];
        player.arms.right.targetExt = 0.8;
    }

    // Interpolação (extensão usa lag diferente conforme direção)
    _lerpArms(player, lag, punchLag);
}

function _lerpArms(ent, extendLag, retractLag) {
    ['left', 'right'].forEach(side => {
        const arm = ent.arms[side];
        arm.prevExt = arm.currentExt;
        const tR = arm.targetRot || [0, 0];
        arm.currentRot[0] = lerp(arm.currentRot[0], tR[0], extendLag);
        arm.currentRot[1] = lerp(arm.currentRot[1], tR[1], extendLag);

        // Extensão mais rápida que retração → soco tem "snap"
        const extLag = arm.targetExt > arm.currentExt ? extendLag : retractLag;
        arm.currentExt = lerp(arm.currentExt, arm.targetExt, extLag);
    });
}
