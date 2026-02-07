/**
 * Haptic.js — Vibrações táteis para dispositivos com suporte.
 *
 * Usa navigator.vibrate() — safe no-op em browsers sem suporte.
 */

const _hasVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Vibração leve (tap feedback, extend de braço). */
export function lightPulse() {
    if (_hasVibrate) navigator.vibrate(15);
}

/** Vibração média (impacto de braço). */
export function impactPulse(intensity = 0.5) {
    if (!_hasVibrate) return;
    const ms = Math.round(20 + intensity * 60); // 20..80ms
    navigator.vibrate(ms);
}

/** Vibração pesada (dash, slam, queda da arena). */
export function heavyPulse() {
    if (_hasVibrate) navigator.vibrate([40, 30, 60]);
}

/** Vibração de alerta (borda da arena). */
export function warningPulse() {
    if (_hasVibrate) navigator.vibrate([15, 20, 15]);
}
