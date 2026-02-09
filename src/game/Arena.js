/**
 * Arena.js — Arena circular: verificação de borda, chão procedural,
 * barreira de força holográfica, volume 3D da plataforma.
 */
import { mat4 } from 'gl-matrix';
import { mvPush, mvPop, getMV, drawCube, drawFloor,
         drawSkybox, drawBarrier, drawArenaVolume,
         useObjShader } from '../engine/Renderer.js';
import { GROUND_Y } from './Physics.js';

export let ARENA_RADIUS = 16.0;

/**
 * Define o raio da arena baseado no número de inimigos.
 */
export function setArenaRadius(numEnemies) {
    ARENA_RADIUS = 16.0 * Math.sqrt(numEnemies);
}

/**
 * Verifica se a entidade está fora da arena.
 * Retorna true se ring-out confirmado.
 */
export function checkArenaEdge(ent) {
    const edge = Math.sqrt(ent.pos[0] * ent.pos[0] + ent.pos[2] * ent.pos[2]);

    if (edge > ARENA_RADIUS) {
        ent.onGround = false;
    }

    return ent.pos[1] < -10.0 || edge > ARENA_RADIUS + 5;
}

/**
 * Desenha a arena completa:
 *  1. Skybox (Cyber-Void background)
 *  2. Chão (shader procedural com grid)
 *  3. Arena Volume (plataforma com espessura)
 *  4. Barreira de força (anel holográfico na borda)
 *
 * @param {number} gameTime
 * @param {Float32Array|number[]} playerPos — posição do jogador para reação de proximidade
 * @param {Float32Array|number[]} eyePos — posição da câmera
 */
export function drawArena(gameTime, playerPos, eyePos) {
    const mv = getMV();

    // ── 1. Skybox (renderizado antes de tudo, sem depth) ──
    drawSkybox(gameTime);

    // ── 2. Volume da plataforma (cilindro sólido abaixo do chão) ──
    mvPush();
    mat4.translate(mv, mv, [0, GROUND_Y, 0]);
    drawArenaVolume(ARENA_RADIUS);
    mvPop();

    // ── 3. Chão (shader procedural — superfície de vidro da máquina) ──
    mvPush();
    mat4.translate(mv, mv, [0, GROUND_Y - 0.05, 0]);
    drawFloor(gameTime, ARENA_RADIUS);
    mvPop();

    // ── 4. Barreira de força holográfica (anel na borda) ──
    mvPush();
    mat4.translate(mv, mv, [0, GROUND_Y, 0]);
    drawBarrier(gameTime, ARENA_RADIUS, playerPos || [0, 0, 0], eyePos || [18, 24, -18]);
    mvPop();
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
