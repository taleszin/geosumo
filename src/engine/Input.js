/**
 * Input.js — Gerencia mouse e teclado de forma centralizada.
 * Exporta estado reativo, sem polling manual.
 */

const state = {
    mouseX:  0,          // -1..1 normalizado
    mouseY:  0,
    lClick:  false,
    rClick:  false,
    keys:    {},         // { 'w': true, … }
};

let _gamePhaseGetter = null;   // callback para saber a fase do jogo
let _onMenuClick     = null;   // callback para clique no menu/win/lose

export function getInput() {
    return state;
}

/**
 * Registra listeners no document.
 * @param {Function} phaseGetter  — () => 'menu'|'fight'|'win'|'lose'
 * @param {Function} onMenuClick  — (phase) => void
 */
export function initInput(phaseGetter, onMenuClick) {
    _gamePhaseGetter = phaseGetter;
    _onMenuClick     = onMenuClick;

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mousedown', _onMouseDown);
    document.addEventListener('mouseup',   _onMouseUp);
    document.addEventListener('keydown',   _onKeyDown);
    document.addEventListener('keyup',     _onKeyUp);
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// ── Handlers internos ────────────────────────────────────────

function _onMouseMove(e) {
    state.mouseX = (e.clientX / window.innerWidth)  * 2 - 1;
    state.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
}

function _onMouseDown(e) {
    const phase = _gamePhaseGetter ? _gamePhaseGetter() : 'fight';

    if (phase !== 'fight') {
        if (_onMenuClick) _onMenuClick(phase);
        return;
    }
    if (e.button === 0) state.lClick = true;
    if (e.button === 2) state.rClick = true;
}

function _onMouseUp(e) {
    if (e.button === 0) state.lClick = false;
    if (e.button === 2) state.rClick = false;
}

function _onKeyDown(e) {
    state.keys[e.key.toLowerCase()] = true;
}

function _onKeyUp(e) {
    state.keys[e.key.toLowerCase()] = false;
}
