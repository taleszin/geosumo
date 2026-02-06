/**
 * Renderer.js — WebGL puro: setup, shader compilation, buffers, draw helpers.
 * Nenhuma dependência de engine externa.
 */
import { mat4 } from 'gl-matrix';

import floorVert from '../shaders/floor.vert';
import floorFrag from '../shaders/floor.frag';
import objVert   from '../shaders/object.vert';
import objFrag   from '../shaders/object.frag';

// ── Estado interno ───────────────────────────────────────────
let gl = null;
let objProgram  = null;
let floorProgram = null;

let cubeVPos, cubeVNorm, cubeVIdx;
let planeVPos, planeVNorm, planeVIdx;
let planeIdxCount = 0;

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

    gl.clearColor(0.02, 0.02, 0.05, 1.0);
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

// ── Internos: compilação e buffers ───────────────────────────

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
    // Objetos
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

    // Chão
    floorProgram = _compile(floorVert, floorFrag);
    gl.useProgram(floorProgram);
    floorProgram.aPos         = gl.getAttribLocation(floorProgram, 'aVertexPosition');
    floorProgram.aNorm        = gl.getAttribLocation(floorProgram, 'aVertexNormal');
    floorProgram.uMV          = gl.getUniformLocation(floorProgram, 'uMVMatrix');
    floorProgram.uP           = gl.getUniformLocation(floorProgram, 'uPMatrix');
    floorProgram.uTime        = gl.getUniformLocation(floorProgram, 'uTime');
    floorProgram.uArenaRadius = gl.getUniformLocation(floorProgram, 'uArenaRadius');
    floorProgram.uColor       = gl.getUniformLocation(floorProgram, 'uColor');
}

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
