/**
 * Input.js — Sistema de Input Híbrido (Mouse/Teclado + Touch).
 *
 * Exporta um estado NORMALIZADO idêntico para ambos os modos:
 *   - moveX, moveZ  : vetor de movimento (-1..1)
 *   - aimX, aimY     : vetor de mira (-1..1)
 *   - lClick, rClick : gatilhos de soco (esquerdo / direito)
 *   - charge         : segurando charge (bool)
 *   - keys           : teclas raw (PC only, para compatibilidade)
 *   - mouseX, mouseY : alias de aim (compatibilidade)
 *
 * Detecção automática: primeiro evento touch ativa modo touch;
 * mouse/teclado reverte para PC.
 */

// ── Estado normalizado ───────────────────────────────────────
const state = {
    moveX: 0,  moveZ: 0,
    aimX:  0,  aimY:  0,
    get mouseX() { return this.aimX; },
    get mouseY() { return this.aimY; },
    lClick: false, rClick: false, charge: false,
    keys: {},
};

let _isTouchMode       = false;
let _gamePhaseGetter   = null;
let _onMenuClick       = null;

// ── Touch state interno ──────────────────────────────────────
let _moveTouch   = null;   // { id, startX, startY }
let _combatTouch = null;   // { id, startX, startY, startTime, moved, lastX, lastY }
const JOYSTICK_DEAD = 12;
const JOYSTICK_MAX  = 80;
const TAP_MAX_DIST  = 18;
const TAP_MAX_TIME  = 300;
const HOLD_TIME     = 350;

// ── Touch overlay DOM refs ───────────────────────────────────
let $touchOverlay = null;
let $joystickBase = null;
let $joystickKnob = null;
let $combatZone   = null;

// ═══════════════════════════════════════════════════════════
// API pública
// ═══════════════════════════════════════════════════════════

export function getInput() {
    if (!_isTouchMode) {
        let ix = 0, iz = 0;
        // WASD + arrow keys — mapeamento perceptual: A = esquerda na TELA, D = direita na TELA
        // (inverte ix porque o sistema de câmera/renderização tem X invertido)
        if (state.keys['w'] || state.keys['arrowup']) iz += 1;
        if (state.keys['s'] || state.keys['arrowdown']) iz -= 1;
        if (state.keys['a'] || state.keys['arrowleft']) ix += 1;   // A = esquerda visual
        if (state.keys['d'] || state.keys['arrowright']) ix -= 1;  // D = direita visual
        const len = Math.sqrt(ix * ix + iz * iz);
        if (len > 0) { ix /= len; iz /= len; }
        state.moveX = ix;
        state.moveZ = iz;
        state.charge = !!(state.keys['shift'] || state.keys[' ']);
    }
    return state;
}

export function isTouchActive() { return _isTouchMode; }

export function initInput(phaseGetter, onMenuClick) {
    _gamePhaseGetter = phaseGetter;
    _onMenuClick     = onMenuClick;

    // PC listeners
    document.addEventListener('mousemove',   _onMouseMove);
    document.addEventListener('mousedown',   _onMouseDown);
    document.addEventListener('mouseup',     _onMouseUp);
    document.addEventListener('keydown',     _onKeyDown);
    document.addEventListener('keyup',       _onKeyUp);
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Touch listeners
    document.addEventListener('touchstart',  _onTouchStart,  { passive: false });
    document.addEventListener('touchmove',   _onTouchMove,   { passive: false });
    document.addEventListener('touchend',    _onTouchEnd,    { passive: false });
    document.addEventListener('touchcancel', _onTouchEnd,    { passive: false });

    _createTouchOverlay();
}

// ═══════════════════════════════════════════════════════════
// Touch overlay DOM
// ═══════════════════════════════════════════════════════════

function _createTouchOverlay() {
    $touchOverlay = document.createElement('div');
    $touchOverlay.id = 'touch-overlay';
    $touchOverlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:15;display:none;';

    $joystickBase = document.createElement('div');
    $joystickBase.id = 'joystick-base';
    $joystickBase.style.cssText =
        'position:absolute;width:120px;height:120px;border-radius:50%;' +
        'border:2px solid rgba(0,255,255,0.25);background:rgba(0,20,30,0.18);' +
        'display:none;transform:translate(-50%,-50%);';

    $joystickKnob = document.createElement('div');
    $joystickKnob.id = 'joystick-knob';
    $joystickKnob.style.cssText =
        'position:absolute;width:44px;height:44px;border-radius:50%;' +
        'background:rgba(0,255,255,0.35);border:2px solid rgba(0,255,255,0.6);' +
        'box-shadow:0 0 12px rgba(0,255,255,0.3);' +
        'top:50%;left:50%;transform:translate(-50%,-50%);';
    $joystickBase.appendChild($joystickKnob);

    $combatZone = document.createElement('div');
    $combatZone.id = 'combat-zone';
    $combatZone.style.cssText =
        'position:absolute;right:20px;bottom:140px;width:60px;height:60px;' +
        'border-radius:50%;border:1px solid rgba(255,100,255,0.2);' +
        'background:rgba(40,0,40,0.15);display:none;';
    $combatZone.innerHTML =
        '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'font-size:1.3em;color:rgba(255,100,255,0.4);">&#x1F44A;</span>';

    $touchOverlay.appendChild($joystickBase);
    $touchOverlay.appendChild($combatZone);
    document.body.appendChild($touchOverlay);
}

function _showTouchOverlay() { if ($touchOverlay) $touchOverlay.style.display = 'block'; if ($combatZone) $combatZone.style.display = 'block'; }
function _hideTouchOverlay() { if ($touchOverlay) $touchOverlay.style.display = 'none'; }

// ═══════════════════════════════════════════════════════════
// Mode switching
// ═══════════════════════════════════════════════════════════

function _activateTouchMode() {
    if (_isTouchMode) return;
    _isTouchMode = true;
    _showTouchOverlay();
    const $pl = document.getElementById('panel-left');
    if ($pl) $pl.innerHTML =
        '<div>ESQ — MOVER</div><div>DIR — MIRAR / SOCAR</div><div>SEGURAR — INVESTIDA</div>';
}

function _activatePCMode() {
    if (!_isTouchMode) return;
    _isTouchMode = false;
    _hideTouchOverlay();
    const $pl = document.getElementById('panel-left');
    if ($pl) $pl.innerHTML =
        '<div>WASD — MOVER</div><div>MOUSE — MIRAR BRAÇOS</div>' +
        '<div>LMB — BRAÇO ESQ</div><div>RMB — BRAÇO DIR</div>' +
        '<div>SHIFT/ESPAÇO — INVESTIDA</div>';
}

// ═══════════════════════════════════════════════════════════
// PC Handlers
// ═══════════════════════════════════════════════════════════

function _onMouseMove(e) {
    if (_isTouchMode) _activatePCMode();
    state.aimX = (e.clientX / window.innerWidth)  * 2 - 1;
    state.aimY = (e.clientY / window.innerHeight) * 2 - 1;
}

function _onMouseDown(e) {
    if (_isTouchMode) _activatePCMode();
    const phase = _gamePhaseGetter ? _gamePhaseGetter() : 'fight';
    if (phase !== 'fight') { if (_onMenuClick) _onMenuClick(phase); return; }
    if (e.button === 0) state.lClick = true;
    if (e.button === 2) state.rClick = true;
}

function _onMouseUp(e) {
    if (e.button === 0) state.lClick = false;
    if (e.button === 2) state.rClick = false;
}

function _onKeyDown(e) {
    if (_isTouchMode) _activatePCMode();
    state.keys[e.key.toLowerCase()] = true;
}

function _onKeyUp(e) {
    state.keys[e.key.toLowerCase()] = false;
}

// ═══════════════════════════════════════════════════════════
// Touch Handlers
// ═══════════════════════════════════════════════════════════

function _onTouchStart(e) {
    _activateTouchMode();
    const phase = _gamePhaseGetter ? _gamePhaseGetter() : 'fight';

    if (phase !== 'fight' && phase !== 'countdown' && phase !== 'customize') {
        if (_onMenuClick) _onMenuClick(phase);
        return;
    }
    if (phase === 'customize') return; // let native taps through

    e.preventDefault();
    const halfW = window.innerWidth * 0.5;

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < halfW) {
            if (!_moveTouch) {
                _moveTouch = { id: t.identifier, startX: t.clientX, startY: t.clientY };
                $joystickBase.style.display = 'block';
                $joystickBase.style.left = t.clientX + 'px';
                $joystickBase.style.top  = t.clientY + 'px';
                _updateJoystickKnob(0, 0);
            }
        } else {
            if (!_combatTouch) {
                _combatTouch = {
                    id: t.identifier,
                    startX: t.clientX, startY: t.clientY,
                    startTime: performance.now(),
                    moved: false,
                    lastX: t.clientX, lastY: t.clientY,
                };
            }
        }
    }
}

function _onTouchMove(e) {
    const phase = _gamePhaseGetter ? _gamePhaseGetter() : 'fight';
    if (phase === 'customize') return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];

        // Movement joystick
        if (_moveTouch && t.identifier === _moveTouch.id) {
            const dx = t.clientX - _moveTouch.startX;
            const dy = t.clientY - _moveTouch.startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > JOYSTICK_DEAD) {
                const clamped = Math.min(dist, JOYSTICK_MAX);
                const norm = (clamped - JOYSTICK_DEAD) / (JOYSTICK_MAX - JOYSTICK_DEAD);
                const ang = Math.atan2(dy, dx);
                state.moveX =  Math.cos(ang) * norm;
                state.moveZ = -Math.sin(ang) * norm; // up = forward
            } else {
                state.moveX = 0; state.moveZ = 0;
            }
            const vDist = Math.min(dist, JOYSTICK_MAX);
            const vAng  = Math.atan2(dy, dx);
            _updateJoystickKnob(Math.cos(vAng) * vDist, Math.sin(vAng) * vDist);
        }

        // Combat trackpad
        if (_combatTouch && t.identifier === _combatTouch.id) {
            const dx = t.clientX - _combatTouch.lastX;
            const dy = t.clientY - _combatTouch.lastY;
            const totalDx = t.clientX - _combatTouch.startX;
            const totalDy = t.clientY - _combatTouch.startY;
            if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TAP_MAX_DIST) _combatTouch.moved = true;

            state.aimX = Math.max(-1, Math.min(1, state.aimX + dx * 0.006));
            state.aimY = Math.max(-1, Math.min(1, state.aimY + dy * 0.006));

            _combatTouch.lastX = t.clientX;
            _combatTouch.lastY = t.clientY;

            if (performance.now() - _combatTouch.startTime > HOLD_TIME && !_combatTouch.moved) {
                state.charge = true;
            }
        }
    }
}

function _onTouchEnd(e) {
    const phase = _gamePhaseGetter ? _gamePhaseGetter() : 'fight';
    if (phase === 'customize') return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];

        if (_moveTouch && t.identifier === _moveTouch.id) {
            _moveTouch = null;
            state.moveX = 0; state.moveZ = 0;
            $joystickBase.style.display = 'none';
        }

        if (_combatTouch && t.identifier === _combatTouch.id) {
            const elapsed = performance.now() - _combatTouch.startTime;
            if (state.charge) state.charge = false;

            if (!_combatTouch.moved && elapsed < TAP_MAX_TIME) {
                const rightCenter = window.innerWidth * 0.75;
                _firePunch(_combatTouch.startX < rightCenter ? 'left' : 'right');
            }
            _combatTouch = null;
        }
    }
}

// ── Punch helper ─────────────────────────────────────────────
let _punchTimerL = 0, _punchTimerR = 0;
function _firePunch(side) {
    if (side === 'left') {
        state.lClick = true;
        clearTimeout(_punchTimerL);
        _punchTimerL = setTimeout(() => { state.lClick = false; }, 200);
    } else {
        state.rClick = true;
        clearTimeout(_punchTimerR);
        _punchTimerR = setTimeout(() => { state.rClick = false; }, 200);
    }
}

// ── Joystick knob visual ─────────────────────────────────────
function _updateJoystickKnob(dx, dy) {
    if (!$joystickKnob) return;
    const m = 38;
    const cx = Math.max(-m, Math.min(m, dx));
    const cy = Math.max(-m, Math.min(m, dy));
    $joystickKnob.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
}
