/**
 * Arena.js — Arena circular: verificação de borda, chão procedural, pilares.
 */
import { mat4 } from 'gl-matrix';
import { mvPush, mvPop, getMV, drawCube, drawFloor, useObjShader } from '../engine/Renderer.js';
import { GROUND_Y } from './Physics.js';

export let ARENA_RADIUS = 16.0; // base arena size (will scale with enemy count)

/**
 * Define o raio da arena baseado no número de inimigos.
 */
export function setArenaRadius(numEnemies) {
    ARENA_RADIUS = 16.0 * Math.sqrt(numEnemies); // escala com √n para manter densidade
}

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
 * Desenha o chão + pilares decorativos + BORDA DA ARENA VISUAL.
 */
export function drawArena(gameTime) {
    const mv = getMV();

    // ── Chão (shader procedural) ──
    mvPush();
    mat4.translate(mv, mv, [0, GROUND_Y - 0.05, 0]);
    drawFloor(gameTime, ARENA_RADIUS);
    mvPop();

    // ── BORDA VISUAL DA ARENA ──
    // Anel externo que marca o limite (fica bem claro onde é a borda)
    useObjShader();
    const numEdgeSegments = 32;
    for (let i = 0; i < numEdgeSegments; i++) {
        const angle = (i / numEdgeSegments) * Math.PI * 2;
        const nextAngle = ((i + 1) / numEdgeSegments) * Math.PI * 2;
        
        const x1 = Math.cos(angle) * ARENA_RADIUS;
        const z1 = Math.sin(angle) * ARENA_RADIUS;
        const x2 = Math.cos(nextAngle) * ARENA_RADIUS;
        const z2 = Math.sin(nextAngle) * ARENA_RADIUS;
        
        const midX = (x1 + x2) * 0.5;
        const midZ = (z1 + z2) * 0.5;
        
        // Barra vertical na borda (aviso visual)
        const pulse = 0.6 + 0.4 * Math.sin(gameTime * 3.0 + i * 0.3);
        mvPush();
        mat4.translate(mv, mv, [midX, GROUND_Y + 0.15, midZ]);
        drawCube(
            [1.0, 0.1 * pulse, 0.1, 0.9], // vermelho pulsante
            [0.3, 0.3, 0.3], 0, 1.5
        );
        mvPop();
    }

    // ── VOID visual (escuridão abaixo) ──
    // Plataforma escura bem abaixo para dar sensação de queda no vazio
    mvPush();
    mat4.translate(mv, mv, [0, GROUND_Y - 15, 0]);
    drawCube(
        [0.05, 0.0, 0.15, 0.7], // azul escuro translucido
        [ARENA_RADIUS * 3, 0.1, ARENA_RADIUS * 3], 0, 0
    );
    mvPop();

    // ── Pilares na borda ──
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
