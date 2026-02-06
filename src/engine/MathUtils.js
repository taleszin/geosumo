/**
 * MathUtils.js — Funções auxiliares de matemática usadas em todo o projeto.
 */

export function lerp(a, b, t) {
    return (1 - t) * a + t * b;
}

export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function dist2D(a, b) {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
}

export function len2D(v) {
    return Math.sqrt(v[0] * v[0] + v[2] * v[2]);
}
