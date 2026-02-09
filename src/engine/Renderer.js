/**
 * Renderer.js — WebGL puro: setup, shader compilation, buffers, draw helpers.
 * Inclui: skybox procedural, barreira de força, volume da arena.
 */
import { mat4 } from 'gl-matrix';

import floorVert   from '../shaders/floor.vert';
import floorFrag   from '../shaders/floor.frag';
import objVert     from '../shaders/object.vert';
import objFrag     from '../shaders/object.frag';
import bgVert      from '../shaders/background.vert';
import bgFrag      from '../shaders/background.frag';
import barrierVert from '../shaders/barrier.vert';
import barrierFrag from '../shaders/barrier.frag';

// ── Estado interno ───────────────────────────────────────────
let gl = null;
let objProgram     = null;
let floorProgram   = null;
let bgProgram      = null;
let barrierProgram = null;

// Cube buffers
let cubeVPos, cubeVNorm, cubeVIdx;

// Floor plane buffers
let planeVPos, planeVNorm, planeVIdx;
let planeIdxCount = 0;

// Fullscreen quad (skybox)
let quadVPos;

// Cylinder buffers (barrier + arena volume)
let cylVPos, cylVNorm, cylVUV, cylVIdx;
let cylIdxCount = 0;

// Arena volume disc (bottom cap)
let discVPos, discVNorm, discVIdx;
let discIdxCount = 0;

const mvStack = [];
const mvMatrix = mat4.create();
const pMatrix  = mat4.create();

// ── Inicialização ────────────────────────────────────────────

export function initRenderer(canvas) {
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { alert('WebGL não suportado'); return null; }
    gl.viewportWidth  = canvas.width;
    gl.viewportHeight = canvas.height;

    _compilePrograms();
    _initCubeBuffers();
    _initQuadBuffer();
    _initCylinderBuffers(64);
    _initDiscBuffers(64);

    gl.clearColor(0.0, 0.0, 0.0, 1.0); // pure black — skybox paints over
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return gl;
}

export function initArenaPlane(arenaRadius) {
    _initPlaneBuffers(arenaRadius);
}

export function resizeViewport(w, h) {
    if (!gl) return;
    gl.viewportWidth  = w;
    gl.viewportHeight = h;
}

// ── Getters ──────────────────────────────────────────────────

export function getGL()   { return gl; }
export function getMV()   { return mvMatrix; }
export function getProj() { return pMatrix; }

// ── Stack de Matrizes ────────────────────────────────────────

export function mvPush() {
    const c = mat4.create();
    mat4.copy(c, mvMatrix);
    mvStack.push(c);
}

export function mvPop() {
    if (!mvStack.length) throw new Error('mvPop: stack vazio!');
    mat4.copy(mvMatrix, mvStack.pop());
}

// ── Início de frame ──────────────────────────────────────────

export function beginFrame(aspect) {
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    mat4.perspective(pMatrix, 45 * Math.PI / 180, aspect, 0.1, 300.0);
    mat4.identity(mvMatrix);
}

// ═════════════════════════════════════════════════════════════
// SKYBOX — Cyber-Void procedural background
// ═════════════════════════════════════════════════════════════

export function drawSkybox(gameTime) {
    if (!bgProgram) return;
    gl.useProgram(bgProgram);

    // Desabilita depth write (skybox está "atrás de tudo")
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);

    const aPos = bgProgram.aPos;
    if (aPos >= 0) gl.enableVertexAttribArray(aPos);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadVPos);
    if (aPos >= 0) gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(bgProgram.uTime, gameTime);
    gl.uniform2f(bgProgram.uResolution, gl.viewportWidth, gl.viewportHeight);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (aPos >= 0) gl.disableVertexAttribArray(aPos);

    // Restaura depth
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
}

// ═════════════════════════════════════════════════════════════
// BARRIER — Anel de força holográfica
// ═════════════════════════════════════════════════════════════

export function drawBarrier(gameTime, arenaRadius, playerPos, eyePos) {
    if (!barrierProgram) return;
    gl.useProgram(barrierProgram);

    // Blending aditivo para brilho de energia
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    const aPos  = barrierProgram.aPos;
    const aNorm = barrierProgram.aNorm;
    const aUV   = barrierProgram.aUV;

    if (aPos >= 0)  gl.enableVertexAttribArray(aPos);
    if (aNorm >= 0) gl.enableVertexAttribArray(aNorm);
    if (aUV >= 0)   gl.enableVertexAttribArray(aUV);

    // Transform: scale unit cylinder to arena size
    mvPush();
    const mv = mvMatrix;
    const barrierHeight = 4.0;
    mat4.translate(mv, mv, [0, -0.5, 0]);
    mat4.scale(mv, mv, [arenaRadius, barrierHeight, arenaRadius]);

    gl.uniformMatrix4fv(barrierProgram.uP,  false, pMatrix);
    gl.uniformMatrix4fv(barrierProgram.uMV, false, mv);
    gl.uniform1f(barrierProgram.uTime, gameTime);
    gl.uniform1f(barrierProgram.uArenaRadius, arenaRadius);
    gl.uniform3fv(barrierProgram.uPlayerPos, playerPos || [0, 0, 0]);
    gl.uniform3fv(barrierProgram.uEyePos, eyePos || [18, 24, -18]);

    gl.bindBuffer(gl.ARRAY_BUFFER, cylVPos);
    if (aPos >= 0) gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cylVNorm);
    if (aNorm >= 0) gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cylVUV);
    if (aUV >= 0) gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cylVIdx);
    gl.drawElements(gl.TRIANGLES, cylIdxCount, gl.UNSIGNED_SHORT, 0);

    mvPop();

    if (aPos >= 0)  gl.disableVertexAttribArray(aPos);
    if (aNorm >= 0) gl.disableVertexAttribArray(aNorm);
    if (aUV >= 0)   gl.disableVertexAttribArray(aUV);

    // Restaura blend normal
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
}

// ═════════════════════════════════════════════════════════════
// ARENA VOLUME — Cilindro sólido abaixo do chão
// ═════════════════════════════════════════════════════════════

export function drawArenaVolume(arenaRadius) {
    useObjShader();

    const mv = mvMatrix;
    const thickness = 2.5;

    // ── Parede lateral (cilindro) ────────────────────────────
    mvPush();
    mat4.translate(mv, mv, [0, -0.05 - thickness, 0]);
    mat4.scale(mv, mv, [arenaRadius - 0.05, thickness, arenaRadius - 0.05]);

    gl.bindBuffer(gl.ARRAY_BUFFER, cylVPos);
    if (objProgram.aPos >= 0) gl.vertexAttribPointer(objProgram.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cylVNorm);
    if (objProgram.aNorm >= 0) gl.vertexAttribPointer(objProgram.aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cylVIdx);

    gl.uniformMatrix4fv(objProgram.uP,  false, pMatrix);
    gl.uniformMatrix4fv(objProgram.uMV, false, mv);

    const nm = mat4.create();
    mat4.invert(nm, mv);
    mat4.transpose(nm, nm);
    gl.uniformMatrix4fv(objProgram.uN, false, nm);

    gl.uniform4fv(objProgram.uColor, [0.04, 0.03, 0.08, 1.0]);
    gl.uniform1f(objProgram.uHitFlash, 0);
    gl.uniform1f(objProgram.uNeonPower, 0.6);

    gl.drawElements(gl.TRIANGLES, cylIdxCount, gl.UNSIGNED_SHORT, 0);
    mvPop();

    // ── Tampa inferior (disco) ──────────────────────────────
    mvPush();
    mat4.translate(mv, mv, [0, -0.05 - thickness, 0]);
    mat4.scale(mv, mv, [arenaRadius - 0.05, 1, arenaRadius - 0.05]);

    gl.bindBuffer(gl.ARRAY_BUFFER, discVPos);
    if (objProgram.aPos >= 0) gl.vertexAttribPointer(objProgram.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, discVNorm);
    if (objProgram.aNorm >= 0) gl.vertexAttribPointer(objProgram.aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, discVIdx);

    gl.uniformMatrix4fv(objProgram.uMV, false, mv);
    mat4.invert(nm, mv);
    mat4.transpose(nm, nm);
    gl.uniformMatrix4fv(objProgram.uN, false, nm);

    gl.uniform4fv(objProgram.uColor, [0.03, 0.02, 0.06, 1.0]);
    gl.uniform1f(objProgram.uNeonPower, 0.3);

    gl.drawElements(gl.TRIANGLES, discIdxCount, gl.UNSIGNED_SHORT, 0);
    mvPop();

    endObjShader();
}

// ── Desenhar chão (arena) ────────────────────────────────────

export function drawFloor(gameTime, arenaRadius) {
    gl.useProgram(floorProgram);

    const aPos  = floorProgram.aPos;
    const aNorm = floorProgram.aNorm;

    if (aPos >= 0)  gl.enableVertexAttribArray(aPos);
    if (aNorm >= 0) gl.enableVertexAttribArray(aNorm);

    gl.uniformMatrix4fv(floorProgram.uP,  false, pMatrix);
    gl.uniformMatrix4fv(floorProgram.uMV, false, mvMatrix);
    gl.uniform1f(floorProgram.uTime, gameTime);
    gl.uniform1f(floorProgram.uArenaRadius, arenaRadius);
    gl.uniform4fv(floorProgram.uColor, [0, 0.2, 0.3, 1]);

    gl.bindBuffer(gl.ARRAY_BUFFER, planeVPos);
    if (aPos >= 0) gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, planeVNorm);
    if (aNorm >= 0) gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeVIdx);
    gl.drawElements(gl.TRIANGLES, planeIdxCount, gl.UNSIGNED_SHORT, 0);

    if (aPos >= 0)  gl.disableVertexAttribArray(aPos);
    if (aNorm >= 0) gl.disableVertexAttribArray(aNorm);
}

// ── Ativar shader de objetos ─────────────────────────────────

export function useObjShader() {
    gl.useProgram(objProgram);
    if (objProgram.aPos >= 0)  gl.enableVertexAttribArray(objProgram.aPos);
    if (objProgram.aNorm >= 0) gl.enableVertexAttribArray(objProgram.aNorm);
}

// ── Desativar shader de objetos (cleanup) ────────────────────

export function endObjShader() {
    if (objProgram.aPos >= 0)  gl.disableVertexAttribArray(objProgram.aPos);
    if (objProgram.aNorm >= 0) gl.disableVertexAttribArray(objProgram.aNorm);
}

// ── Desenhar cubo (corpo, braço, pilar, sombra…) ─────────────

export function drawCube(color, scale, hitFlash = 0, neonPower = 1.0) {
    mvPush();
    mat4.scale(mvMatrix, mvMatrix, scale);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVPos);
    if (objProgram.aPos >= 0) gl.vertexAttribPointer(objProgram.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVNorm);
    if (objProgram.aNorm >= 0) gl.vertexAttribPointer(objProgram.aNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVIdx);

    // Uniforms
    gl.uniformMatrix4fv(objProgram.uP,  false, pMatrix);
    gl.uniformMatrix4fv(objProgram.uMV, false, mvMatrix);

    const nm = mat4.create();
    mat4.invert(nm, mvMatrix);
    mat4.transpose(nm, nm);
    gl.uniformMatrix4fv(objProgram.uN, false, nm);

    gl.uniform4fv(objProgram.uColor, color);
    gl.uniform1f(objProgram.uHitFlash, hitFlash);
    gl.uniform1f(objProgram.uNeonPower, neonPower);

    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    mvPop();
}

// ═════════════════════════════════════════════════════════════
// Internos: compilação e buffers
// ═════════════════════════════════════════════════════════════

function _compile(vsSrc, fsSrc) {
    function make(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }
    const vs = make(gl.VERTEX_SHADER, vsSrc);
    const fs = make(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Link error:', gl.getProgramInfoLog(prog));
    }
    return prog;
}

function _compilePrograms() {
    // ── Objetos ──────────────────────────────────────────────
    objProgram = _compile(objVert, objFrag);
    gl.useProgram(objProgram);
    objProgram.aPos       = gl.getAttribLocation(objProgram, 'aVertexPosition');
    objProgram.aNorm      = gl.getAttribLocation(objProgram, 'aVertexNormal');
    objProgram.uMV        = gl.getUniformLocation(objProgram, 'uMVMatrix');
    objProgram.uP         = gl.getUniformLocation(objProgram, 'uPMatrix');
    objProgram.uN         = gl.getUniformLocation(objProgram, 'uNMatrix');
    objProgram.uColor     = gl.getUniformLocation(objProgram, 'uColor');
    objProgram.uHitFlash  = gl.getUniformLocation(objProgram, 'uHitFlash');
    objProgram.uNeonPower = gl.getUniformLocation(objProgram, 'uNeonPower');

    // ── Chão ─────────────────────────────────────────────────
    floorProgram = _compile(floorVert, floorFrag);
    gl.useProgram(floorProgram);
    floorProgram.aPos         = gl.getAttribLocation(floorProgram, 'aVertexPosition');
    floorProgram.aNorm        = gl.getAttribLocation(floorProgram, 'aVertexNormal');
    floorProgram.uMV          = gl.getUniformLocation(floorProgram, 'uMVMatrix');
    floorProgram.uP           = gl.getUniformLocation(floorProgram, 'uPMatrix');
    floorProgram.uTime        = gl.getUniformLocation(floorProgram, 'uTime');
    floorProgram.uArenaRadius = gl.getUniformLocation(floorProgram, 'uArenaRadius');
    floorProgram.uColor       = gl.getUniformLocation(floorProgram, 'uColor');

    // ── Skybox (background) ──────────────────────────────────
    bgProgram = _compile(bgVert, bgFrag);
    if (bgProgram) {
        gl.useProgram(bgProgram);
        bgProgram.aPos        = gl.getAttribLocation(bgProgram, 'aPosition');
        bgProgram.uTime       = gl.getUniformLocation(bgProgram, 'uTime');
        bgProgram.uResolution = gl.getUniformLocation(bgProgram, 'uResolution');
    }

    // ── Barreira de força ────────────────────────────────────
    barrierProgram = _compile(barrierVert, barrierFrag);
    if (barrierProgram) {
        gl.useProgram(barrierProgram);
        barrierProgram.aPos         = gl.getAttribLocation(barrierProgram, 'aVertexPosition');
        barrierProgram.aNorm        = gl.getAttribLocation(barrierProgram, 'aVertexNormal');
        barrierProgram.aUV          = gl.getAttribLocation(barrierProgram, 'aTexCoord');
        barrierProgram.uMV          = gl.getUniformLocation(barrierProgram, 'uMVMatrix');
        barrierProgram.uP           = gl.getUniformLocation(barrierProgram, 'uPMatrix');
        barrierProgram.uTime        = gl.getUniformLocation(barrierProgram, 'uTime');
        barrierProgram.uArenaRadius = gl.getUniformLocation(barrierProgram, 'uArenaRadius');
        barrierProgram.uPlayerPos   = gl.getUniformLocation(barrierProgram, 'uPlayerPos');
        barrierProgram.uEyePos      = gl.getUniformLocation(barrierProgram, 'uEyePos');
    }
}

// ── Cube Buffers ─────────────────────────────────────────────

function _initCubeBuffers() {
    cubeVPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1,
        -1,-1,-1, -1, 1,-1,  1, 1,-1,  1,-1,-1,
        -1, 1,-1, -1, 1, 1,  1, 1, 1,  1, 1,-1,
        -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1, 1,
         1,-1,-1,  1, 1,-1,  1, 1, 1,  1,-1, 1,
        -1,-1,-1, -1,-1, 1, -1, 1, 1, -1, 1,-1,
    ]), gl.STATIC_DRAW);

    cubeVNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVNorm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
         0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
         0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
         0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
         0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
         1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]), gl.STATIC_DRAW);

    cubeVIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([
        0,1,2,   0,2,3,    4,5,6,   4,6,7,
        8,9,10,  8,10,11,  12,13,14, 12,14,15,
        16,17,18, 16,18,19, 20,21,22, 20,22,23,
    ]), gl.STATIC_DRAW);
}

// ── Fullscreen Quad (Skybox) ─────────────────────────────────

function _initQuadBuffer() {
    quadVPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,   1, -1,   -1,  1,   1,  1,
    ]), gl.STATIC_DRAW);
}

// ── Cylinder Buffers (unit: radius=1, y=0..1) ───────────────

function _initCylinderBuffers(segments) {
    const verts = [], norms = [], uvs = [], idx = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = t * Math.PI * 2;
        const x = Math.cos(angle);
        const z = Math.sin(angle);

        // Bottom vertex (y=0)
        verts.push(x, 0, z);
        norms.push(x, 0, z);
        uvs.push(t, 0);

        // Top vertex (y=1)
        verts.push(x, 1, z);
        norms.push(x, 0, z);
        uvs.push(t, 1);
    }

    for (let i = 0; i < segments; i++) {
        const b0 = i * 2;
        const t0 = i * 2 + 1;
        const b1 = (i + 1) * 2;
        const t1 = (i + 1) * 2 + 1;
        idx.push(b0, b1, t0);
        idx.push(t0, b1, t1);
    }

    cylVPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cylVPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

    cylVNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cylVNorm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norms), gl.STATIC_DRAW);

    cylVUV = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cylVUV);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

    cylVIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cylVIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    cylIdxCount = idx.length;
}

// ── Disc Buffers (bottom cap, unit radius, y=0) ──────────────

function _initDiscBuffers(segments) {
    const verts = [0, 0, 0]; // center vertex
    const norms = [0, -1, 0];

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        verts.push(Math.cos(angle), 0, Math.sin(angle));
        norms.push(0, -1, 0);
    }

    const idx = [];
    for (let i = 1; i <= segments; i++) {
        idx.push(0, i + 1, i);
    }

    discVPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, discVPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

    discVNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, discVNorm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norms), gl.STATIC_DRAW);

    discVIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, discVIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    discIdxCount = idx.length;
}

// ── Floor Plane Buffers ──────────────────────────────────────

function _initPlaneBuffers(arenaRadius) {
    const res = 50;
    const extent = arenaRadius + 5;
    const verts = [], norms = [], idx = [];

    for (let iz = 0; iz <= res; iz++) {
        for (let ix = 0; ix <= res; ix++) {
            verts.push(
                (ix / res - 0.5) * 2 * extent,
                0,
                (iz / res - 0.5) * 2 * extent
            );
            norms.push(0, 1, 0);
        }
    }
    for (let iz = 0; iz < res; iz++) {
        for (let ix = 0; ix < res; ix++) {
            const a = iz * (res + 1) + ix;
            idx.push(a, a + res + 1, a + 1);
            idx.push(a + 1, a + res + 1, a + res + 2);
        }
    }

    planeVPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, planeVPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

    planeVNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, planeVNorm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norms), gl.STATIC_DRAW);

    planeVIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeVIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    planeIdxCount = idx.length;
}
