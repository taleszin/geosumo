/**
 * Camera.js — Câmera 2.5D FIXA (estilo isométrico/oblíquo).
 *
 * Posição fixa em um ângulo diagonal, olhando para o centro da arena.
 * Não rotaciona, apenas faz pan suave para enquadrar a ação.
 * Muito melhor para UX de controles (especialmente mobile).
 */
import { mat4, vec3 } from 'gl-matrix';
import { lerp } from './MathUtils.js';

// ── Posição fixa da câmera (world-space) ─────────────────────
const BASE_EYE_X  = 18;    // diagonal (nordeste)
const BASE_EYE_Y  = 24;    // bem acima
const BASE_EYE_Z  = -18;   // diagonal
const LOOK_Y_OFF  = 1.5;   // olha levemente acima do ground

// ── Responsive: afasta em portrait para ver arena toda ───────
const SMOOTH_PAN  = 0.08;  // suavização do target (pan)

export class Camera {
    constructor() {
        // Eye position (fixed, mas com responsive multiplier)
        this.eyeX = BASE_EYE_X;
        this.eyeY = BASE_EYE_Y;
        this.eyeZ = BASE_EYE_Z;

        // Look-at target (pan para enquadrar a ação)
        this.tgtX = 0;
        this.tgtY = LOOK_Y_OFF;
        this.tgtZ = 0;

        this.shakeAmount = 0;
        this.viewMatrix = mat4.create();

        this._eyeScale = 1;
        this._lookOff  = LOOK_Y_OFF;
    }

    /** Ajusta zoom para aspect ratio (portrait = afasta). */
    _calcResponsive() {
        const aspect = window.innerWidth / window.innerHeight;
        if (aspect < 1.0) {
            const t = 1.0 - aspect;           // 0..~0.6 em celulares
            this._eyeScale = 1 + t * 0.4;     // zoom out até 1.24x
            this._lookOff  = LOOK_Y_OFF + t * 1.2;
        } else {
            this._eyeScale = 1;
            this._lookOff  = LOOK_Y_OFF;
        }
    }

    /**
     * Atualiza o target (pan suave) para enquadrar player e enemy.
     */
    update(playerPos, playerYaw, enemyPos) {
        this._calcResponsive();

        // Eye position fixa (com responsive scale)
        this.eyeX = BASE_EYE_X * this._eyeScale;
        this.eyeY = BASE_EYE_Y * this._eyeScale;
        this.eyeZ = BASE_EYE_Z * this._eyeScale;

        // Target: centro de ação (60% player, 40% enemy)
        const midX = playerPos[0] * 0.6 + enemyPos[0] * 0.4;
        const midY = (playerPos[1] + enemyPos[1]) * 0.5 + this._lookOff;
        const midZ = playerPos[2] * 0.6 + enemyPos[2] * 0.4;

        // Pan suave
        this.tgtX = lerp(this.tgtX, midX, SMOOTH_PAN);
        this.tgtY = lerp(this.tgtY, midY, SMOOTH_PAN);
        this.tgtZ = lerp(this.tgtZ, midZ, SMOOTH_PAN);

        // Shake decay
        this.shakeAmount *= 0.88;
        if (this.shakeAmount < 0.02) this.shakeAmount = 0;
    }

    /**
     * Gera a view matrix via lookAt.
     */
    apply(mvMatrix) {
        const sx = (Math.random() - 0.5) * this.shakeAmount;
        const sy = (Math.random() - 0.5) * this.shakeAmount;

        const eye    = vec3.fromValues(this.eyeX + sx, this.eyeY + sy, this.eyeZ);
        const center = vec3.fromValues(this.tgtX, this.tgtY, this.tgtZ);
        const up     = vec3.fromValues(0, 1, 0);

        mat4.lookAt(this.viewMatrix, eye, center, up);
        mat4.copy(mvMatrix, this.viewMatrix);
    }

    /** Yaw da câmera (sempre constante agora). */
    getYaw() {
        return Math.atan2(BASE_EYE_X, -BASE_EYE_Z); // ~2.356 rad (~135°)
    }

    /** Snap instantâneo (início de round). */
    snapTo(playerPos, playerYaw, enemyPos) {
        this._calcResponsive();
        this.eyeX = BASE_EYE_X * this._eyeScale;
        this.eyeY = BASE_EYE_Y * this._eyeScale;
        this.eyeZ = BASE_EYE_Z * this._eyeScale;
        this.tgtX = playerPos[0] * 0.6 + enemyPos[0] * 0.4;
        this.tgtY = (playerPos[1] + enemyPos[1]) * 0.5 + this._lookOff;
        this.tgtZ = playerPos[2] * 0.6 + enemyPos[2] * 0.4;
        this.shakeAmount = 0;
    }

    addShake(amount) {
        this.shakeAmount = Math.min(Math.max(this.shakeAmount, amount), 3.0);
    }
}
