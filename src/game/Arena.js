/**
 * Arena.js — Arena circular: verificação de borda, chão procedural, pilares.
 */
import { mat4 } from 'gl-matrix';
import { mvPush, mvPop, getMV, drawCube, drawFloor, useObjShader } from '../engine/Renderer.js';
import { GROUND_Y } from './Physics.js';

export const ARENA_RADIUS = 12.0;

/**
 * Verifica se a entidade está fora da arena.
 * Retorna true se ring-out confirmado.
 */
export function checkArenaEdge(ent) {
    const edge = Math.sqrt(ent.pos[0] * ent.pos[0] + ent.pos[2] * ent.pos[2]);

    if (edge > ARENA_RADIUS) {
        // Fora da arena — perde o chão, cai
        ent.onGround = false;
    }

    // Ring-out: caiu longe demais ou muito abaixo
    return ent.pos[1] < -10.0 || edge > ARENA_RADIUS + 5;
}

/**
 * Desenha o chão + pilares decorativos.
 */
export function drawArena(gameTime) {
    const mv = getMV();

    // ── Chão (shader procedural) ──
    mvPush();
    mat4.translate(mv, mv, [0, GROUND_Y - 0.05, 0]);
    drawFloor(gameTime, ARENA_RADIUS);
    mvPop();

    // ── Pilares na borda ──
    useObjShader();
    const numPillars = 8;
    for (let i = 0; i < numPillars; i++) {
        const angle = (i / numPillars) * Math.PI * 2;
        const px = Math.cos(angle) * (ARENA_RADIUS + 1.0);
        const pz = Math.sin(angle) * (ARENA_RADIUS + 1.0);
        const pulse = 0.8 + 0.2 * Math.sin(gameTime * 2.0 + i);

        mvPush();
        mat4.translate(mv, mv, [px, GROUND_Y + 1.5, pz]);
        drawCube(
            [0.0, 0.3 * pulse, 0.4 * pulse, 1.0],
            [0.15, 1.5, 0.15], 0, 2.0
        );
        mvPop();
    }
}

/**
 * Desenha sombra falsa (cubo achatado) abaixo de uma entidade.
 */
export function drawShadow(ent) {
    if (ent.pos[1] > 20) return;

    const mv = getMV();
    const heightAboveGround = ent.pos[1] - ent.size - GROUND_Y;
    const scale = ent.size * Math.max(0.3, 1.0 - heightAboveGround * 0.04);

    mvPush();
    mat4.translate(mv, mv, [ent.pos[0], GROUND_Y + 0.02, ent.pos[2]]);
    drawCube([0, 0, 0, 0.45], [scale, 0.02, scale], 0, 0);
    mvPop();
}
