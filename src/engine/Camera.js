/**
 * Camera.js — Chase camera via mat4.lookAt.
 *
 * Câmera fica ATRÁS e ACIMA do jogador, olhando para o ponto médio
 * entre jogador e inimigo. Suavizada via lerp.
 * Toda a lógica opera em COORDENADAS DE MUNDO (Y = cima).
 */
import { mat4, vec3 } from 'gl-matrix';
import { lerp } from './MathUtils.js';

// ── Parâmetros tunáveis ──────────────────────────────────────
const DISTANCE   = 22;    // distância atrás do jogador
const HEIGHT     = 16;    // altura acima do chão
const LOOK_Y_OFF = 2.0;   // olha um pouco acima do centro das entidades
const SMOOTH     = 0.05;  // suavização da posição (0 = sem, 1 = instant)
const SMOOTH_TGT = 0.07;  // suavização do alvo (lookAt)

export class Camera {
    constructor() {
        this.eyeX = 0;
        this.eyeY = HEIGHT;
        this.eyeZ = -DISTANCE;

        this.tgtX = 0;
        this.tgtY = LOOK_Y_OFF;
        this.tgtZ = 0;

        this.shakeAmount = 0;
        this.viewMatrix = mat4.create();
    }

    /**
     * Posiciona a câmera atrás do jogador, olhando para o meio da ação.
     */
    update(playerPos, playerYaw, enemyPos) {
        const sinY = Math.sin(playerYaw);
        const cosY = Math.cos(playerYaw);

        // Posição ideal: atrás do jogador no eixo do yaw
        const idealX = playerPos[0] - sinY * DISTANCE;
        const idealY = playerPos[1] + HEIGHT;
        const idealZ = playerPos[2] - cosY * DISTANCE;

        // Alvo: 65% jogador, 35% inimigo (enquadra a ação)
        const midX = playerPos[0] * 0.65 + enemyPos[0] * 0.35;
        const midY = (playerPos[1] + enemyPos[1]) * 0.5 + LOOK_Y_OFF;
        const midZ = playerPos[2] * 0.65 + enemyPos[2] * 0.35;

        // Suavização
        this.eyeX = lerp(this.eyeX, idealX, SMOOTH);
        this.eyeY = lerp(this.eyeY, idealY, SMOOTH);
        this.eyeZ = lerp(this.eyeZ, idealZ, SMOOTH);

        this.tgtX = lerp(this.tgtX, midX, SMOOTH_TGT);
        this.tgtY = lerp(this.tgtY, midY, SMOOTH_TGT);
        this.tgtZ = lerp(this.tgtZ, midZ, SMOOTH_TGT);

        // Shake decay
        this.shakeAmount *= 0.88;
        if (this.shakeAmount < 0.02) this.shakeAmount = 0;
    }

    /**
     * Gera a view matrix via lookAt e escreve na mvMatrix.
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

    /** Yaw da câmera (para movimento relativo do jogador). */
    getYaw() {
        const dx = this.tgtX - this.eyeX;
        const dz = this.tgtZ - this.eyeZ;
        return Math.atan2(dx, dz);
    }

    /** Posiciona instantaneamente (para início de round). */
    snapTo(playerPos, playerYaw, enemyPos) {
        const sinY = Math.sin(playerYaw);
        const cosY = Math.cos(playerYaw);
        this.eyeX = playerPos[0] - sinY * DISTANCE;
        this.eyeY = playerPos[1] + HEIGHT;
        this.eyeZ = playerPos[2] - cosY * DISTANCE;
        this.tgtX = playerPos[0] * 0.65 + enemyPos[0] * 0.35;
        this.tgtY = (playerPos[1] + enemyPos[1]) * 0.5 + LOOK_Y_OFF;
        this.tgtZ = playerPos[2] * 0.65 + enemyPos[2] * 0.35;
        this.shakeAmount = 0;
    }

    addShake(amount) {
        this.shakeAmount = Math.min(Math.max(this.shakeAmount, amount), 3.0);
    }
}
